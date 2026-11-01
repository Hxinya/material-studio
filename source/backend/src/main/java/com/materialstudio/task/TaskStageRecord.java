package com.materialstudio.task;

import java.time.Instant;

public record TaskStageRecord(String taskId, int stageIndex, TaskStage name, String status,
        Instant startedAt, Instant finishedAt, String errorMessage) {}
