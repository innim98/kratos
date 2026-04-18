import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../index.js';
import http from 'http';

describe('webview inspect API', () => {
  let app, token, agentId, agentNoWv;
  let targetServer;
  const TARGET_PORT = 19877;

  beforeAll(async () => {
    targetServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body><h1>Test Page</h1><p>Hello from agent</p></body></html>`);
    });
    await new Promise(resolve => targetServer.listen(TARGET_PORT, resolve));

    app = await buildServer({ testing: true });
    const reg = await app.inject({
      method: 'POST', url: '/api/register',
      payload: { username: 'admin', password: 'admin123' },
    });
    token = JSON.parse(reg.payload).token;

    const a1 = await app.inject({
      method: 'POST', url: '/api/agents',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'inspect-test', tmux_session: 'inspect-sess' },
    });
    agentId = JSON.parse(a1.payload).id;

    await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/webview`,
      payload: { port: TARGET_PORT, path: '/' },
      remoteAddress: '127.0.0.1',
    });

    const a2 = await app.inject({
      method: 'POST', url: '/api/agents',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'no-wv-agent', tmux_session: 'no-wv-sess' },
    });
    agentNoWv = JSON.parse(a2.payload).id;
  }, 30000);

  afterAll(async () => {
    await app.close();
    targetServer.close();
  });

  describe('GET /api/agents/:id/webview/screenshot', () => {
    it('should return PNG screenshot', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/agents/${agentId}/webview/screenshot`,
        remoteAddress: '127.0.0.1',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.format).toBe('png');
      expect(body.base64).toBeTruthy();
      // Check it starts with PNG magic bytes in base64
      expect(body.base64.startsWith('iVBOR')).toBe(true);
    }, 30000);

    it('should return 404 when no webview', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/agents/${agentNoWv}/webview/screenshot`,
        remoteAddress: '127.0.0.1',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/agents/:id/webview/dom', () => {
    it('should return page text content', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/agents/${agentId}/webview/dom`,
        remoteAddress: '127.0.0.1',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.title).toBeDefined();
      expect(body.text).toContain('Hello from agent');
      expect(body.url).toContain(String(TARGET_PORT));
    }, 30000);

    it('should return 404 when no webview', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/agents/${agentNoWv}/webview/dom`,
        remoteAddress: '127.0.0.1',
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
