import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../index.js';

describe('user routes', () => {
  let app;
  let adminToken;

  beforeAll(async () => {
    app = await buildServer({ testing: true });

    // Create admin user
    const reg = await app.inject({
      method: 'POST', url: '/api/register',
      payload: { username: 'admin', password: 'admin123' },
    });
    adminToken = JSON.parse(reg.payload).token;
  });

  afterAll(async () => { await app.close(); });

  describe('PUT /api/me', () => {
    it('should update own username', async () => {
      const res = await app.inject({
        method: 'PUT', url: '/api/me',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { username: 'admin_new' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.token).toBeDefined();

      // verify new token has updated username
      const verify = await app.inject({
        method: 'GET', url: '/api/verify',
        headers: { authorization: `Bearer ${body.token}` },
      });
      expect(JSON.parse(verify.payload).username).toBe('admin_new');

      // restore for further tests
      adminToken = body.token;
    });

    it('should update own password', async () => {
      const res = await app.inject({
        method: 'PUT', url: '/api/me',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { currentPassword: 'admin123', newPassword: 'newpass99' },
      });
      expect(res.statusCode).toBe(200);

      // login with new password
      const login = await app.inject({
        method: 'POST', url: '/api/login',
        payload: { username: 'admin_new', password: 'newpass99' },
      });
      expect(login.statusCode).toBe(200);
      adminToken = JSON.parse(login.payload).token;
    });

    it('should reject password change without currentPassword', async () => {
      const res = await app.inject({
        method: 'PUT', url: '/api/me',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { newPassword: 'sneaky' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should reject unauthenticated', async () => {
      const res = await app.inject({ method: 'PUT', url: '/api/me', payload: {} });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('admin user management', () => {
    it('GET /api/users should list users (admin only)', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/users',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body).toHaveLength(1);
      expect(body[0].username).toBe('admin_new');
      expect(body[0]).not.toHaveProperty('password_hash');
    });

    it('POST /api/users should add user (admin only)', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/users',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { username: 'alice', password: 'alice123' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.id).toBeDefined();
      expect(body.role).toBe('user');
    });

    it('POST /api/users should reject non-admin', async () => {
      // login as alice (user role)
      const login = await app.inject({
        method: 'POST', url: '/api/login',
        payload: { username: 'alice', password: 'alice123' },
      });
      const aliceToken = JSON.parse(login.payload).token;

      const res = await app.inject({
        method: 'POST', url: '/api/users',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { username: 'bob', password: 'bob12345' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('DELETE /api/users/:id should remove user (admin only)', async () => {
      // get alice's id
      const list = await app.inject({
        method: 'GET', url: '/api/users',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const alice = JSON.parse(list.payload).find(u => u.username === 'alice');

      const res = await app.inject({
        method: 'DELETE', url: `/api/users/${alice.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('DELETE /api/users/:id should prevent self-deletion', async () => {
      const list = await app.inject({
        method: 'GET', url: '/api/users',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const admin = JSON.parse(list.payload).find(u => u.username === 'admin_new');

      const res = await app.inject({
        method: 'DELETE', url: `/api/users/${admin.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
