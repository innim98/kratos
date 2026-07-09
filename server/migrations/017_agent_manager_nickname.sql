-- Manager flag (toggled by a dashboard user) and nickname (set by a manager agent).
ALTER TABLE agents ADD COLUMN is_manager INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN nickname TEXT DEFAULT NULL;
