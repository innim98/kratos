-- Claude Code session UUID a manager can attach to an agent, used to address
-- messages by session instead of agent id (see phase-13).
ALTER TABLE agents ADD COLUMN session_uuid TEXT DEFAULT NULL;
-- Unique when set; NULLs allowed for agents without a session uuid.
CREATE UNIQUE INDEX idx_agents_session_uuid ON agents(session_uuid) WHERE session_uuid IS NOT NULL;
