-- Status subscriptions for the Kratos agents orchestrator.
-- A subscriber agent is notified (via tmux) when another agent enters a
-- watched status. Delivery is deferred until the subscriber is idle.
CREATE TABLE IF NOT EXISTS agent_status_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_agent_id INTEGER NOT NULL,
  watch_status TEXT NOT NULL,
  exclude_agents TEXT NOT NULL DEFAULT '[]', -- JSON array of agent ids to ignore
  pending INTEGER NOT NULL DEFAULT 0,         -- 1 = a notification is queued for delivery
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(subscriber_agent_id, watch_status)
);

CREATE INDEX IF NOT EXISTS idx_status_subs_watch ON agent_status_subscriptions(watch_status);
CREATE INDEX IF NOT EXISTS idx_status_subs_subscriber ON agent_status_subscriptions(subscriber_agent_id);
