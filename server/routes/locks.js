import { authenticateAny } from '../lib/auth.js';

const LOCK_DURATION_SEC = 60;

export default async function lockRoutes(app) {
  const { db } = app;
  const auth = authenticateAny(app);

  function cleanExpired() {
    db.prepare("DELETE FROM agent_locks WHERE expires_at < datetime('now')").run();
  }

  function getLock(agentId) {
    cleanExpired();
    return db.prepare('SELECT * FROM agent_locks WHERE agent_id = ?').get(agentId);
  }

  function getUsername(request) {
    if (request.authType === 'user') return request.user.username;
    return `agent:${request.agent?.id}`;
  }

  // Acquire lock
  app.post('/api/agents/:id/lock', { preHandler: auth }, async (request, reply) => {
    const agentId = Number(request.params.id);
    const { clientId } = request.body || {};
    if (!clientId) return reply.code(400).send({ error: 'clientId required' });

    const username = getUsername(request);
    const existing = getLock(agentId);

    if (existing) {
      // Same client renewing? treat as success
      if (existing.client_id === clientId) {
        const expiresAt = new Date(Date.now() + LOCK_DURATION_SEC * 1000).toISOString();
        db.prepare('UPDATE agent_locks SET expires_at = ? WHERE agent_id = ?').run(expiresAt, agentId);
        return { locked: true, username: existing.username, clientId, expiresAt };
      }
      return reply.code(409).send({ locked: false, holder: { username: existing.username, clientId: existing.client_id } });
    }

    const expiresAt = new Date(Date.now() + LOCK_DURATION_SEC * 1000).toISOString();
    db.prepare('INSERT INTO agent_locks (agent_id, username, client_id, expires_at) VALUES (?, ?, ?, ?)').run(agentId, username, clientId, expiresAt);
    return { locked: true, username, clientId, expiresAt };
  });

  // Force lock (steal from current holder)
  app.post('/api/agents/:id/lock/force', { preHandler: auth }, async (request, reply) => {
    const agentId = Number(request.params.id);
    const { clientId } = request.body || {};
    if (!clientId) return reply.code(400).send({ error: 'clientId required' });

    const username = getUsername(request);
    const existing = getLock(agentId);

    // Notify previous holder via WS
    if (existing && existing.client_id !== clientId) {
      broadcastToAgent(app, agentId, {
        type: 'lock-stolen',
        agentId,
        by: `${username}:${clientId}`,
      });
    }

    // Replace lock
    db.prepare('DELETE FROM agent_locks WHERE agent_id = ?').run(agentId);
    const expiresAt = new Date(Date.now() + LOCK_DURATION_SEC * 1000).toISOString();
    db.prepare('INSERT INTO agent_locks (agent_id, username, client_id, expires_at) VALUES (?, ?, ?, ?)').run(agentId, username, clientId, expiresAt);
    return { locked: true, username, clientId, expiresAt };
  });

  // Renew lock
  app.post('/api/agents/:id/lock/renew', { preHandler: auth }, async (request, reply) => {
    const agentId = Number(request.params.id);
    const { clientId } = request.body || {};
    if (!clientId) return reply.code(400).send({ error: 'clientId required' });

    const existing = getLock(agentId);
    if (!existing || existing.client_id !== clientId) {
      return reply.code(409).send({ error: 'not lock holder' });
    }

    const expiresAt = new Date(Date.now() + LOCK_DURATION_SEC * 1000).toISOString();
    db.prepare('UPDATE agent_locks SET expires_at = ? WHERE agent_id = ?').run(expiresAt, agentId);
    return { expiresAt };
  });

  // Release lock
  app.delete('/api/agents/:id/lock', { preHandler: auth }, async (request, reply) => {
    const agentId = Number(request.params.id);
    const { clientId } = request.body || {};
    db.prepare('DELETE FROM agent_locks WHERE agent_id = ? AND client_id = ?').run(agentId, clientId);
    return { released: true };
  });

  // Get lock status (for sidebar display)
  app.get('/api/agents/:id/lock', { preHandler: auth }, async (request) => {
    const lock = getLock(Number(request.params.id));
    return lock || { locked: false };
  });
}

function broadcastToAgent(app, agentId, message) {
  const data = JSON.stringify(message);
  for (const client of app.websocketServer?.clients || []) {
    if (client.readyState === 1) {
      try { client.send(data); } catch {}
    }
  }
}
