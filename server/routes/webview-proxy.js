import http from 'http';
import { getWebview } from './webview.js';

export default async function webviewProxyRoutes(app) {
  // Accept JWT from Authorization header OR ?token= query param (for iframe)
  const authenticate = async (request, reply) => {
    let token;
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (request.query.token) {
      token = request.query.token;
    }

    if (!token) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    try {
      request.user = app.jwt.verify(token);
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  };

  app.get('/api/agents/:id/webview/proxy/*', { preHandler: authenticate }, async (request, reply) => {
    return proxyToAgent(request, reply);
  });

  async function proxyToAgent(request, reply) {
    const { id } = request.params;
    const webview = getWebview(Number(id));

    if (!webview) {
      return reply.code(404).send({ error: 'No webview registered' });
    }

    const proxyPath = request.params['*'] || '';
    // Strip token from query string before forwarding
    const rawQs = request.url.split('?').slice(1).join('?');
    const cleanQs = rawQs ? rawQs.replace(/(?:^|&)token=[^&]*/g, '').replace(/^&/, '') : '';
    const qs = cleanQs ? `?${cleanQs}` : '';
    const targetUrl = `http://localhost:${webview.port}/${proxyPath}${qs}`;

    try {
      const proxyRes = await new Promise((resolve, reject) => {
        const proxyReq = http.get(targetUrl, { timeout: 10000 }, resolve);
        proxyReq.on('error', reject);
      });

      reply.code(proxyRes.statusCode);
      const contentType = proxyRes.headers['content-type'] || '';
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (key.toLowerCase() !== 'transfer-encoding') {
          reply.header(key, value);
        }
      }

      // For HTML responses, rewrite absolute paths to go through proxy
      if (contentType.includes('text/html')) {
        const chunks = [];
        for await (const chunk of proxyRes) chunks.push(chunk);
        let html = Buffer.concat(chunks).toString('utf8');

        const token = request.query.token || '';
        const proxyBase = `/api/agents/${id}/webview/proxy`;

        // Rewrite absolute src/href paths to go through proxy
        // e.g. src="/src/main.tsx" → src="/api/agents/1/webview/proxy/src/main.tsx?token=..."
        html = html.replace(
          /(src|href|action)=(["'])\/((?!\/|api\/agents)[^"']*)(["'])/g,
          (match, attr, q1, path, q2) => {
            const sep = path.includes('?') ? '&' : '?';
            return `${attr}=${q1}${proxyBase}/${path}${sep}token=${encodeURIComponent(token)}${q2}`;
          }
        );

        reply.header('content-length', Buffer.byteLength(html));
        return reply.send(html);
      }

      return reply.send(proxyRes);
    } catch {
      return reply.code(502).send({ error: 'Failed to reach target server' });
    }
  }
}
