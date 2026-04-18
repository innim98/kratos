import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('file upload', () => {
  let app, token, agentId;
  let tmpDir;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kratos-upload-test-'));

    // Create a tmux session in tmpDir for testing
    const sessionName = `kratos-upload-test-${Date.now()}`;
    const { execSync } = await import('child_process');
    try {
      execSync(`tmux new-session -d -s ${sessionName} -c ${tmpDir}`);
    } catch {}

    app = await buildServer({ testing: true });
    const reg = await app.inject({
      method: 'POST', url: '/api/register',
      payload: { username: 'admin', password: 'admin123' },
    });
    token = JSON.parse(reg.payload).token;

    const agent = await app.inject({
      method: 'POST', url: '/api/agents',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'upload-test', tmux_session: sessionName },
    });
    agentId = JSON.parse(agent.payload).id;
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const { execSync } = await import('child_process');
    try { execSync(`tmux kill-session -t kratos-upload-test-*`); } catch {}
  });

  it('should upload a file to agent working dir /tmp/kratos', async () => {
    const boundary = '----formdata-boundary';
    const filename = 'test.txt';
    const content = 'hello world';

    const body = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="files"; filename="${filename}"`,
      'Content-Type: text/plain',
      '',
      content,
      `--${boundary}--`,
    ].join('\r\n');

    const res = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/upload`,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.payload);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe('test.txt');

    // Verify file exists
    const uploadedPath = path.join(tmpDir, 'tmp', 'kratos', 'test.txt');
    expect(fs.existsSync(uploadedPath)).toBe(true);
    expect(fs.readFileSync(uploadedPath, 'utf8')).toBe('hello world');
  });

  it('should upload multiple files', async () => {
    const boundary = '----formdata-boundary2';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="files"; filename="a.txt"',
      'Content-Type: text/plain',
      '',
      'file A',
      `--${boundary}`,
      'Content-Disposition: form-data; name="files"; filename="b.txt"',
      'Content-Type: text/plain',
      '',
      'file B',
      `--${boundary}--`,
    ].join('\r\n');

    const res = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/upload`,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.payload);
    expect(result.files).toHaveLength(2);
  });

  it('should reject unauthenticated upload', async () => {
    const boundary = '----formdata-boundary3';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="x.txt"\r\nContent-Type: text/plain\r\n\r\ndata\r\n--${boundary}--`;

    const res = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/upload`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
  });
});
