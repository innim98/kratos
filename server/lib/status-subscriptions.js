import { execSync } from 'node:child_process';

const NOTIFY_TEXT = '(From Kratos) agent status updated';

// Detect whether a "claude" or "codex" process is running inside the agent's
// tmux session. Fast path: the pane's foreground command. Fallback: scan the
// descendant process tree of every pane (claude/codex often run as a node child).
export function isAgentCliRunning(session) {
  try {
    const panes = execSync(
      `tmux list-panes -t ${session} -F '#{pane_pid} #{pane_current_command}'`,
      { timeout: 3000 }
    ).toString().trim();
    if (!panes) return false;
    if (/claude|codex/i.test(panes)) return true;

    const panePids = panes.split('\n').map((l) => l.split(' ')[0]).filter(Boolean);
    const ps = execSync('ps -axo pid=,ppid=,command=', { timeout: 3000 })
      .toString().trim().split('\n');

    const children = new Map(); // ppid -> [pid]
    const cmd = new Map();      // pid -> command
    for (const line of ps) {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
      if (!m) continue;
      const [, pid, ppid, command] = m;
      cmd.set(pid, command);
      if (!children.has(ppid)) children.set(ppid, []);
      children.get(ppid).push(pid);
    }

    const stack = [...panePids];
    const seen = new Set();
    while (stack.length) {
      const pid = stack.pop();
      if (seen.has(pid)) continue;
      seen.add(pid);
      if (/claude|codex/i.test(cmd.get(pid) || '')) return true;
      for (const child of children.get(pid) || []) stack.push(child);
    }
    return false;
  } catch {
    return false;
  }
}

// Send the notification into the agent's tmux: literal text, then a separate Enter.
function sendNotification(session) {
  execSync(`tmux send-keys -l -t ${session} ${JSON.stringify(NOTIFY_TEXT)}`, { timeout: 3000 });
  execSync(`tmux send-keys -t ${session} Enter`, { timeout: 3000 });
}

function setPending(db, subId, value) {
  db.prepare(
    "UPDATE agent_status_subscriptions SET pending = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(value, subId);
}

// Try to deliver a subscription's notification now. If the subscriber is not
// idle (or its CLI isn't running / session is gone), queue it as pending so it
// is retried when the subscriber next reports idle.
function tryDeliver(db, sub) {
  const subscriber = db.prepare('SELECT * FROM agents WHERE id = ?').get(sub.subscriber_agent_id);
  if (!subscriber) return;

  if (subscriber.reported_status !== 'idle' || !isAgentCliRunning(subscriber.tmux_session)) {
    if (!sub.pending) setPending(db, sub.id, 1);
    return;
  }

  try {
    sendNotification(subscriber.tmux_session);
    setPending(db, sub.id, 0);
  } catch {
    if (!sub.pending) setPending(db, sub.id, 1);
  }
}

// Called from POST /api/agents/status after an agent's status changes.
//  - TRIGGER: other agents watching this exact status get a delivery attempt.
//  - FLUSH:   when this agent becomes idle, deliver its own pending notifications.
export function processStatusChange(db, agent, newStatus) {
  const watchers = db
    .prepare('SELECT * FROM agent_status_subscriptions WHERE watch_status = ?')
    .all(newStatus);
  for (const sub of watchers) {
    if (sub.subscriber_agent_id === agent.id) continue;
    let excluded = [];
    try { excluded = JSON.parse(sub.exclude_agents); } catch { excluded = []; }
    if (excluded.includes(agent.id)) continue;
    tryDeliver(db, sub);
  }

  if (newStatus === 'idle') {
    const pending = db
      .prepare('SELECT * FROM agent_status_subscriptions WHERE subscriber_agent_id = ? AND pending = 1')
      .all(agent.id);
    for (const sub of pending) tryDeliver(db, sub);
  }
}
