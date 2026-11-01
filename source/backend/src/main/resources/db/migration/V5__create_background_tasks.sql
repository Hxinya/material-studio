CREATE TABLE task_jobs (
    sequence BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    id CHAR(36) NOT NULL UNIQUE,
    account_id BIGINT NOT NULL,
    template_id VARCHAR(64) NOT NULL,
    template_title VARCHAR(120) NOT NULL,
    status VARCHAR(16) NOT NULL,
    current_stage VARCHAR(32),
    fail_stage VARCHAR(32),
    check_delay_ms INT NOT NULL,
    generate_delay_ms INT NOT NULL,
    finalize_delay_ms INT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    started_at TIMESTAMP(6),
    finished_at TIMESTAMP(6),
    error_code VARCHAR(64),
    error_message VARCHAR(255),
    result_name VARCHAR(64),
    CONSTRAINT task_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id),
    CONSTRAINT task_template_fk FOREIGN KEY (template_id) REFERENCES templates(id),
    INDEX task_queue_ix (status, sequence),
    INDEX task_owner_ix (account_id, created_at)
);

CREATE TABLE task_stages (
    task_id CHAR(36) NOT NULL,
    stage_index INT NOT NULL,
    name VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    started_at TIMESTAMP(6),
    finished_at TIMESTAMP(6),
    error_message VARCHAR(255),
    PRIMARY KEY (task_id, stage_index),
    CONSTRAINT stage_task_fk FOREIGN KEY (task_id) REFERENCES task_jobs(id) ON DELETE CASCADE
);

-- 文件复制到任务专属目录；素材 ID 仅作来源记录，不对可被替换的草稿建立外键。
CREATE TABLE task_inputs (
    task_id CHAR(36) NOT NULL,
    slot_index INT NOT NULL,
    material_id CHAR(36) NOT NULL,
    revision BIGINT NOT NULL,
    original_name VARCHAR(180) NOT NULL,
    mime_type VARCHAR(32) NOT NULL,
    size_bytes BIGINT NOT NULL,
    width INT NOT NULL,
    height INT NOT NULL,
    PRIMARY KEY (task_id, slot_index),
    CONSTRAINT input_task_fk FOREIGN KEY (task_id) REFERENCES task_jobs(id) ON DELETE CASCADE
);
