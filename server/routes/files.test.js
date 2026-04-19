import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('files API', () => {
  let app, token, agentId;
  let tmpDir, sessionName;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kratos-files-test-'));
    // Create test file structure
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# Hello\nWorld');
    fs.writeFileSync(path.join(tmpDir, 'app.js'), 'console.log("hi")');
    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export default {}');
    fs.mkdirSync(path.join(tmpDir, '.git'));
    fs.writeFileSync(path.join(tmpDir, '.git', 'config'), 'secret');

    sessionName = `kratos-files-test-${Date.now()}`;
    const { execSync } = await import('child_process');
    try { execSync(`tmux new-session -d -s ${sessionName} -c ${tmpDir}`); } catch {}

    app = await buildServer({ testing: true });
    const reg = await app.inject({
      method: 'POST', url: '/api/register',
      payload: { username: 'admin', password: 'admin123' },
    });
    token = JSON.parse(reg.payload).token;

    const agent = await app.inject({
      method: 'POST', url: '/api/agents',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'files-test', tmux_session: sessionName },
    });
    agentId = JSON.parse(agent.payload).id;
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const { execSync } = await import('child_process');
    try { execSync(`tmux kill-session -t ${sessionName}`); } catch {}
  });

  describe('GET /api/agents/:id/files', () => {
    it('should list files in agent working directory', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/agents/${agentId}/files`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      // macOS /var → /private/var symlink
      expect(body.path).toContain(path.basename(tmpDir));
      expect(body.entries.some(e => e.name === 'readme.md')).toBe(true);
      expect(body.entries.some(e => e.name === 'src' && e.type === 'directory')).toBe(true);
      // Should not include hidden dirs
      expect(body.entries.some(e => e.name === '.git')).toBe(false);
    });

    it('should list subdirectory', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/agents/${agentId}/files?path=src`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.entries.some(e => e.name === 'index.ts')).toBe(true);
    });

    it('should reject path traversal', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/agents/${agentId}/files?path=../../etc`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/agents/:id/files/read', () => {
    it('should read file content', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/agents/${agentId}/files/read?path=readme.md`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.content).toBe('# Hello\nWorld');
      expect(body.name).toBe('readme.md');
    });

    it('should read nested file', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/agents/${agentId}/files/read?path=src/index.ts`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.content).toBe('export default {}');
    });

    it('should reject path traversal', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/agents/${agentId}/files/read?path=../../etc/passwd`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should reject unauthenticated', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/agents/${agentId}/files/read?path=readme.md`,
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
