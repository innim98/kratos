import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../index.js';
import os from 'os';

describe('folder routes', () => {
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

  it('GET /api/folders should list home directory', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/folders?path=${os.homedir()}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.path).toBe(os.homedir());
    expect(Array.isArray(body.entries)).toBe(true);
    // Should contain only directories, each with name and path
    for (const entry of body.entries) {
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('path');
    }
  });

  it('GET /api/folders should default to home if no path', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/folders',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.path).toBe(os.homedir());
  });

  it('GET /api/folders should reject non-existent path', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/folders?path=/nonexistent/path/xyz',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/folders should reject unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/folders' });
    expect(res.statusCode).toBe(401);
  });
});

describe('tmux session routes', () => {
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

  it('GET /api/tmux/sessions should return array', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/tmux/sessions',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/tmux/sessions should reject unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tmux/sessions' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/agents from folder', () => {
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

  it('should create agent from folder with auto-generated tmux session', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/agents',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'my-project', folder: os.homedir() },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.name).toBe('my-project');
    expect(body.tmux_session).toBeTruthy();
    expect(body.type).toBe('unmanaged');
  });
});
