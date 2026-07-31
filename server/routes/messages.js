import crypto from 'crypto';
import { deliverMessages } from '../lib/agent-talk.js';
import { getTmuxSessions } from '../lib/tmux.js';

export default async function messageRoutes(app) {
  const { db } = app;

  // Resolve the calling agent from its Bearer token.
  const authAgent = (request) => {
    const h = request.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) return null;
    return db.prepare('SELECT * FROM agents WHERE token = ?').get(h.slice(7));
  };

  // "Who am I" — lets an agent learn its own id from its token.
  app.get('/api/agents/me', async (request, reply) => {
    const me = authAgent(request);
    if (!me) return reply.code(401).send({ error: 'Unauthorized' });
    return { id: me.id, name: me.name, is_manager: me.is_manager, session_uuid: me.session_uuid };
  });

  // Directory of all agents (id + name) so agents can address each other.
  app.get('/api/agents/directory', async (request, reply) => {
    if (!authAgent(request)) return reply.code(401).send({ error: 'Unauthorized' });
    return db.prepare('SELECT id, name, session_uuid FROM agents ORDER BY id').all();
  });

  // Send a message — Kratos stores it under the sender's identity (no forgery).
  app.post('/api/messages', async (request, reply) => {
    const sender = authAgent(request);
    if (!sender) return reply.code(401).send({ error: 'Unauthorized' });

    const { to, to_session, body } = request.body || {};
    if (typeof body !== 'string' || !body.trim()) return reply.code(400).send({ error: 'body is required' });

    // Resolve the receiver either by agent id (`to`) or by Claude Code session
    // UUID (`to_session`). The session UUID is a manager-asserted value; Kratos
    // does not guarantee its authenticity, so we only treat it as a lookup key.
    let receiver;
    if (to !== undefined && to !== null && to !== '') {
      const receiverId = parseInt(to, 10);
      if (!Number.isInteger(receiverId)) return reply.code(400).send({ error: 'to (receiver id) is invalid' });
      receiver = db.prepare('SELECT * FROM agents WHERE id = ?').get(receiverId);
      if (!receiver) return reply.code(404).send({ error: 'Receiver not found' });
    } else if (typeof to_session === 'string' && to_session.trim()) {
      receiver = db.prepare('SELECT * FROM agents WHERE session_uuid = ?').get(to_session.trim());
      // No agent owns this UUID, or its tmux session is not live → no active session.
      if (!receiver || !getTmuxSessions().has(receiver.tmux_session)) {
        return reply.code(409).send({ error: 'no active session' });
      }
    } else {
      return reply.code(400).send({ error: 'to or to_session is required' });
    }

    const id = crypto.randomUUID();
    db.prepare('INSERT INTO agent_messages (id, sender_id, receiver_id, body) VALUES (?, ?, ?, ?)')
      .run(id, sender.id, receiver.id, body);

    // Deliver immediately if the receiver is idle right now; otherwise it waits
    // for the receiver's next idle report (handled in the status endpoint).
    try { deliverMessages(db, receiver); } catch {}

    return { ok: true, message_id: id };
  });

  // List messages for a from->to conversation. Caller must be one of the pair.
  app.get('/api/messages', async (request, reply) => {
    const me = authAgent(request);
    if (!me) return reply.code(401).send({ error: 'Unauthorized' });

    const from = parseInt(request.query.from, 10);
    // `to` defaults to the caller (the common "read my inbox from X" case),
    // so an agent never needs to know its own numeric id.
    const to = request.query.to !== undefined ? parseInt(request.query.to, 10) : me.id;
    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      return reply.code(400).send({ error: 'from (agent id) is required' });
    }
    if (me.id !== from && me.id !== to) {
      return reply.code(403).send({ error: 'Not a party to this conversation' });
    }

    // Optional filters to keep long conversations readable:
    //   unread=1  → only messages not yet read
    //   limit=N   → only the most recent N (after the unread filter)
    const unreadOnly = request.query.unread === '1' || request.query.unread === 'true';
    const limitRaw = parseInt(request.query.limit, 10);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : null;

    const rows = db.prepare(
      `SELECT id AS message_id, created_at AS timestamp, body, (read_at IS NOT NULL) AS read
         FROM agent_messages
        WHERE sender_id = ? AND receiver_id = ?
        ORDER BY created_at ASC, rowid ASC`
    ).all(from, to);
    const full = rows.map((r) => ({ ...r, read: !!r.read }));
    const total = full.length;
    const unread_count = full.filter((m) => !m.read).length;

    let list = unreadOnly ? full.filter((m) => !m.read) : full;
    if (limit && list.length > limit) list = list.slice(list.length - limit); // tail = most recent

    // `all`/`unread` kept for backward compatibility; `total`/`unread_count`/
    // `returned` let callers page and know what was truncated.
    return { total, unread_count, returned: list.length, all: list, unread: list.filter((m) => !m.read) };
  });

  // Mark messages read (read-only transition; receiver only).
  app.put('/api/messages/read', async (request, reply) => {
    const me = authAgent(request);
    if (!me) return reply.code(401).send({ error: 'Unauthorized' });

    const { from, message_ids } = request.body || {};
    if (Array.isArray(message_ids) && message_ids.length) {
      const stmt = db.prepare(
        "UPDATE agent_messages SET read_at = datetime('now') WHERE id = ? AND receiver_id = ? AND read_at IS NULL"
      );
      let marked = 0;
      db.transaction(() => { for (const mid of message_ids) marked += stmt.run(mid, me.id).changes; })();
      return { ok: true, marked };
    }

    const fromId = parseInt(from, 10);
    if (!Number.isInteger(fromId)) return reply.code(400).send({ error: 'from or message_ids is required' });
    const r = db.prepare(
      "UPDATE agent_messages SET read_at = datetime('now') WHERE receiver_id = ? AND sender_id = ? AND read_at IS NULL"
    ).run(me.id, fromId);
    return { ok: true, marked: r.changes };
  });

  // Opt in / out of idle-time message notifications.
  app.post('/api/messages/subscribe', async (request, reply) => {
    const me = authAgent(request);
    if (!me) return reply.code(401).send({ error: 'Unauthorized' });
    db.prepare('UPDATE agents SET wants_message_notify = 1 WHERE id = ?').run(me.id);
    return { ok: true, subscribed: true };
  });

  app.delete('/api/messages/subscribe', async (request, reply) => {
    const me = authAgent(request);
    if (!me) return reply.code(401).send({ error: 'Unauthorized' });
    db.prepare('UPDATE agents SET wants_message_notify = 0 WHERE id = ?').run(me.id);
    return { ok: true, subscribed: false };
  });
}
