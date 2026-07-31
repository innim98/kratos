#!/usr/bin/env node
// Kratos MCP server (stdio).
//
// Exposes the Kratos agent-token API as MCP tools so agents (Claude Code, etc.)
// can call Kratos natively instead of via curl. Auth is automatic per tmux
// session (see lib/client.js). Register in an agent project's .mcp.json:
//
//   { "mcpServers": { "kratos": { "command": "node",
//       "args": ["/absolute/path/to/kratos/mcp/index.js"] } } }

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { api, getMe } from './lib/client.js';

const server = new McpServer({ name: 'kratos', version: '0.1.0' });

// Wrap a handler so its result is returned as MCP text content and any error is
// surfaced as an error result instead of crashing the transport.
function tool(name, description, schema, handler) {
  server.tool(name, description, schema, async (args) => {
    try {
      const result = await handler(args || {});
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  });
}

// ── Identity / directory ────────────────────────────────────────────────
tool('kratos_whoami', 'Get this agent\'s own id, name, is_manager and session_uuid.', {},
  () => getMe());

tool('kratos_directory', 'List all agents ({id, name, session_uuid}) so you can address them.', {},
  () => api('GET', '/api/agents/directory'));

// ── Status hook ─────────────────────────────────────────────────────────
tool('kratos_report_status',
  'Report this agent\'s status. working→idle transition triggers a "done" notification to the user.',
  { status: z.enum(['working', 'asking_permission', 'idle']) },
  ({ status }) => api('POST', '/api/agents/status', { status }));

// ── Messages (agent-to-agent) ───────────────────────────────────────────
tool('kratos_send_message',
  'Send a message to another agent. Address by numeric id (to) OR Claude Code session uuid (to_session). Returns 409 "no active session" if a session uuid has no live agent.',
  { to: z.number().int().optional(), to_session: z.string().optional(), body: z.string() },
  ({ to, to_session, body }) => {
    const payload = { body };
    if (to !== undefined) payload.to = to;
    if (to_session !== undefined) payload.to_session = to_session;
    return api('POST', '/api/messages', payload);
  });

tool('kratos_list_messages',
  'List a conversation. from = the other agent id; to defaults to me. Long threads are capped: set unread_only to skip already-read, and limit for the most recent N (default 20). Returns {total, unread_count, returned, all, unread}.',
  { from: z.number().int(), to: z.number().int().optional(),
    unread_only: z.boolean().optional(), limit: z.number().int().min(1).optional() },
  ({ from, to, unread_only, limit }) => {
    const qs = new URLSearchParams({ from: String(from) });
    if (to !== undefined) qs.set('to', String(to));
    if (unread_only) qs.set('unread', '1');
    qs.set('limit', String(limit ?? 20));
    return api('GET', `/api/messages?${qs.toString()}`);
  });

tool('kratos_mark_read', 'Mark messages from a sender as read.',
  { from: z.number().int() },
  ({ from }) => api('PUT', '/api/messages/read', { from }));

tool('kratos_subscribe_messages', 'Opt in to receive message notifications when idle.', {},
  () => api('POST', '/api/messages/subscribe'));

tool('kratos_unsubscribe_messages', 'Opt out of message notifications.', {},
  () => api('DELETE', '/api/messages/subscribe'));

// ── Todos ───────────────────────────────────────────────────────────────
tool('kratos_list_todos', 'List this agent\'s todos.', {},
  () => api('GET', '/api/todos'));

tool('kratos_create_todo', 'Create a todo.',
  { title: z.string(), priority: z.number().int().min(1).max(5).optional() },
  ({ title, priority }) => api('POST', '/api/todos', { title, ...(priority !== undefined ? { priority } : {}) }));

tool('kratos_complete_todo', 'Mark a todo completed.',
  { id: z.union([z.number().int(), z.string()]) },
  ({ id }) => api('PUT', `/api/todos/${id}`, { status: 'completed' }));

// ── Ports ───────────────────────────────────────────────────────────────
tool('kratos_register_port', 'Register a port this agent is serving (shown in the dashboard).',
  { port: z.number().int(), label: z.string().optional(), type: z.string().optional() },
  async ({ port, label, type }) => {
    const me = await getMe();
    return api('POST', `/api/agents/${me.id}/ports`, { port, ...(label ? { label } : {}), ...(type ? { type } : {}) });
  });

// ── Phases ──────────────────────────────────────────────────────────────
tool('kratos_list_phases', 'List phases (optionally filtered by project_code), each with its documents.',
  { project_code: z.string().optional() },
  ({ project_code }) => api('GET', `/api/phases${project_code ? `?project_code=${encodeURIComponent(project_code)}` : ''}`));

tool('kratos_create_phase', 'Create a phase.',
  { project_code: z.string(), name: z.string(), status: z.enum(['active', 'draft', 'done', 'deprecated']).optional() },
  ({ project_code, name, status }) => api('POST', '/api/phases', { project_code, name, ...(status ? { status } : {}) }));

tool('kratos_add_phase_document', 'Register a document to a phase.',
  { phase_id: z.union([z.number().int(), z.string()]), title: z.string(), doc_path: z.string(),
    status: z.enum(['active', 'draft', 'done', 'deprecated']).optional() },
  ({ phase_id, title, doc_path, status }) =>
    api('POST', `/api/phases/${phase_id}/documents`, { title, doc_path, ...(status ? { status } : {}) }));

// ── Manager-only (requires this agent's is_manager=1) ────────────────────
tool('kratos_set_nickname', '[Manager] Set/clear a nickname (≤10 chars, empty clears) on an agent.',
  { id: z.union([z.number().int(), z.string()]), nickname: z.string() },
  ({ id, nickname }) => api('PUT', `/api/agents/${id}/nickname`, { nickname }));

tool('kratos_set_session_uuid', '[Manager] Attach/clear a Claude Code session uuid on an agent (empty clears).',
  { id: z.union([z.number().int(), z.string()]), session_uuid: z.string() },
  ({ id, session_uuid }) => api('PUT', `/api/agents/${id}/session-uuid`, { session_uuid }));

tool('kratos_spawn_agent',
  '[Manager] Create a new agent session in a folder. 409 "too many agent for the folder" if the per-folder cap is reached.',
  { folder: z.string(), name: z.string(), nickname: z.string().optional(), session_uuid: z.string().optional() },
  ({ folder, name, nickname, session_uuid }) =>
    api('POST', '/api/agents/spawn', { folder, name, ...(nickname ? { nickname } : {}), ...(session_uuid ? { session_uuid } : {}) }));

const transport = new StdioServerTransport();
await server.connect(transport);
