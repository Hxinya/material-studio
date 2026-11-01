package com.materialstudio.task;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("app.tasks")
public record TaskSettings(@Min(0) @Max(60000) int checkDelayMs,
        @Min(0) @Max(60000) int generateDelayMs, @Min(0) @Max(60000) int finalizeDelayMs,
        boolean simulationControlsEnabled, boolean workerEnabled,
        @Min(10) @Max(5000) int pollIntervalMs) {}
