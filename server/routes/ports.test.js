import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../index.js';

describe('ports API', () => {
  let app, userToken, agentToken, agentId;

  beforeAll(async () => {
    app = await buildServer({ testing: true });
    const reg = await app.inject({
      method: 'POST', url: '/api/register',
      payload: { username: 'admin', password: 'admin123' },
    });
    userToken = JSON.parse(reg.payload).token;

    const agent = await app.inject({
      method: 'POST', url: '/api/agents',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'port-agent', tmux_session: 'port-sess' },
    });
    const data = JSON.parse(agent.payload);
    agentId = data.id;
    agentToken = data.token;
  });

  afterAll(async () => { await app.close(); });

  it('agent should register a port', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/agents/${agentId}/ports`,
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { port: 5432, label: 'PostgreSQL' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).port).toBe(5432);
  });

  it('should list agent ports', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/agents/${agentId}/ports`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const ports = JSON.parse(res.payload);
    expect(ports.length).toBe(1);
    expect(ports.some(p => p.label === 'PostgreSQL')).toBe(true);
  });

  it('should delete a port', async () => {
    const list = await app.inject({
      method: 'GET', url: `/api/agents/${agentId}/ports`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    const pg = JSON.parse(list.payload).find(p => p.label === 'PostgreSQL');

    const res = await app.inject({
      method: 'DELETE', url: `/api/agents/${agentId}/ports/${pg.id}`,
      headers: { authorization: `Bearer ${agentToken}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
