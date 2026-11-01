package com.materialstudio.auth;

import com.materialstudio.common.ApiException;
import java.nio.charset.StandardCharsets;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountService {
    private final AccountMapper mapper;
    private final PasswordEncoder passwordEncoder;

    public AccountService(AccountMapper mapper, PasswordEncoder passwordEncoder) {
        this.mapper = mapper;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public void register(String email, String password) {
        validatePasswordBytes(password);
        try {
            mapper.insert(email, passwordEncoder.encode(password));
        } catch (DuplicateKeyException exception) {
            throw new ApiException(HttpStatus.CONFLICT, "EMAIL_EXISTS", "该邮箱已注册，请直接登录");
        }
    }

    public AccountRecord requireAccount(long id) {
        var account = mapper.findById(id);
        if (account == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "登录已失效，请重新登录");
        return account;
    }

    public void validatePasswordBytes(String password) {
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PASSWORD_TOO_LONG", "密码的 UTF-8 长度不能超过 72 字节");
        }
    }
}
