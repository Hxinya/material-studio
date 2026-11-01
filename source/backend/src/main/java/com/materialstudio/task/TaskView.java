package com.materialstudio.task;

import java.time.Instant;
import java.util.List;

public record TaskView(String id, String templateId, String templateTitle, String status, TaskStage currentStage,
        Instant createdAt, Instant startedAt, Instant finishedAt, String errorCode, String errorMessage,
        String resultUrl, String resultKind, List<Stage> stages, List<Input> inputs) {
    public static TaskView from(TaskRecord task, List<TaskStageRecord> stages, List<TaskInputRecord> inputs) {
        return new TaskView(task.id(), task.templateId(), task.templateTitle(), task.status(), task.currentStage(),
                task.createdAt(), task.startedAt(), task.finishedAt(), task.errorCode(), task.errorMessage(),
                task.status().equals("SUCCEEDED") ? "/api/tasks/" + task.id() + "/result" : null,
                task.status().equals("SUCCEEDED") ? "SIMULATED_PRESET" : null,
                stages.stream().map(s -> new Stage(s.stageIndex(), s.name(), s.name().label(), s.status(),
                        s.startedAt(), s.finishedAt(), s.errorMessage())).toList(),
                inputs.stream().map(i -> new Input(i.slotIndex(), i.materialId(), i.revision(), i.originalName(),
                        i.mimeType(), i.sizeBytes(), i.width(), i.height(),
                        "/api/tasks/" + task.id() + "/inputs/" + i.slotIndex())).toList());
    }
    public record Stage(int index, TaskStage name, String label, String status, Instant startedAt,
            Instant finishedAt, String errorMessage) {}
    public record Input(int slot, String materialId, long revision, String originalName, String mimeType,
            long sizeBytes, int width, int height, String contentUrl) {}
}
