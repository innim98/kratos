import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../index.js';
import fs from 'fs';
import path from 'path';

describe('attachments API', () => {
  let app, userToken;
  const projectsDir = path.join(__dirname, '..', '..', 'projects');

  beforeAll(async () => {
    app = await buildServer({ testing: true });
    const reg = await app.inject({ method: 'POST', url: '/api/register', payload: { username: 'admin', password: 'admin123' } });
    userToken = JSON.parse(reg.payload).token;

    await app.inject({ method: 'POST', url: '/api/projects', headers: { authorization: `Bearer ${userToken}` }, payload: { code: 'AT', name: 'Attach Test', folder: '/tmp' } });
    await app.inject({ method: 'POST', url: '/api/issues', headers: { authorization: `Bearer ${userToken}` }, payload: { project_code: 'AT', title: 'Test issue' } });
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(path.join(projectsDir, 'at'), { recursive: true, force: true });
  });

  it('should upload an image', async () => {
    const boundary = '----test-boundary';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="files"; filename="screenshot.png"',
      'Content-Type: image/png',
      '',
      'fake-png-data',
      `--${boundary}--`,
    ].join('\r\n');

    const res = await app.inject({
      method: 'POST', url: '/api/issues/AT-1/attachments',
      headers: { authorization: `Bearer ${userToken}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);
    expect(data.files).toHaveLength(1);
    expect(data.files[0].url).toContain('/api/issues/AT-1/attachments/');
  });

  it('should list attachments', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/issues/AT-1/attachments',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const files = JSON.parse(res.payload);
    expect(files.length).toBe(1);
  });

  it('should serve attachment', async () => {
    const list = await app.inject({
      method: 'GET', url: '/api/issues/AT-1/attachments',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const file = JSON.parse(list.payload)[0];

    const res = await app.inject({ method: 'GET', url: file.url });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toBe('fake-png-data');
  });
});
