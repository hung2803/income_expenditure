-- Foundation metadata only. Account and finance tables belong to later phases.
CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

INSERT INTO app_metadata (key, value) VALUES ('schema_version', '1');
