import { authenticateAny } from '../lib/auth.js';

export default async function portsRoutes(app) {
  const { db } = app;
  const auth = authenticateAny(app);

  app.get('/api/agents/:id/ports', { preHandler: auth }, async (request) => {
    return db.prepare('SELECT * FROM agent_ports WHERE agent_id = ? ORDER BY created_at').all(request.params.id);
  });

  app.post('/api/agents/:id/ports', { preHandler: auth }, async (request, reply) => {
    const { port, label, type } = request.body || {};
    if (!port) return reply.code(400).send({ error: 'port is required' });

    const agentId = Number(request.params.id);
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });

    const portType = type || 'service';

    const result = db.prepare(
      'INSERT INTO agent_ports (agent_id, port, label, type) VALUES (?, ?, ?, ?)'
    ).run(agentId, port, label || '', portType);

    return db.prepare('SELECT * FROM agent_ports WHERE id = ?').get(result.lastInsertRowid);
  });

  app.delete('/api/agents/:id/ports/:portId', { preHandler: auth }, async (request, reply) => {
    const { id, portId } = request.params;
    const entry = db.prepare('SELECT * FROM agent_ports WHERE id = ? AND agent_id = ?').get(portId, id);
    if (!entry) return reply.code(404).send({ error: 'Port not found' });

    db.prepare('DELETE FROM agent_ports WHERE id = ?').run(portId);
    return { ok: true };
  });
}
