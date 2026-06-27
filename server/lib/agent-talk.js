import { execSync } from 'node:child_process';
import { isAgentCliRunning } from './status-subscriptions.js';

// SQLite datetime('now') text (UTC) -> unix seconds
function toUnix(sqliteUtc) {
  const ms = Date.parse(sqliteUtc.replace(' ', 'T') + 'Z');
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

function sendTmux(session, text) {
  execSync(`tmux send-keys -l -t ${session} ${JSON.stringify(text)}`, { timeout: 3000 });
  execSync(`tmux send-keys -t ${session} Enter`, { timeout: 3000 });
}

// Deliver a single coalesced "you have unread messages" notification to a
// receiver, if eligible. Called when a message is created and when the receiver
// reports idle. All currently un-notified unread messages are marked notified so
// the same messages never re-notify; genuinely new messages notify again later.
//
// Eligibility (all required):
//   1. opted in (wants_message_notify = 1)
//   2. status-hook agent currently idle (reported_status === 'idle';
//      online/offline agents have a null/absent reported_status, so excluded)
//   3. tmux session alive and running claude/codex
//   4. has at least one unread, un-notified message
export function deliverMessages(db, receiver) {
  if (!receiver || !receiver.wants_message_notify) return;
  if (receiver.reported_status !== 'idle') return;

  const pending = db.prepare(
    `SELECT * FROM agent_messages
       WHERE receiver_id = ? AND read_at IS NULL AND notified_at IS NULL
       ORDER BY created_at ASC, rowid ASC`
  ).all(receiver.id);
  if (pending.length === 0) return;

  if (!isAgentCliRunning(receiver.tmux_session)) return;

  const oldest = pending[0];
  const nowUnix = Math.floor(Date.now() / 1000);
  const text =
    `(From Kratos : Kratos sent this at ${nowUnix}) ` +
    `message from ${oldest.sender_id} is received — ` +
    `oldest unread ${oldest.id} @ ${toUnix(oldest.created_at)}`;

  try {
    sendTmux(receiver.tmux_session, text);
    const mark = db.prepare("UPDATE agent_messages SET notified_at = datetime('now') WHERE id = ?");
    db.transaction(() => { for (const m of pending) mark.run(m.id); })();
  } catch {
    // session vanished mid-send — leave un-notified so a later idle retries
  }
}
