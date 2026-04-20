import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../index.js';

describe('todos API', () => {
  let app, userToken, agentToken, agentId;

  beforeAll(async () => {
    app = await buildServer({ testing: true });
    const reg = await app.inject({
      method: 'POST', url: '/api/register',
      payload: { username: 'admin', password: 'admin123' },
    });
    userToken = JSON.parse(reg.payload).token;

    const agent = await app.inject({
      method: 'POST', url: '/api/agents',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'todo-agent', tmux_session: 'todo-sess' },
    });
    const agentData = JSON.parse(agent.payload);
    agentId = agentData.id;
    agentToken = agentData.token;
  });

  afterAll(async () => { await app.close(); });

  it('user should create a todo', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/todos',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'Fix bug', priority: 4, agent_id: agentId },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.title).toBe('Fix bug');
    expect(body.created_by_type).toBe('user');
    expect(body.priority).toBe(4);
  });

  it('agent should create a todo', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/todos',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { title: 'Deploy', description: 'Deploy to prod' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.title).toBe('Deploy');
    expect(body.created_by_type).toBe('agent');
  });

  it('should list all todos', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/todos',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).length).toBe(2);
  });

  it('should filter todos by agent_id', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/todos?agent_id=${agentId}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    const todos = JSON.parse(res.payload);
    // Both user-created (bound to agent) and agent-created (auto-bound)
    expect(todos.length).toBe(2);
    expect(todos.some(t => t.title === 'Fix bug')).toBe(true);
  });

  it('user should complete agent-created todo', async () => {
    const list = await app.inject({
      method: 'GET', url: '/api/todos',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const agentTodo = JSON.parse(list.payload).find(t => t.created_by_type === 'agent');

    const res = await app.inject({
      method: 'PUT', url: `/api/todos/${agentTodo.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { status: 'completed' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).status).toBe('completed');
  });

  it('agent should NOT complete user-created todo', async () => {
    const list = await app.inject({
      method: 'GET', url: '/api/todos',
      headers: { authorization: `Bearer ${agentToken}` },
    });
    const userTodo = JSON.parse(list.payload).find(t => t.created_by_type === 'user');

    const res = await app.inject({
      method: 'PUT', url: `/api/todos/${userTodo.id}`,
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { status: 'completed' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('agent should complete own todo', async () => {
    // Create a new one since the previous agent todo was completed by user
    const create = await app.inject({
      method: 'POST', url: '/api/todos',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { title: 'Agent task 2' },
    });
    const todo = JSON.parse(create.payload);

    const res = await app.inject({
      method: 'PUT', url: `/api/todos/${todo.id}`,
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { status: 'completed' },
    });
    expect(res.statusCode).toBe(200);
  });
});
