# Kratos MCP server

Exposes the Kratos agent API as [MCP](https://modelcontextprotocol.io) tools so
agents (Claude Code, etc.) can call Kratos natively instead of via `curl`. It is
a thin stdio wrapper over the same HTTP API documented in
`requirements/initialization.md`.

## Auth

Each Kratos-registered tmux session carries `KRATOS_TOKEN` and `KRATOS_PORT`.
The server reads them from the process env first, then falls back to
`tmux show-environment` (the token lives in the tmux *session* env). So each
agent authenticates as itself with **no secrets in any config file**.

## Install / register

Install deps once:

```bash
cd /path/to/kratos/mcp && npm install
```

Register in an agent project's `.mcp.json` (all agents on one machine can point
to the same absolute path):

```jsonc
{
  "mcpServers": {
    "kratos": {
      "command": "node",
      "args": ["/absolute/path/to/kratos/mcp/index.js"]
    }
  }
}
```

Or via the CLI:

```bash
claude mcp add kratos -- node /absolute/path/to/kratos/mcp/index.js
```

## Tools

| Tool | Wraps |
|------|-------|
| `kratos_whoami` | `GET /api/agents/me` |
| `kratos_directory` | `GET /api/agents/directory` |
| `kratos_report_status` | `POST /api/agents/status` |
| `kratos_send_message` | `POST /api/messages` (`to` or `to_session`) |
| `kratos_list_messages` | `GET /api/messages` |
| `kratos_mark_read` | `PUT /api/messages/read` |
| `kratos_subscribe_messages` / `kratos_unsubscribe_messages` | `POST`/`DELETE /api/messages/subscribe` |
| `kratos_list_todos` / `kratos_create_todo` / `kratos_complete_todo` | `/api/todos` |
| `kratos_register_port` | `POST /api/agents/:id/ports` |
| `kratos_list_phases` / `kratos_create_phase` / `kratos_add_phase_document` | `/api/phases` |
| `kratos_set_nickname` *(manager)* | `PUT /api/agents/:id/nickname` |
| `kratos_set_session_uuid` *(manager)* | `PUT /api/agents/:id/session-uuid` |
| `kratos_spawn_agent` *(manager)* | `POST /api/agents/spawn` |

Manager tools require the calling agent's `is_manager=1` (set by a dashboard
user); otherwise the API returns 403.
