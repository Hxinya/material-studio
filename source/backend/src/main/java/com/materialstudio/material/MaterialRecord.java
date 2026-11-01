package com.materialstudio.material;

import java.time.Instant;

public record MaterialRecord(long accountId, String templateId, int slotIndex, long revision,
        String materialId, String storageName, String originalName, String mimeType,
        Long sizeBytes, Integer width, Integer height, Instant updatedAt) {}
