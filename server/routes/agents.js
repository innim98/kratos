import { execSync } from 'child_process';
import crypto from 'crypto';
import { getTmuxSessions } from '../lib/tmux.js';
import { getWebview } from './webview.js';

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
    const agents = db.prepare('SELECT * FROM agents ORDER BY id').all();
    const live = getTmuxSessions();

    return agents.map(a => {
      // Auto-generate token for agents that don't have one (pre-migration)
      if (!a.token) {
        a.token = crypto.randomUUID();
        db.prepare('UPDATE agents SET token = ? WHERE id = ?').run(a.token, a.id);
      }
      const ports = db.prepare('SELECT * FROM agent_ports WHERE agent_id = ? ORDER BY created_at').all(a.id);
      return {
        ...a,
        status: live.has(a.tmux_session) ? 'online' : 'offline',
        lastActivity: live.get(a.tmux_session)?.activity || null,
        webview: getWebview(a.id),
        ports,
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
      const result = db.prepare(
        'INSERT INTO agents (name, tmux_session, token) VALUES (?, ?, ?)'
      ).run(name, sessionName, agentToken);
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
    const { name } = request.body || {};

    if (!name) return reply.code(400).send({ error: 'name is required' });

    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });

    db.prepare('UPDATE agents SET name = ? WHERE id = ?').run(name, id);
    return { ...agent, name };
  });

  app.delete('/api/agents/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params;
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);

    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' });
    }

    db.prepare('DELETE FROM agents WHERE id = ?').run(id);
    return { ok: true };
  });
}
