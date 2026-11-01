package com.materialstudio.auth;

import java.io.Serial;
import java.util.List;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;

/** 会话主体。User 的 CredentialsContainer 会在认证后清除密码哈希。 */
public class AccountPrincipal extends User {
    @Serial
    private static final long serialVersionUID = 1L;
    private final long accountId;

    public AccountPrincipal(AccountRecord account) {
        super(account.email(), account.passwordHash(), List.of(new SimpleGrantedAuthority("ROLE_USER")));
        this.accountId = account.id();
    }

    public long accountId() { return accountId; }
}
