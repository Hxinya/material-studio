package com.materialstudio.task;

public enum TaskStage {
    MATERIAL_CHECK("素材检查"), SIMULATE_GENERATION("模拟生成"), FINALIZE_RESULT("结果整理");
    private final String label;
    TaskStage(String label) { this.label = label; }
    public String label() { return label; }
    public int index() { return ordinal() + 1; }
    public int getIndex() { return index(); }
}
