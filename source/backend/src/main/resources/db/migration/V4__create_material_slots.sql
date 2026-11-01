-- 一个账号、模板、上传位只有一条草稿。空位也保留 revision，阻止迟到的上传复活已移除图片。
CREATE TABLE material_slots (
    account_id BIGINT NOT NULL,
    template_id VARCHAR(64) NOT NULL,
    slot_index INT NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    material_id CHAR(36),
    storage_name VARCHAR(64),
    original_name VARCHAR(180),
    mime_type VARCHAR(32),
    size_bytes BIGINT,
    width INT,
    height INT,
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (account_id, template_id, slot_index),
    CONSTRAINT material_id_uk UNIQUE (material_id),
    CONSTRAINT material_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id),
    CONSTRAINT material_template_fk FOREIGN KEY (template_id) REFERENCES templates(id),
    CONSTRAINT material_slot_positive CHECK (slot_index >= 1)
);
