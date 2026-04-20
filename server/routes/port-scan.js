import { scanPorts } from '../lib/port-scanner.js';

export default async function portScanRoutes(app) {
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

  app.get('/api/ports/scan', { preHandler: authenticate }, async () => {
    const ports = scanPorts();

    // Match with agent-registered ports
    const registeredPorts = db.prepare(`
      SELECT ap.port, ap.label, ap.type, ap.agent_id, a.name as agent_name
      FROM agent_ports ap
      JOIN agents a ON ap.agent_id = a.id
    `).all();

    const registered = new Map();
    for (const rp of registeredPorts) {
      registered.set(rp.port, rp);
    }

    return ports.map(p => {
      const match = registered.get(p.port);
      return {
        ...p,
        agentId: match?.agent_id || null,
        agentName: match?.agent_name || null,
        agentLabel: match?.label || null,
        agentType: match?.type || null,
      };
    });
  });
}
