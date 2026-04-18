# Kratos

Agent dashboard for monitoring and interacting with AI agents (Claude, Codex, etc.) running in tmux sessions. Provides a web UI with live terminal access and webview panels.

## Quick Start

```bash
# 1. Install
cd server && npm install
cd ../client && npm install

# 2. Configure
cat > .env << 'EOF'
JWT_SECRET=$(uuidgen)
PORT=15001
CLIENT_PORT=15000
EOF

# 3. Run
cd server && node index.js --auth    # backend :15001
cd client && npm run dev             # frontend :15000
```

Open http://localhost:15000 — first user becomes admin.

## Architecture

```
┌─────────────┐  WebSocket  ┌──────────────┐  node-pty  ┌──────────────┐
│   Browser    │◄──────────►│   Fastify     │◄─────────►│ tmux attach  │
│ React+xterm  │             │   :15001      │            └──────┬───────┘
└─────────────┘             └──────────────┘                   │
       │  REST API               │  SQLite              ┌──────▼───────┐
       │◄───────────────────────►│◄────────────►        │ tmux server  │
                                                        │  agent-1     │
       Puppeteer (headless)─────►│                      │  agent-2     │
       rrweb DOM mirroring       │                      └──────────────┘
```

## Agent Integration API

These APIs are called by agents (Claude, Codex) running inside tmux sessions. All are **localhost-only** — no JWT required.

### Register Webview

When your agent starts a local web server, register it so the dashboard shows it:

```bash
# Register — users will see this page in the Webview panel
curl -X POST http://localhost:15001/api/agents/<ID>/webview \
  -H "Content-Type: application/json" \
  -d '{"port": 5173, "path": "/"}'

# Unregister
curl -X DELETE http://localhost:15001/api/agents/<ID>/webview
```

All connected dashboard users are notified in real-time via WebSocket.

### Read Webview (for Claude/Codex)

Agents can inspect what the webview currently looks like — useful for Claude to "see" a web page it generated.

#### Screenshot (PNG)

```bash
curl http://localhost:15001/api/agents/<ID>/webview/screenshot
```

Returns:
```json
{
  "format": "png",
  "width": 1280,
  "height": 720,
  "base64": "iVBORw0KGgo..."
}
```

The `base64` field is a PNG image. Claude can read this directly as a vision input. Save it to a file if needed:

```bash
curl -s http://localhost:15001/api/agents/<ID>/webview/screenshot \
  | jq -r '.base64' | base64 -d > screenshot.png
```

#### DOM Content (Text + HTML)

```bash
curl http://localhost:15001/api/agents/<ID>/webview/dom
```

Returns:
```json
{
  "title": "My App",
  "url": "http://localhost:5173/",
  "text": "Visible text content of the page...",
  "html": "<div>...</div>"
}
```

- `text` — `document.body.innerText` (what a user would see)
- `html` — `document.body.innerHTML` (truncated to 50KB)

### Example: Claude Workflow

```bash
# 1. Claude starts a dev server in its tmux session
npm run dev &

# 2. Register the webview
curl -X POST http://localhost:15001/api/agents/1/webview \
  -d '{"port": 5173, "path": "/"}' -H "Content-Type: application/json"

# 3. After making changes, check what the page looks like
curl http://localhost:15001/api/agents/1/webview/dom | jq '.text'

# 4. Or take a screenshot for visual inspection
curl http://localhost:15001/api/agents/1/webview/screenshot \
  | jq -r '.base64' | base64 -d > /tmp/check.png
```

## Dashboard API

These APIs require JWT authentication (`Authorization: Bearer <token>`).

### Auth

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | `{ hasUsers }` — determines create vs login mode |
| POST | `/api/register` | First user only → admin. `{ username, password }` → `{ token }` |
| POST | `/api/login` | `{ username, password }` → `{ token }` |
| GET | `/api/verify` | `{ valid, username, role }` |

### Users

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| PUT | `/api/me` | JWT | Update own username/password |
| GET | `/api/users` | admin | List all users |
| POST | `/api/users` | admin | Add user `{ username, password }` |
| DELETE | `/api/users/:id` | admin | Remove user (cannot delete self) |

### Agents

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/agents` | JWT | List agents + tmux status + webview state |
| POST | `/api/agents` | JWT | Register `{ name, tmux_session }` or `{ name, folder }` |
| DELETE | `/api/agents/:id` | JWT | Unregister (tmux session is not killed) |

### Webview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/agents/:id/webview` | localhost | Register `{ port, path }` |
| DELETE | `/api/agents/:id/webview` | localhost | Unregister |
| GET | `/api/agents/:id/webview/proxy/*` | JWT | HTTP proxy to agent's local server |
| GET | `/api/agents/:id/webview/screenshot` | localhost | PNG screenshot (base64) |
| GET | `/api/agents/:id/webview/dom` | localhost | Page title, text, html |

### WebSocket

| Path | Auth | Description |
|------|------|-------------|
| `/ws/terminal?token=<JWT>` | JWT | Terminal I/O (tmux attach via PTY) |
| `/ws/agents/:id/shared?token=<JWT>` | JWT | Shared Screen (rrweb DOM mirroring) |

### Filesystem

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/folders?path=...` | JWT | Browse directories (for agent creation) |
| GET | `/api/tmux/sessions` | JWT | List tmux sessions (for agent registration) |

## Webview Modes

The Webview panel has two modes, switchable via tabs:

| Mode | How it works | State sharing |
|------|-------------|---------------|
| **Local** | iframe → Kratos proxy → agent's localhost server | None (each user independent) |
| **Shared Screen** | Puppeteer renders on server, rrweb streams DOM to all clients | Full (all users see same screen) |

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, shadcn/ui, xterm.js, rrweb-player
- **Backend**: Fastify, better-sqlite3, node-pty, Puppeteer
- **Auth**: JWT (7-day expiry), bcrypt

## Development

```bash
# Run tests (57 tests)
cd server && npm test

# Run with watch
cd server && npm run test:watch

# Build client
cd client && npm run build
```
