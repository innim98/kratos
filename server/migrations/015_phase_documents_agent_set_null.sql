-- phase_documents.agent_id used ON DELETE NO ACTION, which blocked deleting an
-- agent that authored any phase document (FOREIGN KEY constraint failed -> 500).
-- Rebuild the table so the author FK is ON DELETE SET NULL (matching issues/todos):
-- deleting an agent keeps its documents but clears the author reference.
CREATE TABLE phase_documents_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phase_id INTEGER NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  doc_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(phase_id, agent_id, doc_path)
);

INSERT INTO phase_documents_new (id, phase_id, agent_id, title, doc_path, status, updated_at)
  SELECT id, phase_id, agent_id, title, doc_path, status, updated_at FROM phase_documents;

DROP TABLE phase_documents;
ALTER TABLE phase_documents_new RENAME TO phase_documents;
