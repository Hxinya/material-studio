package com.materialstudio.catalog;

public record TemplateRecord(String id, String categoryId, String categoryName, String title,
        String description, String coverUrl, int requiredImageCount) {}
