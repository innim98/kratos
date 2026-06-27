import crypto from 'crypto';
import { deliverMessages } from '../lib/agent-talk.js';

export default async function messageRoutes(app) {
  const { db } = app;

  // Resolve the calling agent from its Bearer token.
  const authAgent = (request) => {
    const h = request.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) return null;
    return db.prepare('SELECT * FROM agents WHERE token = ?').get(h.slice(7));
  };

  // Directory of all agents (id + name) so agents can address each other.
  app.get('/api/agents/directory', async (request, reply) => {
    if (!authAgent(request)) return reply.code(401).send({ error: 'Unauthorized' });
    return db.prepare('SELECT id, name FROM agents ORDER BY id').all();
  });

  // Send a message — Kratos stores it under the sender's identity (no forgery).
  app.post('/api/messages', async (request, reply) => {
    const sender = authAgent(request);
    if (!sender) return reply.code(401).send({ error: 'Unauthorized' });

    const { to, body } = request.body || {};
    const receiverId = parseInt(to, 10);
    if (!Number.isInteger(receiverId)) return reply.code(400).send({ error: 'to (receiver id) is required' });
    if (typeof body !== 'string' || !body.trim()) return reply.code(400).send({ error: 'body is required' });

    const receiver = db.prepare('SELECT * FROM agents WHERE id = ?').get(receiverId);
    if (!receiver) return reply.code(404).send({ error: 'Receiver not found' });

    const id = crypto.randomUUID();
    db.prepare('INSERT INTO agent_messages (id, sender_id, receiver_id, body) VALUES (?, ?, ?, ?)')
      .run(id, sender.id, receiverId, body);

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
    const to = parseInt(request.query.to, 10);
    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      return reply.code(400).send({ error: 'from and to (agent ids) are required' });
    }
    if (me.id !== from && me.id !== to) {
      return reply.code(403).send({ error: 'Not a party to this conversation' });
    }

    const rows = db.prepare(
      `SELECT id AS message_id, created_at AS timestamp, body, (read_at IS NOT NULL) AS read
         FROM agent_messages
        WHERE sender_id = ? AND receiver_id = ?
        ORDER BY created_at ASC, rowid ASC`
    ).all(from, to);
    const all = rows.map((r) => ({ ...r, read: !!r.read }));
    return { all, unread: all.filter((m) => !m.read) };
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
