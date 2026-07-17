// Kratos API client for the MCP server.
//
// Auth model: each agent's tmux session carries KRATOS_TOKEN / KRATOS_PORT
// (injected by Kratos). We resolve them from the process env first, then fall
// back to `tmux show-environment` — the token lives in the tmux *session* env,
// so a process started earlier may not have it in process.env. This mirrors
// server/templates/kratos-msg.sh and means no secrets ever live in config.

import { execSync } from 'node:child_process';

function tmuxEnv(name) {
  try {
    const out = execSync(`tmux show-environment ${name}`, { encoding: 'utf8', timeout: 3000 }).trim();
    // Format: "NAME=value". Unset variables print as "-NAME".
    if (out.startsWith('-')) return null;
    const eq = out.indexOf('=');
    return eq === -1 ? null : out.slice(eq + 1).trim();
  } catch {
    return null;
  }
}

let _token;
let _port;

export function getToken() {
  if (_token === undefined) _token = process.env.KRATOS_TOKEN || tmuxEnv('KRATOS_TOKEN') || null;
  return _token;
}

export function getBaseUrl() {
  if (_port === undefined) _port = process.env.KRATOS_PORT || tmuxEnv('KRATOS_PORT') || '15001';
  return `http://localhost:${_port}`;
}

// Perform an authenticated API call. Returns parsed JSON (or text). Throws on
// non-2xx with the server's error message so the MCP tool surfaces it clearly.
export async function api(method, path, body) {
  const token = getToken();
  if (!token) {
    throw new Error(
      'No KRATOS_TOKEN found (checked process env and `tmux show-environment`). ' +
      'Run this agent from a Kratos-registered tmux session.'
    );
  }
  const res = await fetch(getBaseUrl() + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && data.error) || text || res.statusText;
    throw new Error(`${res.status} ${msg}`);
  }
  return data;
}

// Cache the caller's own agent id/name (needed for id-scoped endpoints such as
// port registration) so tools don't re-query it every call.
let _mePromise;
export function getMe() {
  if (!_mePromise) _mePromise = api('GET', '/api/agents/me');
  return _mePromise;
}
