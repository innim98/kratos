import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../index.js';
import http from 'http';

describe('webview proxy', () => {
  let app, token, agentId;
  let targetServer;
  const TARGET_PORT = 19876;

  beforeAll(async () => {
    // Start a simple target server
    targetServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body>Hello from target: ${req.url}</body></html>`);
    });
    await new Promise(resolve => targetServer.listen(TARGET_PORT, resolve));

    app = await buildServer({ testing: true });
    const reg = await app.inject({
      method: 'POST', url: '/api/register',
      payload: { username: 'admin', password: 'admin123' },
    });
    token = JSON.parse(reg.payload).token;

    const agent = await app.inject({
      method: 'POST', url: '/api/agents',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'proxy-test', tmux_session: 'proxy-sess' },
    });
    agentId = JSON.parse(agent.payload).id;

    // Register webview
    await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/webview`,
      payload: { port: TARGET_PORT, path: '/' },
      remoteAddress: '127.0.0.1',
    });
  });

  afterAll(async () => {
    await app.close();
    targetServer.close();
  });

  it('should proxy GET request to target', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/agents/${agentId}/webview/proxy/`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('Hello from target');
  });

  it('should proxy subpaths', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/agents/${agentId}/webview/proxy/some/path`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('/some/path');
  });

  it('should reject unauthenticated proxy request', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/agents/${agentId}/webview/proxy/`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('should return 404 when no webview registered', async () => {
    // Create agent without webview
    const agent2 = await app.inject({
      method: 'POST', url: '/api/agents',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'no-wv', tmux_session: 'no-wv-sess' },
    });
    const id2 = JSON.parse(agent2.payload).id;

    const res = await app.inject({
      method: 'GET',
      url: `/api/agents/${id2}/webview/proxy/`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
