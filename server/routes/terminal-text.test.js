import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../index.js';
import { execSync } from 'child_process';
import os from 'os';

describe('terminal text API', () => {
  let app, token, agentId;
  const sessionName = `kratos-text-test-${Date.now()}`;

  beforeAll(async () => {
    try { execSync(`tmux new-session -d -s ${sessionName} -c ${os.homedir()}`); } catch {}
    // Send some text to the session
    try { execSync(`tmux send-keys -t ${sessionName} 'echo hello-world' Enter`); } catch {}

    app = await buildServer({ testing: true });
    const reg = await app.inject({
      method: 'POST', url: '/api/register',
      payload: { username: 'admin', password: 'admin123' },
    });
    token = JSON.parse(reg.payload).token;

    const agent = await app.inject({
      method: 'POST', url: '/api/agents',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'text-test', tmux_session: sessionName },
    });
    agentId = JSON.parse(agent.payload).id;
  });

  afterAll(async () => {
    await app.close();
    try { execSync(`tmux kill-session -t ${sessionName}`); } catch {}
  });

  it('should return plain text terminal content', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/agents/${agentId}/terminal/text`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.text).toContain('hello-world');
    expect(body.text).not.toContain('\x1b'); // no ANSI escape codes
  });

  it('should reject unauthenticated', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/agents/${agentId}/terminal/text`,
    });
    expect(res.statusCode).toBe(401);
  });
});
