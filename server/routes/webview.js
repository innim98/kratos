// In-memory webview state per agent (agentId → { port, path })
const webviews = new Map();

export function getWebview(agentId) {
  return webviews.get(agentId) || null;
}

export default async function webviewRoutes(app) {
  const { db } = app;

  const localhostOnly = async (request, reply) => {
    const ip = request.ip;
    if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
      return reply.code(403).send({ error: 'Localhost only' });
    }
  };

  app.post('/api/agents/:id/webview', { preHandler: localhostOnly }, async (request, reply) => {
    const { id } = request.params;
    const { port, path } = request.body || {};

    if (!port || !path) {
      return reply.code(400).send({ error: 'port and path required' });
    }

    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' });
    }

    const webview = { port, path };
    webviews.set(Number(id), webview);

    // Push to all connected WS clients
    if (app.websocketServer) {
      const msg = JSON.stringify({ type: 'webview-update', agentId: Number(id), webview });
      for (const client of app.websocketServer.clients) {
        if (client.readyState === 1) client.send(msg);
      }
    }

    return { ok: true };
  });

  app.delete('/api/agents/:id/webview', { preHandler: localhostOnly }, async (request, reply) => {
    const { id } = request.params;

    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' });
    }

    webviews.delete(Number(id));

    if (app.websocketServer) {
      const msg = JSON.stringify({ type: 'webview-update', agentId: Number(id), webview: null });
      for (const client of app.websocketServer.clients) {
        if (client.readyState === 1) client.send(msg);
      }
    }

    return { ok: true };
  });
}
