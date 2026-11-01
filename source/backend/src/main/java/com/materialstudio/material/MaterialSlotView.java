package com.materialstudio.material;

import java.time.Instant;

public record MaterialSlotView(int slot, long revision, MaterialView material) {
    static MaterialSlotView from(int slot, MaterialRecord record) {
        if (record == null) return new MaterialSlotView(slot, 0, null);
        return new MaterialSlotView(slot, record.revision(), record.materialId() == null ? null :
                new MaterialView(record.materialId(), record.originalName(), record.mimeType(), record.sizeBytes(),
                        record.width(), record.height(), "/api/materials/" + record.materialId() + "/content", record.updatedAt()));
    }

    public record MaterialView(String id, String originalName, String mimeType, long sizeBytes,
            int width, int height, String contentUrl, Instant updatedAt) {}
}
