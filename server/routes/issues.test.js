import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('issues API', () => {
  let app, userToken, agentToken, agentId, tmpDir;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kratos-issues-'));
    app = await buildServer({ testing: true });

    const reg = await app.inject({ method: 'POST', url: '/api/register', payload: { username: 'admin', password: 'admin123' } });
    userToken = JSON.parse(reg.payload).token;

    const agent = await app.inject({ method: 'POST', url: '/api/agents', headers: { authorization: `Bearer ${userToken}` }, payload: { name: 'issue-agent', tmux_session: 'issue-sess' } });
    const agentData = JSON.parse(agent.payload);
    agentId = agentData.id;
    agentToken = agentData.token;

    // Create project
    await app.inject({ method: 'POST', url: '/api/projects', headers: { authorization: `Bearer ${userToken}` }, payload: { code: 'HT', name: 'Hotel', folder: tmpDir } });
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create project', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects', headers: { authorization: `Bearer ${userToken}` } });
    expect(JSON.parse(res.payload).length).toBe(1);
  });

  it('user should create issue', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/issues',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { project_code: 'HT', title: 'Fix login bug', description: 'Safari issue', priority: 4, assignee_agent_id: agentId },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.issue_number).toBe(1);
    expect(body.reporter_type).toBe('user');
    expect(body.reporter_name).toBe('admin');
  });

  it('agent should create issue', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/issues',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { project_code: 'HT', title: 'Add tests', priority: 3 },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).issue_number).toBe(2);
  });

  it('should list issues', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/issues', headers: { authorization: `Bearer ${userToken}` } });
    expect(JSON.parse(res.payload).length).toBe(2);
  });

  it('should filter by project', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/issues?project_code=HT', headers: { authorization: `Bearer ${userToken}` } });
    expect(JSON.parse(res.payload).length).toBe(2);
  });

  it('should get issue detail', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/issues/HT-1', headers: { authorization: `Bearer ${userToken}` } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.title).toBe('Fix login bug');
    expect(body.comments).toEqual([]);
  });

  it('should add comment', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/issues/HT-1/comments',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { body: 'Looking into this' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).author_name).toBe('admin');
  });

  it('agent should reply to comment', async () => {
    const detail = await app.inject({ method: 'GET', url: '/api/issues/HT-1', headers: { authorization: `Bearer ${agentToken}` } });
    const commentId = JSON.parse(detail.payload).comments[0].id;

    const res = await app.inject({
      method: 'POST', url: '/api/issues/HT-1/comments',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { body: 'I will fix this', parent_id: commentId },
    });
    expect(res.statusCode).toBe(200);
  });

  it('agent should NOT complete user-reported issue', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/issues/HT-1',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { status: 'completed' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('agent should complete own issue', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/issues/HT-2',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { status: 'completed' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('user should complete any issue', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/issues/HT-1',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { status: 'completed' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('should export issue files', async () => {
    const readmePath = path.join(tmpDir, 'history', 'README.md');
    const issuePath = path.join(tmpDir, 'history', 'HT-1.md');

    expect(fs.existsSync(readmePath)).toBe(true);
    expect(fs.existsSync(issuePath)).toBe(true);

    const readme = fs.readFileSync(readmePath, 'utf8');
    expect(readme).toContain('READ-ONLY');
    expect(readme).toContain('HT-1');

    const issueFile = fs.readFileSync(issuePath, 'utf8');
    expect(issueFile).toContain('READ-ONLY');
    expect(issueFile).toContain('Fix login bug');
    expect(issueFile).toContain('Looking into this');
    expect(issueFile).toContain('I will fix this');
  });
});
