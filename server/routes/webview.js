// In-memory webview state per agent (agentId → { port, path })
const webviews = new Map();

// dbRef is set when routes are registered
let dbRef = null;

export function getWebview(agentId) {
  // Check memory first
  const mem = webviews.get(agentId);
  if (mem) return mem;

  // Fallback: check agent_ports table for type='webview'
  if (dbRef) {
    const row = dbRef.prepare(
      "SELECT port FROM agent_ports WHERE agent_id = ? AND type = 'webview' ORDER BY created_at DESC LIMIT 1"
    ).get(agentId);
    if (row) {
      const webview = { port: row.port, path: '/' };
      webviews.set(agentId, webview); // cache it
      return webview;
    }
  }

  return null;
}

export default async function webviewRoutes(app) {
  const { db } = app;
  dbRef = db;

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
