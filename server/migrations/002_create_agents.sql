CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  tmux_session TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL DEFAULT 'unmanaged',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
