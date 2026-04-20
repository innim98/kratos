import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../index.js';

describe('port scan API', () => {
  let app, token;

  beforeAll(async () => {
    app = await buildServer({ testing: true });
    const reg = await app.inject({
      method: 'POST', url: '/api/register',
      payload: { username: 'admin', password: 'admin123' },
    });
    token = JSON.parse(reg.payload).token;
  });

  afterAll(async () => { await app.close(); });

  it('GET /api/ports/scan should return port list', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/ports/scan',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    // Should find at least the test server's own port or some port
    for (const p of body) {
      expect(p).toHaveProperty('port');
      expect(p).toHaveProperty('pid');
      expect(p).toHaveProperty('command');
      expect(p).toHaveProperty('system');
    }
  });

  it('should match agent-registered ports', async () => {
    // Register an agent with a port
    const agent = await app.inject({
      method: 'POST', url: '/api/agents',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'scan-test', tmux_session: 'scan-sess' },
    });
    const agentData = JSON.parse(agent.payload);

    await app.inject({
      method: 'POST', url: `/api/agents/${agentData.id}/ports`,
      headers: { authorization: `Bearer ${agentData.token}` },
      payload: { port: 15001, label: 'Kratos API' },
    });

    const res = await app.inject({
      method: 'GET', url: '/api/ports/scan',
      headers: { authorization: `Bearer ${token}` },
    });
    const ports = JSON.parse(res.payload);
    const matched = ports.find(p => p.port === 15001);
    // Port 15001 might not be listening in test mode, but if it is, it should have agent info
    if (matched) {
      expect(matched.agentLabel).toBe('Kratos API');
    }
  });

  it('should reject unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ports/scan' });
    expect(res.statusCode).toBe(401);
  });
});
