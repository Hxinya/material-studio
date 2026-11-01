package com.materialstudio.task;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;

public record TaskRequest(@NotBlank @Pattern(regexp = "[a-z0-9-]{1,64}") String templateId,
        @NotNull @Size(min = 1, max = 2) List<@NotNull @Valid Input> inputs, @Valid Simulation simulation) {
    public record Input(@Min(1) @Max(2) int slot, @NotBlank @Pattern(regexp = "[a-f0-9-]{36}") String materialId,
            @NotNull @Min(0) Long revision) {}
    public record Simulation(@Min(0) @Max(60000) Integer checkDelayMs,
            @Min(0) @Max(60000) Integer generateDelayMs, @Min(0) @Max(60000) Integer finalizeDelayMs,
            TaskStage failStage) {}
}
