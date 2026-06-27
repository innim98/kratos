import { execSync } from 'child_process';
import crypto from 'crypto';
import { getTmuxSessions } from '../lib/tmux.js';
import { processStatusChange } from '../lib/status-subscriptions.js';
import { deliverMessages } from '../lib/agent-talk.js';


export default async function agentRoutes(app) {
  const { db } = app;

  const authenticate = async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    try {
      request.user = app.jwt.verify(authHeader.slice(7));
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  };

  app.get('/api/agents', { preHandler: authenticate }, async () => {
    const agents = db.prepare('SELECT * FROM agents ORDER BY sort_order ASC, id ASC').all();
    const live = getTmuxSessions();
    // Clean expired locks
    db.prepare("DELETE FROM agent_locks WHERE expires_at < datetime('now')").run();
    const locks = db.prepare('SELECT * FROM agent_locks').all();
    const lockMap = new Map(locks.map(l => [l.agent_id, l]));

    return agents.map(a => {
      if (!a.token) {
        a.token = crypto.randomUUID();
        db.prepare('UPDATE agents SET token = ? WHERE id = ?').run(a.token, a.id);
      }
      const ports = db.prepare('SELECT * FROM agent_ports WHERE agent_id = ? ORDER BY created_at').all(a.id);
      const lock = lockMap.get(a.id);
      return {
        ...a,
        status: !live.has(a.tmux_session) ? 'offline' : (a.reported_status === 'asking_permission' ? 'ask' : a.reported_status) || 'online',
        lastActivity: live.get(a.tmux_session)?.activity || null,
        ports,
        lock: lock ? { username: lock.username, clientId: lock.client_id } : null,
      };
    });
  });

  app.post('/api/agents', { preHandler: authenticate }, async (request, reply) => {
    const { name, tmux_session, folder } = request.body || {};

    if (!name) {
      return reply.code(400).send({ error: 'name is required' });
    }

    let sessionName = tmux_session;

    // "from folder" flow: create a tmux session in that folder
    if (folder && !tmux_session) {
      sessionName = `kratos-${Date.now().toString(36)}`;
      try {
        execSync(`tmux new-session -d -s ${sessionName} -c ${folder}`, {
          encoding: 'utf8', timeout: 5000,
          env: { ...process.env, PORT: '', CLIENT_PORT: '' },
        });
      } catch {
        // Session might already exist, that's ok — we'll just register it
      }
    }

    if (!sessionName) {
      return reply.code(400).send({ error: 'tmux_session or folder required' });
    }

    try {
      const agentToken = crypto.randomUUID();
      const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM agents').get()?.m || 0;
      const port = process.env.PORT || 15001;
      const result = db.prepare(
        'INSERT INTO agents (name, tmux_session, token, sort_order, folder) VALUES (?, ?, ?, ?, ?)'
      ).run(name, sessionName, agentToken, maxOrder + 1, folder || null);

      // Auto-set KRATOS_TOKEN/PORT in tmux session
      try {
        execSync(`tmux set-environment -t ${sessionName} KRATOS_TOKEN ${agentToken}`, { timeout: 3000 });
        execSync(`tmux set-environment -t ${sessionName} KRATOS_PORT ${port}`, { timeout: 3000 });
      } catch {}

      return {
        id: result.lastInsertRowid,
        name,
        tmux_session: sessionName,
        type: 'unmanaged',
        token: agentToken,
      };
    } catch {
      return reply.code(409).send({ error: 'tmux_session already exists' });
    }
  });

  app.put('/api/agents/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params;
    const { name, issue_project } = request.body || {};

    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });

    if (name) {
      db.prepare('UPDATE agents SET name = ? WHERE id = ?').run(name, id);
    }
    if ('issue_project' in (request.body || {})) {
      db.prepare('UPDATE agents SET issue_project = ? WHERE id = ?').run(issue_project || null, id);
    }

    const updated = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
    return updated;
  });

  app.put('/api/agents/:id/order', { preHandler: authenticate }, async (request, reply) => {
    if (request.user.role !== 'admin') return reply.code(403).send({ error: 'Admin only' });

    const { id } = request.params;
    const { direction } = request.body || {};
    if (!['up', 'down'].includes(direction)) return reply.code(400).send({ error: 'direction must be up or down' });

    const agents = db.prepare('SELECT id, sort_order FROM agents ORDER BY sort_order ASC, id ASC').all();
    const idx = agents.findIndex(a => a.id === Number(id));
    if (idx === -1) return reply.code(404).send({ error: 'Agent not found' });

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= agents.length) return reply.code(400).send({ error: 'Cannot move further' });

    const a = agents[idx];
    const b = agents[swapIdx];
    db.prepare('UPDATE agents SET sort_order = ? WHERE id = ?').run(b.sort_order, a.id);
    db.prepare('UPDATE agents SET sort_order = ? WHERE id = ?').run(a.sort_order, b.id);

    return { ok: true };
  });

  // Agent self-reports status via token
  app.post('/api/agents/status', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return reply.code(401).send({ error: 'Unauthorized' });
    const token = authHeader.slice(7);
    const agent = db.prepare('SELECT * FROM agents WHERE token = ?').get(token);
    if (!agent) return reply.code(401).send({ error: 'Unauthorized' });

    const { status } = request.body || {};
    if (!['working', 'idle', 'asking_permission'].includes(status)) return reply.code(400).send({ error: 'status must be working, idle, or asking_permission' });

    const prevStatus = agent.reported_status;
    db.prepare("UPDATE agents SET reported_status = ?, last_status_at = datetime('now') WHERE id = ?").run(status, agent.id);

    const broadcast = (obj) => {
      const data = JSON.stringify(obj);
      for (const client of app.websocketServer?.clients || []) {
        if (client.readyState === 1) {
          try { client.send(data); } catch {}
        }
      }
    };

    // Push every status change so clients update live (no polling).
    // Map asking_permission → ask to match the display status used elsewhere.
    broadcast({ type: 'agent-status', agentId: agent.id, status: status === 'asking_permission' ? 'ask' : status });

    // working/asking_permission → idle: fire agent-done
    if (prevStatus && prevStatus !== 'idle' && status === 'idle') {
      broadcast({ type: 'agent-done', agentId: agent.id, agentName: agent.name });
    }

    // Notify orchestrator subscribers (deferred until they are idle)
    try { processStatusChange(db, agent, status); } catch {}

    // Flush any pending agent-talk messages now that this agent is idle
    if (status === 'idle') {
      try { deliverMessages(db, { ...agent, reported_status: status }); } catch {}
    }

    return { ok: true };
  });

  // Orchestrator subscribes to be notified when other agents enter a status.
  // Notification is delivered to the subscriber's tmux once it is idle.
  app.post('/api/agents/subscribe-status', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return reply.code(401).send({ error: 'Unauthorized' });
    const token = authHeader.slice(7);
    const agent = db.prepare('SELECT * FROM agents WHERE token = ?').get(token);
    if (!agent) return reply.code(401).send({ error: 'Unauthorized' });

    const { status, exclude_agents } = request.body || {};
    if (!['working', 'idle', 'asking_permission'].includes(status)) {
      return reply.code(400).send({ error: 'status must be working, idle, or asking_permission' });
    }
    const exclude = Array.isArray(exclude_agents)
      ? exclude_agents.map((n) => parseInt(n, 10)).filter((n) => Number.isInteger(n))
      : [];

    db.prepare(`
      INSERT INTO agent_status_subscriptions (subscriber_agent_id, watch_status, exclude_agents)
      VALUES (?, ?, ?)
      ON CONFLICT(subscriber_agent_id, watch_status)
      DO UPDATE SET exclude_agents = excluded.exclude_agents, pending = 0, updated_at = datetime('now')
    `).run(agent.id, status, JSON.stringify(exclude));

    return { ok: true, subscriber: agent.id, watch_status: status, exclude_agents: exclude };
  });

  // Remove the caller's subscription(s). Optional body { status } narrows it.
  app.delete('/api/agents/subscribe-status', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return reply.code(401).send({ error: 'Unauthorized' });
    const token = authHeader.slice(7);
    const agent = db.prepare('SELECT * FROM agents WHERE token = ?').get(token);
    if (!agent) return reply.code(401).send({ error: 'Unauthorized' });

    const { status } = request.body || {};
    if (status) {
      db.prepare('DELETE FROM agent_status_subscriptions WHERE subscriber_agent_id = ? AND watch_status = ?').run(agent.id, status);
    } else {
      db.prepare('DELETE FROM agent_status_subscriptions WHERE subscriber_agent_id = ?').run(agent.id);
    }
    return { ok: true };
  });

  app.delete('/api/agents/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params;
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);

    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' });
    }

    try {
      db.prepare('DELETE FROM agents WHERE id = ?').run(id);
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        return reply.code(409).send({ error: 'Agent is still referenced by other records and cannot be deleted' });
      }
      throw e;
    }
    return { ok: true };
  });
}
