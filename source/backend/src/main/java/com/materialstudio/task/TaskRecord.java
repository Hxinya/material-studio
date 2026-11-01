package com.materialstudio.task;

import java.time.Instant;

public record TaskRecord(long sequence, String id, long accountId, String templateId, String templateTitle,
        String status, TaskStage currentStage, TaskStage failStage, int checkDelayMs, int generateDelayMs,
        int finalizeDelayMs, Instant createdAt, Instant startedAt, Instant finishedAt,
        String errorCode, String errorMessage, String resultName) {
    public boolean terminal() { return status.equals("SUCCEEDED") || status.equals("FAILED"); }
    public int delay(TaskStage stage) {
        return switch (stage) { case MATERIAL_CHECK -> checkDelayMs; case SIMULATE_GENERATION -> generateDelayMs; case FINALIZE_RESULT -> finalizeDelayMs; };
    }
}
