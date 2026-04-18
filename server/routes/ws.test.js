import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../index.js';

describe('websocket route', () => {
  let app, token;

  beforeAll(async () => {
    app = await buildServer({ testing: true });
    await app.ready();
    const reg = await app.inject({
      method: 'POST', url: '/api/register',
      payload: { username: 'admin', password: 'admin123' },
    });
    token = JSON.parse(reg.payload).token;
  });

  afterAll(async () => { await app.close(); });

  it('should reject WS upgrade without token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ws/terminal',
      headers: { connection: 'upgrade', upgrade: 'websocket' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('should reject WS upgrade with invalid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ws/terminal?token=bad.token.here',
      headers: { connection: 'upgrade', upgrade: 'websocket' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('should have /ws/terminal route registered', async () => {
    // fastify/websocket routes return 404 via inject (no real WS upgrade)
    // but with invalid token they return 401, proving the route + preHandler exist
    const res = await app.inject({
      method: 'GET',
      url: '/ws/terminal?token=bad',
      headers: { connection: 'upgrade', upgrade: 'websocket' },
    });
    expect(res.statusCode).toBe(401);
  });
});
