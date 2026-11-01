package com.materialstudio.auth;

import com.materialstudio.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AccountService accounts;
    private final CurrentUser currentUser;
    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository contexts;
    private final SessionAuthenticationStrategy sessionStrategy;

    public AuthController(AccountService accounts, CurrentUser currentUser, AuthenticationManager authenticationManager,
            SecurityContextRepository contexts, SessionAuthenticationStrategy sessionStrategy) {
        this.accounts = accounts;
        this.currentUser = currentUser;
        this.authenticationManager = authenticationManager;
        this.contexts = contexts;
        this.sessionStrategy = sessionStrategy;
    }

    @GetMapping("/csrf")
    public CsrfResponse csrf(CsrfToken token) { return new CsrfResponse(token.getToken(), token.getHeaderName()); }

    @GetMapping("/me")
    public UserResponse me() { return UserResponse.from(accounts.requireAccount(currentUser.requireId())); }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse register(@Valid @RequestBody Credentials credentials,
            HttpServletRequest request, HttpServletResponse response) {
        requireGuest();
        accounts.register(credentials.email(), credentials.password());
        return signIn(credentials, request, response);
    }

    @PostMapping("/login")
    public UserResponse login(@Valid @RequestBody Credentials credentials,
            HttpServletRequest request, HttpServletResponse response) {
        requireGuest();
        accounts.validatePasswordBytes(credentials.password());
        return signIn(credentials, request, response);
    }

    private UserResponse signIn(Credentials credentials, HttpServletRequest request, HttpServletResponse response) {
        var authentication = authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(credentials.email(), credentials.password()));
        sessionStrategy.onAuthentication(authentication, request, response);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
        return UserResponse.from(accounts.requireAccount(((AccountPrincipal) authentication.getPrincipal()).accountId()));
    }

    private void requireGuest() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof AccountPrincipal) {
            throw new ApiException(HttpStatus.CONFLICT, "ALREADY_AUTHENTICATED", "请先退出当前账号再切换用户");
        }
    }

    public record Credentials(
            @NotBlank(message = "请输入邮箱") @Email(message = "请输入有效邮箱")
            @Size(max = 254, message = "邮箱长度不能超过 254 个字符") String email,
            @NotBlank(message = "请输入密码") @Size(min = 8, max = 72, message = "密码长度需为 8—72 个字符") String password) {
        public Credentials {
            if (email != null) email = email.strip().toLowerCase(Locale.ROOT);
        }
    }

    public record CsrfResponse(String token, String headerName) {}

    public record UserResponse(long id, String email, Instant createdAt) {
        static UserResponse from(AccountRecord account) {
            return new UserResponse(account.id(), account.email(), account.createdAt());
        }
    }
}
