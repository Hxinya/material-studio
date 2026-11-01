package com.materialstudio.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

/** 用真实 HTTP Cookie 和真实 MySQL 验证会话，避免 MockHttpSession 掩盖 JDBC 持久化问题。 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthIntegrationTest extends com.materialstudio.support.MySqlIntegrationSupport {
    private static final String PASSWORD = "Module2-test-password";
    @LocalServerPort private int port;
    @Autowired private ObjectMapper json;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PasswordEncoder encoder;
    private final List<String> createdEmails = new ArrayList<>();

    private String email() {
        String email = "test-" + UUID.randomUUID() + "@example.com";
        createdEmails.add(email);
        return email;
    }

    @AfterEach
    void cleanUpOwnedAccounts() {
        for (String email : createdEmails) {
            jdbc.update("DELETE FROM SPRING_SESSION WHERE PRINCIPAL_NAME = ?", email);
            jdbc.update("DELETE FROM accounts WHERE email = ?", email);
        }
    }

    @Test
    void anonymousPersonalEndpointReturnsJson401WhileHealthRemainsPublic() throws Exception {
        var client = new Client();
        assertThat(client.get("/api/auth/me").statusCode()).isEqualTo(401);
        assertThat(client.get("/api/health").statusCode()).isEqualTo(200);
        assertThat(body(client.get("/api/auth/me")).get("code").asText()).isEqualTo("UNAUTHENTICATED");
    }

    @Test
    void registerLogsInPersistsSessionAndNeverReturnsOrStoresPlainPassword() throws Exception {
        var client = new Client();
        String email = email();
        var response = client.post("register", email, PASSWORD);
        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(body(response).get("email").asText()).isEqualTo(email);
        assertThat(body(response).has("password")).isFalse();
        assertThat(body(response).has("passwordHash")).isFalse();
        assertThat(body(client.get("/api/auth/me")).get("id")).isEqualTo(body(response).get("id"));
        String hash = jdbc.queryForObject("SELECT password_hash FROM accounts WHERE email = ?", String.class, email);
        assertThat(hash).startsWith("$2").isNotEqualTo(PASSWORD);
        assertThat(encoder.matches(PASSWORD, hash)).isTrue();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM SPRING_SESSION WHERE PRINCIPAL_NAME = ?", Integer.class, email)).isEqualTo(1);
        var attributes = jdbc.queryForList("SELECT a.ATTRIBUTE_BYTES FROM SPRING_SESSION_ATTRIBUTES a JOIN SPRING_SESSION s ON s.PRIMARY_ID = a.SESSION_PRIMARY_ID WHERE s.PRINCIPAL_NAME = ?", byte[].class, email);
        assertThat(attributes).isNotEmpty();
        for (byte[] attribute : attributes) {
            assertThat(new String(attribute, StandardCharsets.ISO_8859_1)).doesNotContain(hash).doesNotContain(PASSWORD);
        }
        assertThat(response.headers().allValues("set-cookie").toString()).contains("HttpOnly", "SameSite=Lax", "Path=/");
    }

    @Test
    void registrationRotatesSessionIdAndInvalidatesPreLoginCsrf() throws Exception {
        var client = new Client();
        var csrf = body(client.get("/api/auth/csrf"));
        String oldCookie = client.cookie();
        assertThat(client.postWithToken("register", email(), PASSWORD, csrf.get("token").asText()).statusCode()).isEqualTo(201);
        assertThat(client.cookie()).isNotEqualTo(oldCookie);
        assertThat(new Client().getWithCookie("/api/auth/me", oldCookie).statusCode()).isEqualTo(401);
        assertThat(client.postWithToken("logout", null, null, csrf.get("token").asText()).statusCode()).isEqualTo(403);
        assertThat(client.get("/api/auth/me").statusCode()).isEqualTo(200);
        assertThat(client.post("logout", null, null).statusCode()).isEqualTo(204);
    }

    @Test
    void duplicateEmailIsNormalizedAndReportedAsConflict() throws Exception {
        String email = email();
        assertThat(new Client().post("register", email, PASSWORD).statusCode()).isEqualTo(201);
        var response = new Client().post("register", "  " + email.toUpperCase(java.util.Locale.ROOT) + "  ", PASSWORD);
        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(body(response).get("code").asText()).isEqualTo("EMAIL_EXISTS");
    }

    @Test
    void loginUsesPasswordAndFailuresDoNotCreateAuthenticatedSession() throws Exception {
        String email = email();
        new Client().post("register", email, PASSWORD);
        var client = new Client();
        assertThat(client.post("login", email, "wrong-password").statusCode()).isEqualTo(401);
        assertThat(client.get("/api/auth/me").statusCode()).isEqualTo(401);
        assertThat(client.post("login", email, PASSWORD).statusCode()).isEqualTo(200);
        assertThat(body(client.get("/api/auth/me")).get("email").asText()).isEqualTo(email);
    }

    @Test
    void invalidEmailShortPasswordAndOverlongUtf8PasswordAreRejected() throws Exception {
        var invalid = new Client().post("register", "invalid", "short");
        assertThat(invalid.statusCode()).isEqualTo(400);
        assertThat(body(invalid).get("fields").has("email")).isTrue();
        assertThat(body(invalid).get("fields").has("password")).isTrue();
        assertThat(new Client().post("register", email(), "密".repeat(25)).statusCode()).isEqualTo(400);
    }

    @Test
    void csrfProtectsRegistrationLoginAndLogout() throws Exception {
        var client = new Client();
        String email = email();
        assertThat(client.postWithToken("register", email, PASSWORD, null).statusCode()).isEqualTo(403);
        assertThat(client.postWithToken("login", email, PASSWORD, "invalid-token").statusCode()).isEqualTo(403);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM accounts WHERE email = ?", Integer.class, email)).isZero();
        assertThat(client.post("register", email, PASSWORD).statusCode()).isEqualTo(201);
        assertThat(client.postWithToken("logout", null, null, null).statusCode()).isEqualTo(403);
        assertThat(client.get("/api/auth/me").statusCode()).isEqualTo(200);
    }

    @Test
    void twoCookieJarsStayIsolatedAndClientUserIdCannotSwitchIdentity() throws Exception {
        var alice = new Client();
        var bob = new Client();
        var a = body(alice.post("register", email(), PASSWORD));
        var b = body(bob.post("register", email(), PASSWORD));
        assertThat(a.get("id")).isNotEqualTo(b.get("id"));
        assertThat(body(alice.get("/api/auth/me?userId=" + b.get("id").asLong())).get("id")).isEqualTo(a.get("id"));
        assertThat(body(bob.get("/api/auth/me?userId=" + a.get("id").asLong())).get("id")).isEqualTo(b.get("id"));
    }

    @Test
    void logoutInvalidatesOldSessionAndDoesNotAffectOtherUsers() throws Exception {
        var alice = new Client();
        var bob = new Client();
        alice.post("register", email(), PASSWORD);
        bob.post("register", email(), PASSWORD);
        String cookie = alice.cookie();
        assertThat(alice.post("logout", null, null).statusCode()).isEqualTo(204);
        assertThat(alice.get("/api/auth/me").statusCode()).isEqualTo(401);
        assertThat(new Client().getWithCookie("/api/auth/me", cookie).statusCode()).isEqualTo(401);
        assertThat(bob.get("/api/auth/me").statusCode()).isEqualTo(200);
    }

    @Test
    void authenticatedAccountMustLogoutBeforeChangingIdentity() throws Exception {
        var client = new Client();
        String email = email();
        client.post("register", email, PASSWORD);
        assertThat(client.post("login", email, PASSWORD).statusCode()).isEqualTo(409);
        assertThat(client.post("register", email(), PASSWORD).statusCode()).isEqualTo(409);
        assertThat(body(client.get("/api/auth/me")).get("email").asText()).isEqualTo(email);
    }

    @Test
    void expiredSessionCannotReadPersonalData() throws Exception {
        var client = new Client();
        String email = email();
        client.post("register", email, PASSWORD);
        jdbc.update("UPDATE SPRING_SESSION SET LAST_ACCESS_TIME = 0, EXPIRY_TIME = 0 WHERE PRINCIPAL_NAME = ?", email);
        assertThat(client.get("/api/auth/me").statusCode()).isEqualTo(401);
    }

    @Test
    void longValidEmailCanBePersistedAsSessionPrincipal() throws Exception {
        String email = "test-" + UUID.randomUUID() + "@" + "sub".repeat(20) + ".example.com";
        createdEmails.add(email);
        var client = new Client();
        assertThat(email.length()).isGreaterThan(100);
        assertThat(client.post("register", email, PASSWORD).statusCode()).isEqualTo(201);
        assertThat(body(client.get("/api/auth/me")).get("email").asText()).isEqualTo(email);
    }

    private JsonNode body(HttpResponse<String> response) throws Exception { return json.readTree(response.body()); }

    private class Client {
        final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        final HttpClient http = HttpClient.newBuilder().cookieHandler(cookies).build();

        HttpResponse<String> get(String path) throws Exception {
            return http.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET().build(), HttpResponse.BodyHandlers.ofString());
        }

        HttpResponse<String> getWithCookie(String path, String cookie) throws Exception {
            return http.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).header("Cookie", cookie).GET().build(), HttpResponse.BodyHandlers.ofString());
        }

        String cookie() {
            return cookies.getCookieStore().getCookies().stream().filter(cookie -> cookie.getName().equals("MATERIAL_SESSION"))
                    .map(cookie -> cookie.getName() + "=" + cookie.getValue()).findFirst().orElseThrow();
        }

        HttpResponse<String> post(String action, String email, String password) throws Exception {
            return postWithToken(action, email, password, body(get("/api/auth/csrf")).get("token").asText());
        }

        HttpResponse<String> postWithToken(String action, String email, String password, String token) throws Exception {
            var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/auth/" + action))
                    .header("Content-Type", "application/json");
            if (token != null) request.header("X-CSRF-TOKEN", token);
            return http.send(request.POST(HttpRequest.BodyPublishers.ofString(email == null ? "{}" : json.writeValueAsString(Map.of("email", email, "password", password)))).build(), HttpResponse.BodyHandlers.ofString());
        }
    }
}
