package com.materialstudio.auth;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface AccountMapper {
    @Select("SELECT id, email, password_hash, created_at FROM accounts WHERE email = #{email}")
    AccountRecord findByEmail(String email);

    @Select("SELECT id, email, password_hash, created_at FROM accounts WHERE id = #{id}")
    AccountRecord findById(long id);

    @Insert("INSERT INTO accounts (email, password_hash) VALUES (#{email}, #{passwordHash})")
    void insert(@Param("email") String email, @Param("passwordHash") String passwordHash);
}
