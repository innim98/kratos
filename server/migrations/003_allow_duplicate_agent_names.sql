-- Remove UNIQUE constraint on agent name to allow multiple agents from same folder
CREATE TABLE agents_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  tmux_session TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL DEFAULT 'unmanaged',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO agents_new SELECT * FROM agents;
DROP TABLE agents;
ALTER TABLE agents_new RENAME TO agents;
