-- Agent tokens for API authentication
ALTER TABLE agents ADD COLUMN token TEXT;

-- Todos (project-global, optionally bound to agent)
CREATE TABLE todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  description_md_path TEXT,
  priority INTEGER NOT NULL DEFAULT 3 CHECK(priority >= 1 AND priority <= 5),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed')),
  due_date TEXT,
  agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  created_by_type TEXT NOT NULL CHECK(created_by_type IN ('user', 'agent')),
  created_by_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Supplementary ports (agent services like DB, cache, etc.)
CREATE TABLE agent_ports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  port INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'service',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
