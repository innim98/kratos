-- Agent sort order
ALTER TABLE agents ADD COLUMN sort_order INTEGER DEFAULT 0;

-- Initialize sort_order from id
UPDATE agents SET sort_order = id;

-- Agent locks for exclusive access
CREATE TABLE agent_locks (
  agent_id INTEGER PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  client_id TEXT NOT NULL,
  acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
