package com.materialstudio.material;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** 真实 HTTP multipart、Cookie/CSRF、MySQL 和临时目录，不使用 MockMultipart 掩盖容器上传限制。 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class MaterialIntegrationTest extends com.materialstudio.support.MySqlIntegrationSupport {
    static final Path DIRECTORY;
    static { try { DIRECTORY = Files.createTempDirectory("material-test-"); } catch (Exception exception) { throw new ExceptionInInitializerError(exception); } }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.material-directory", DIRECTORY::toString);
    }
    @LocalServerPort int port;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    final List<String> emails = new ArrayList<>();

    @AfterEach void cleanup() throws Exception {
        for (String email : emails) {
            jdbc.update("DELETE FROM material_slots WHERE account_id IN (SELECT id FROM accounts WHERE email = ?)", email);
            jdbc.update("DELETE FROM SPRING_SESSION WHERE PRINCIPAL_NAME = ?", email);
            jdbc.update("DELETE FROM accounts WHERE email = ?", email);
        }
        try (var files = Files.list(DIRECTORY)) { for (Path file : files.toList()) Files.deleteIfExists(file); }
    }

    @Test void anonymousAccessIsProtectedAndMutationsRequireCsrf() throws Exception {
        var guest = new Client(false);
        assertThat(guest.get("/api/templates/travel-duo/materials").statusCode()).isEqualTo(401);
        assertThat(guest.get("/api/materials/00000000-0000-0000-0000-000000000000/content").statusCode()).isEqualTo(401);
        var owner = new Client(true);
        assertThat(owner.upload("travel-duo", 1, 0, image("png"), "image/png", 1, false).statusCode()).isEqualTo(403);
        assertThat(files()).isZero();
    }

    @Test void uploadRestoresFromMysqlAndProtectedContentMatchesTheOriginalBytes() throws Exception {
        var owner = new Client(true);
        byte[] png = image("png"), jpeg = image("jpeg");
        var first = body(owner.upload("travel-duo", 1, 0, png, "image/png", 1, true));
        assertThat(first.get("revision").asInt()).isEqualTo(1);
        var material = first.get("material");
        assertThat(material.get("width").asInt()).isEqualTo(4);
        assertThat(material.get("height").asInt()).isEqualTo(3);
        assertThat(material.has("storageName")).isFalse();
        assertThat(owner.get(material.get("contentUrl").asText()).body()).containsExactly(png);
        var response = owner.get(material.get("contentUrl").asText());
        assertThat(response.headers().firstValue("cache-control").orElse("")).contains("no-store");
        assertThat(response.headers().firstValue("content-type").orElse("")).isEqualTo("image/png");
        assertThat(owner.upload("travel-duo", 2, 0, jpeg, "image/jpeg", 1, true).statusCode()).isEqualTo(200);
        var restored = body(owner.get("/api/templates/travel-duo/materials")).get("items");
        assertThat(restored.size()).isEqualTo(2);
        assertThat(restored.get(0).get("material").get("id")).isEqualTo(material.get("id"));
        assertThat(restored.get(1).get("material").get("mimeType").asText()).isEqualTo("image/jpeg");
        assertThat(files()).isEqualTo(2);
    }

    @Test void replacementRemovalAndStaleRevisionsCannotResurrectOldImages() throws Exception {
        var owner = new Client(true);
        var first = body(owner.upload("paper-postcard", 1, 0, image("png"), "image/png", 1, true));
        String oldUrl = first.get("material").get("contentUrl").asText();
        var second = body(owner.upload("paper-postcard", 1, 1, image("jpeg"), "image/jpeg", 1, true));
        assertThat(second.get("revision").asInt()).isEqualTo(2);
        assertThat(owner.get(oldUrl).statusCode()).isEqualTo(404);
        assertThat(owner.upload("paper-postcard", 1, 1, image("png"), "image/png", 1, true).statusCode()).isEqualTo(409);
        assertThat(owner.remove("paper-postcard", 1, 1).statusCode()).isEqualTo(409);
        assertThat(files()).isEqualTo(1);
        var removed = body(owner.remove("paper-postcard", 1, 2));
        assertThat(removed.get("revision").asInt()).isEqualTo(3);
        assertThat(removed.get("material").isNull()).isTrue();
        assertThat(owner.get(second.get("material").get("contentUrl").asText()).statusCode()).isEqualTo(404);
        assertThat(owner.upload("paper-postcard", 1, 2, image("png"), "image/png", 1, true).statusCode()).isEqualTo(409);
        assertThat(files()).isZero();
        assertThat(owner.remove("travel-duo", 1, 0).statusCode()).isEqualTo(200);
        assertThat(owner.upload("travel-duo", 1, 0, image("png"), "image/png", 1, true).statusCode()).isEqualTo(409);
    }

    @Test void anotherAccountCannotReadOrRemoveAnOwnersImage() throws Exception {
        var owner = new Client(true);
        var other = new Client(true);
        var uploaded = body(owner.upload("paper-postcard", 1, 0, image("png"), "image/png", 1, true));
        assertThat(other.get(uploaded.get("material").get("contentUrl").asText()).statusCode()).isEqualTo(404);
        assertThat(body(other.get("/api/templates/paper-postcard/materials")).get("items").get(0).get("material").isNull()).isTrue();
        assertThat(other.remove("paper-postcard", 1, 0).statusCode()).isEqualTo(200);
        assertThat(owner.get(uploaded.get("material").get("contentUrl").asText()).statusCode()).isEqualTo(200);
        assertThat(owner.get("/api/materials/00000000-0000-0000-0000-000000000000/content").statusCode()).isEqualTo(404);
    }

    @Test void validatesRealFormatCorruptionEmptyCountAndTemplateSlotLimits() throws Exception {
        var owner = new Client(true);
        byte[] png = image("png");
        assertCode(owner.upload("paper-postcard", 1, 0, "fake png".getBytes(), "image/png", 1, true), 400, "INVALID_IMAGE");
        assertCode(owner.upload("paper-postcard", 1, 0, png, "image/jpeg", 1, true), 400, "INVALID_IMAGE_TYPE");
        assertCode(owner.upload("paper-postcard", 1, 0, image("gif"), "image/png", 1, true), 400, "INVALID_IMAGE_TYPE");
        assertCode(owner.upload("paper-postcard", 1, 0, Arrays.copyOf(png, 35), "image/png", 1, true), 400, "INVALID_IMAGE");
        assertCode(owner.upload("paper-postcard", 1, 0, new byte[0], "image/png", 1, true), 400, "EMPTY_FILE");
        assertCode(owner.upload("paper-postcard", 1, 0, png, "image/png", 2, true), 400, "INVALID_FILE_COUNT");
        assertCode(owner.upload("paper-postcard", 2, 0, png, "image/png", 1, true), 400, "INVALID_SLOT");
        assertCode(owner.upload("travel-duo", 0, 0, png, "image/png", 1, true), 400, "INVALID_SLOT");
        assertCode(owner.upload("missing", 1, 0, png, "image/png", 1, true), 404, "TEMPLATE_NOT_FOUND");
        assertThat(files()).isZero();
    }

    @Test void enforcesFiveMibBoundaryAndServletLimitWithJsonErrors() throws Exception {
        var owner = new Client(true);
        byte[] exact = Arrays.copyOf(image("png"), (int) MaterialStorage.MAX_BYTES);
        assertThat(owner.upload("paper-postcard", 1, 0, exact, "image/png", 1, true).statusCode()).isEqualTo(200);
        assertCode(owner.upload("paper-postcard", 1, 1, Arrays.copyOf(exact, exact.length + 1), "image/png", 1, true), 413, "FILE_TOO_LARGE");
        assertCode(owner.upload("paper-postcard", 1, 1, new byte[6 * 1024 * 1024 + 1], "image/png", 1, true), 413, "FILE_TOO_LARGE");
        assertThat(files()).isEqualTo(1);
    }

    @Test void concurrentReplacementsHaveExactlyOneWinner() throws Exception {
        var owner = new Client(true);
        String token = owner.csrf();
        byte[] png = image("png");
        var a = CompletableFuture.supplyAsync(() -> { try { return owner.uploadWithToken("travel-duo", 1, 0, png, "image/png", 1, token); } catch (Exception e) { throw new RuntimeException(e); } });
        var b = CompletableFuture.supplyAsync(() -> { try { return owner.uploadWithToken("travel-duo", 1, 0, png, "image/png", 1, token); } catch (Exception e) { throw new RuntimeException(e); } });
        assertThat(List.of(a.get().statusCode(), b.get().statusCode())).containsExactlyInAnyOrder(200, 409);
        assertThat(body(owner.get("/api/templates/travel-duo/materials")).get("items").get(0).get("revision").asInt()).isEqualTo(1);
        assertThat(files()).isEqualTo(1);
    }

    @Test void rejectsExcessivePixelDimensionsBeforeDecoding() throws Exception {
        var owner = new Client(true);
        var output = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(12001, 1, BufferedImage.TYPE_INT_RGB), "png", output);
        assertCode(owner.upload("paper-postcard", 1, 0, output.toByteArray(), "image/png", 1, true), 400, "IMAGE_DIMENSIONS_EXCEEDED");
        assertThat(files()).isZero();
    }

    byte[] image(String format) throws Exception {
        var output = new ByteArrayOutputStream();
        var image = new BufferedImage(4, 3, BufferedImage.TYPE_INT_RGB);
        image.setRGB(0, 0, 0x74a42f);
        ImageIO.write(image, format, output);
        return output.toByteArray();
    }
    long files() throws Exception { try (var files = Files.list(DIRECTORY)) { return files.count(); } }
    JsonNode body(HttpResponse<byte[]> response) throws Exception { return json.readTree(response.body()); }
    void assertCode(HttpResponse<byte[]> response, int status, String code) throws Exception {
        assertThat(response.statusCode()).as(new String(response.body(), StandardCharsets.UTF_8)).isEqualTo(status);
        assertThat(body(response).get("code").asText()).isEqualTo(code);
    }

    class Client {
        final HttpClient http = HttpClient.newBuilder().cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build();
        Client(boolean register) throws Exception {
            if (register) {
                String email = "material-" + UUID.randomUUID() + "@example.com";
                emails.add(email);
                var response = send(HttpRequest.newBuilder(uri("/api/auth/register")).header("Content-Type", "application/json")
                        .header("X-CSRF-TOKEN", csrf()).POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(java.util.Map.of("email", email, "password", "Module4-test-password")))));
                assertThat(response.statusCode()).isEqualTo(201);
            }
        }
        URI uri(String path) { return URI.create("http://localhost:" + port + path); }
        HttpResponse<byte[]> send(HttpRequest.Builder builder) throws Exception { return http.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray()); }
        HttpResponse<byte[]> get(String path) throws Exception { return send(HttpRequest.newBuilder(uri(path)).GET()); }
        String csrf() throws Exception { return body(get("/api/auth/csrf")).get("token").asText(); }
        HttpResponse<byte[]> upload(String template, int slot, long revision, byte[] bytes, String mime, int count, boolean csrf) throws Exception {
            return uploadWithToken(template, slot, revision, bytes, mime, count, csrf ? csrf() : null);
        }
        HttpResponse<byte[]> uploadWithToken(String template, int slot, long revision, byte[] bytes, String mime, int count, String token) throws Exception {
            String boundary = "material-boundary-" + UUID.randomUUID();
            var output = new ByteArrayOutputStream();
            output.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"expectedRevision\"\r\n\r\n" + revision + "\r\n").getBytes(StandardCharsets.UTF_8));
            for (int i = 0; i < count; i++) {
                output.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"test.png\"\r\nContent-Type: " + mime + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                output.write(bytes); output.write("\r\n".getBytes(StandardCharsets.UTF_8));
            }
            output.write(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
            var builder = HttpRequest.newBuilder(uri("/api/templates/" + template + "/materials/" + slot)).header("Content-Type", "multipart/form-data; boundary=" + boundary);
            if (token != null) builder.header("X-CSRF-TOKEN", token);
            return send(builder.PUT(HttpRequest.BodyPublishers.ofByteArray(output.toByteArray())));
        }
        HttpResponse<byte[]> remove(String template, int slot, long revision) throws Exception {
            return send(HttpRequest.newBuilder(uri("/api/templates/" + template + "/materials/" + slot + "?expectedRevision=" + revision)).header("X-CSRF-TOKEN", csrf()).DELETE());
        }
    }
}
