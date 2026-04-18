import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../index.js';

describe('agent routes', () => {
  let app;
  let token;

  beforeAll(async () => {
    app = await buildServer({ testing: true });
    const reg = await app.inject({
      method: 'POST', url: '/api/register',
      payload: { username: 'admin', password: 'admin123' },
    });
    token = JSON.parse(reg.payload).token;
  });

  afterAll(async () => { await app.close(); });

  it('GET /api/agents should return empty list initially', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/agents',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual([]);
  });

  it('POST /api/agents should register agent', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/agents',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'code-reviewer', tmux_session: 'cr-01' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.id).toBeDefined();
    expect(body.name).toBe('code-reviewer');
    expect(body.type).toBe('unmanaged');
  });

  it('POST /api/agents should reject duplicate name', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/agents',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'code-reviewer', tmux_session: 'cr-02' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('GET /api/agents should include registered agent', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/agents',
      headers: { authorization: `Bearer ${token}` },
    });
    const agents = JSON.parse(res.payload);
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('code-reviewer');
    expect(agents[0]).toHaveProperty('status');
  });

  it('DELETE /api/agents/:id should unregister agent', async () => {
    const list = await app.inject({
      method: 'GET', url: '/api/agents',
      headers: { authorization: `Bearer ${token}` },
    });
    const agent = JSON.parse(list.payload)[0];

    const res = await app.inject({
      method: 'DELETE', url: `/api/agents/${agent.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);

    // verify gone
    const list2 = await app.inject({
      method: 'GET', url: '/api/agents',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(JSON.parse(list2.payload)).toHaveLength(0);
  });

  it('should reject unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/agents' });
    expect(res.statusCode).toBe(401);
  });
});
