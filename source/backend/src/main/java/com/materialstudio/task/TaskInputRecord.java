package com.materialstudio.task;

public record TaskInputRecord(String taskId, int slotIndex, String materialId, long revision,
        String originalName, String mimeType, long sizeBytes, int width, int height) {}
