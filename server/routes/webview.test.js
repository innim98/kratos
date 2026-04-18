import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../index.js';

describe('webview routes', () => {
  let app, token, agentId;

  beforeAll(async () => {
    app = await buildServer({ testing: true });
    const reg = await app.inject({
      method: 'POST', url: '/api/register',
      payload: { username: 'admin', password: 'admin123' },
    });
    token = JSON.parse(reg.payload).token;

    const agent = await app.inject({
      method: 'POST', url: '/api/agents',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'test-agent', tmux_session: 'test-sess' },
    });
    agentId = JSON.parse(agent.payload).id;
  });

  afterAll(async () => { await app.close(); });

  describe('POST /api/agents/:id/webview', () => {
    it('should register webview (localhost only)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/agents/${agentId}/webview`,
        payload: { port: 5173, path: '/' },
        remoteAddress: '127.0.0.1',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.ok).toBe(true);
    });

    it('should include webview in agent list', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/agents',
        headers: { authorization: `Bearer ${token}` },
      });
      const agents = JSON.parse(res.payload);
      const agent = agents.find(a => a.id === agentId);
      expect(agent.webview).toEqual({ port: 5173, path: '/' });
    });

    it('should reject missing fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/agents/${agentId}/webview`,
        payload: {},
        remoteAddress: '127.0.0.1',
      });
      expect(res.statusCode).toBe(400);
    });

    it('should reject non-existent agent', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/agents/9999/webview',
        payload: { port: 3000, path: '/' },
        remoteAddress: '127.0.0.1',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/agents/:id/webview', () => {
    it('should remove webview', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/agents/${agentId}/webview`,
        remoteAddress: '127.0.0.1',
      });
      expect(res.statusCode).toBe(200);
    });

    it('should no longer include webview in agent list', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/agents',
        headers: { authorization: `Bearer ${token}` },
      });
      const agents = JSON.parse(res.payload);
      const agent = agents.find(a => a.id === agentId);
      expect(agent.webview).toBeNull();
    });
  });
});
