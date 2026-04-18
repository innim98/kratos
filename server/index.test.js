import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from './index.js';

describe('server', () => {
  let app;

  beforeAll(async () => {
    app = await buildServer({ testing: true });
  });

  afterAll(async () => {
    await app.close();
  });

  it('should respond to GET /api/config', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('auth');
  });

  it('should respond to GET /api/status', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('hasUsers');
    expect(body.hasUsers).toBe(false);
  });
});
