package com.materialstudio.catalog;

import java.util.List;

public record TemplateView(String id, String categoryId, String categoryName, String title,
        String description, String coverUrl, int requiredImageCount,
        List<String> acceptedMimeTypes, long maxFileSizeBytes) {
    static TemplateView from(TemplateRecord record) {
        // 固定的产品素材规则集中在 Java 定义，上传模块也必须执行相同的服务端校验。
        return new TemplateView(record.id(), record.categoryId(), record.categoryName(), record.title(),
                record.description(), record.coverUrl(), record.requiredImageCount(),
                List.of("image/jpeg", "image/png"), 5L * 1024 * 1024);
    }
}
