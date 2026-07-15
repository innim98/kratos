// In-memory console/error capture for on-device debugging.
//
// Mobile browsers make it hard to read the console. Because Kratos is a SPA,
// the JS context survives screen transitions, so we can buffer console output
// and uncaught errors from app start and let the user copy/download them later
// (see the "Logs" button on the agent list).

const MAX_ENTRIES = 1000;
const entries = [];

function push(level, parts) {
  const text = parts
    .map((p) => {
      if (typeof p === 'string') return p;
      if (p instanceof Error) return `${p.name}: ${p.message}\n${p.stack || ''}`;
      try { return JSON.stringify(p); } catch { return String(p); }
    })
    .join(' ');
  entries.push({ t: Date.now(), level, text });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
}

let installed = false;

export function installLogCapture() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[level] ? console[level].bind(console) : () => {};
    console[level] = (...args) => {
      try { push(level, args); } catch {}
      original(...args);
    };
  }

  window.addEventListener('error', (e) => {
    // Resource load errors have no `error` object; still record the message.
    const detail = e.error || `${e.message || 'Error'} @ ${e.filename || ''}:${e.lineno || ''}:${e.colno || ''}`;
    push('uncaught', [detail]);
  });

  window.addEventListener('unhandledrejection', (e) => {
    push('promise', [e.reason ?? 'unhandledrejection']);
  });

  push('info', [`[logbuffer] capture started — ${navigator.userAgent}`]);
}

export function getLogText() {
  const header = `Kratos client logs\nURL: ${location.href}\nUA: ${navigator.userAgent}\nCaptured: ${entries.length} entries\n${'='.repeat(48)}\n`;
  const body = entries
    .map((e) => `${new Date(e.t).toISOString()} [${e.level}] ${e.text}`)
    .join('\n');
  return header + body + '\n';
}

export function clearLogs() {
  entries.length = 0;
}

export function getLogCount() {
  return entries.length;
}
