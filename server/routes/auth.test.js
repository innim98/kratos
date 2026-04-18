import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../index.js';

describe('auth routes', () => {
  let app;

  beforeAll(async () => {
    app = await buildServer({ testing: true });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/register', () => {
    it('should create first user as admin', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/register',
        payload: { username: 'admin1', password: 'test1234' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body).toHaveProperty('token');

      // verify the token contains admin role
      const verify = await app.inject({
        method: 'GET',
        url: '/api/verify',
        headers: { authorization: `Bearer ${body.token}` },
      });
      const vBody = JSON.parse(verify.payload);
      expect(vBody.valid).toBe(true);
      expect(vBody.role).toBe('admin');
      expect(vBody.username).toBe('admin1');
    });

    it('should reject registration when users already exist', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/register',
        payload: { username: 'another', password: 'test1234' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should reject missing fields', async () => {
      // fresh server for this test
      const app2 = await buildServer({ testing: true });
      const res = await app2.inject({
        method: 'POST',
        url: '/api/register',
        payload: { username: '' },
      });
      expect(res.statusCode).toBe(400);
      await app2.close();
    });

    it('should reject short password', async () => {
      const app2 = await buildServer({ testing: true });
      const res = await app2.inject({
        method: 'POST',
        url: '/api/register',
        payload: { username: 'user1', password: 'ab' },
      });
      expect(res.statusCode).toBe(400);
      await app2.close();
    });
  });

  describe('POST /api/login', () => {
    it('should login with correct credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/login',
        payload: { username: 'admin1', password: 'test1234' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body).toHaveProperty('token');
    });

    it('should reject wrong password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/login',
        payload: { username: 'admin1', password: 'wrong' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('should reject non-existent user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/login',
        payload: { username: 'nobody', password: 'test1234' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/verify', () => {
    it('should reject missing token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/verify',
      });
      expect(res.statusCode).toBe(401);
    });

    it('should reject invalid token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/verify',
        headers: { authorization: 'Bearer invalid.token.here' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/status', () => {
    it('should return hasUsers true after registration', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/status',
      });
      const body = JSON.parse(res.payload);
      expect(body.hasUsers).toBe(true);
    });
  });
});
