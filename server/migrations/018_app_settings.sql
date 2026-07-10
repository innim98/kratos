-- Generic key-value store for app-wide settings.
CREATE TABLE app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
-- Max agents a manager may spawn per folder (see phase-12).
INSERT INTO app_settings (key, value) VALUES ('max_agents_per_folder', '4');
