CREATE TABLE application_metadata (
    id TINYINT NOT NULL PRIMARY KEY,
    schema_version VARCHAR(32) NOT NULL,
    initialized_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO application_metadata (id, schema_version) VALUES (1, '1');
