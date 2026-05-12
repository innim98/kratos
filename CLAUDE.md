# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kratos is a web-based agent dashboard that monitors and controls AI agents (Claude, Codex, etc.) running in tmux sessions. It provides a JWT-authenticated dashboard with terminal access via xterm.js and webview panels with two modes: Local (proxy) and Shared Screen (rrweb DOM mirroring via Puppeteer).

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Fastify
- **Database**: better-sqlite3 (WAL mode)
- **Auth**: @fastify/jwt + bcryptjs (7-day token expiry)
- **Terminal**: xterm.js + node-pty → `tmux attach`
- **Shared Screen**: puppeteer + rrweb (record/replay)
- **WebSocket**: @fastify/websocket (terminal streaming + shared screen)

## Project Structure

Monorepo with two packages:
- `server/` — Fastify backend (API, WebSocket, tmux bridge, webview proxy, Puppeteer)
- `client/` — React + Vite frontend (SPA)

DB migrations live in `server/migrations/` as numbered SQL files (001_*.sql, 002_*.sql). A `migrations` table tracks applied versions. Server auto-applies pending migrations on startup.

## Architecture

### tmux Bridge

Agents are "unmanaged" — Kratos doesn't create/destroy them, it connects to existing tmux sessions registered in SQLite. Terminal flow:
1. `tmux capture-pane -p -e -S -` sends full scrollback with ANSI codes
2. `node-pty` spawns `tmux attach -t <session>` for live streaming
3. Client input → WebSocket → pty.write() → tmux → agent process

### Webview Dual Mode

Agents register webviews via `POST /api/agents/:id/webview { port, path }` (localhost-only, no JWT).

- **Local**: Kratos proxies HTTP/WS to `localhost:<port>` — each user gets independent DOM
- **Shared Screen**: Kratos loads page in Puppeteer, injects rrweb record, streams DOM snapshots + mutations to all clients via WebSocket. User input is forwarded to Puppeteer and DOM changes propagate to everyone.

### Sidebar Navigation States

Three states with contextual sidebar:
- **State A (Menu)**: Navigation buttons (Agents, Settings)
- **State B (Agent List)**: Sidebar stays as menu, viewport shows agent cards
- **State C (Agent Detail)**: Sidebar transforms into agent switcher list, viewport shows terminal + webview split

Mobile (<768px): Full-screen transitions with back buttons instead of sidebar.

### Webview Inspect API (for agents)

Agents can read back what their webview looks like — localhost-only, no JWT:
- `GET /api/agents/:id/webview/screenshot` → `{ format, base64, width, height }` (PNG)
- `GET /api/agents/:id/webview/dom` → `{ title, url, text, html }`

Both use a shared Puppeteer instance. Screenshot returns base64 PNG readable as vision input. DOM returns innerText + innerHTML (50KB max).

## Key Design Decisions

- Agent metadata in SQLite, live status from `tmux list-sessions` — merged at query time
- First registered user gets `role='admin'` automatically; admin manages other users via Settings
- Webview registration API is localhost-only (no JWT) since only local agent processes call it
- Terminal scrollback uses tmux's own buffer (`history-limit`) rather than server-side memory
- Split view modes (horizontal/vertical/terminal-only) persisted in localStorage

## Commands

```bash
# Server
cd server && npm install && node index.js --auth

# Client (dev)
cd client && npm install && npm run dev

# Tests (57 tests)
cd server && npm test

# Ports configured in .env: PORT=15001, CLIENT_PORT=15000
```

## Troubleshooting

### `posix_spawnp failed` — PTY limit exceeded

**Symptom**: Terminal attach fails with `posix_spawnp failed` error.

**Cause**: macOS default PTY limit is 511 (`kern.tty.ptmx_max`). Each Claude Code session pre-allocates ~14 bash processes. With 10+ tmux sessions this exceeds the limit.

**Check**:
```bash
ls /dev/ttys* | wc -l          # Current PTY count
sysctl kern.tty.ptmx_max       # Max allowed (default 511)
```

**Fix** (temporary):
```bash
sudo sysctl -w kern.tty.ptmx_max=1024
```

**Fix** (permanent):
```bash
echo "kern.tty.ptmx_max=1024" | sudo tee -a /etc/sysctl.conf
```

### Vite dev server crashes with `ECONNRESET`

**Symptom**: Client dev server (port 15000) stops responding.

**Cause**: Mobile/tablet browsers disconnect WebSocket abruptly (screen lock, network switch), causing unhandled errors in Vite's WS proxy.

**Fix**: Already handled in `vite.config.js` — proxy error handlers silently ignore socket errors. If the process still dies, restart with:
```bash
cd client && npx vite --host 0.0.0.0 --port 15000
```

### Activity monitor false alarms

**Symptom**: "Agent done" notification fires while agent is still working (e.g., during "Thinking..." or "Sketching...").

**Cause**: The activity monitor uses `tmux capture-pane` to detect the `❯` prompt. If the prompt pattern isn't detected, it falls back to idle-time detection (60s). Some agent states may not produce terminal output for extended periods.

**Tuning**: Edit `server/lib/activity-monitor.js`:
- `ACTIVE_THRESHOLD` (default 30s) — minimum active time before done can trigger
- `IDLE_THRESHOLD` (default 10s) — idle time for fallback detection (multiplied by 6 when prompt not found)
- `BUSY_PATTERNS` — regex patterns indicating agent is still working

## Full Requirements

See `requirements/initialization.md` for complete API specs, WebSocket protocol, UI wireframes, and phased implementation plan.
