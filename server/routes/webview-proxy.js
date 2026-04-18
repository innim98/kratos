import http from 'http';
import { getWebview } from './webview.js';

export default async function webviewProxyRoutes(app) {
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

  app.get('/api/agents/:id/webview/proxy/*', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params;
    const webview = getWebview(Number(id));

    if (!webview) {
      return reply.code(404).send({ error: 'No webview registered' });
    }

    const proxyPath = request.params['*'] || '';
    const targetUrl = `http://localhost:${webview.port}${webview.path}${proxyPath}`;

    try {
      const proxyRes = await new Promise((resolve, reject) => {
        const proxyReq = http.get(targetUrl, { timeout: 10000 }, resolve);
        proxyReq.on('error', reject);
      });

      reply.code(proxyRes.statusCode);
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (key.toLowerCase() !== 'transfer-encoding') {
          reply.header(key, value);
        }
      }

      return reply.send(proxyRes);
    } catch {
      return reply.code(502).send({ error: 'Failed to reach target server' });
    }
  });
}
