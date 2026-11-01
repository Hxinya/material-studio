package com.materialstudio.auth;

import java.time.Instant;

public record AccountRecord(long id, String email, String passwordHash, Instant createdAt) {}
