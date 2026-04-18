import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// One Puppeteer instance per agent
const sessions = new Map();

export async function getOrCreateSession(agentId, webview) {
  if (sessions.has(agentId)) {
    return sessions.get(agentId);
  }

  const url = `http://localhost:${webview.port}${webview.path}`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 }).catch((e) => {
    console.error('[shared-screen] page.goto failed:', e.message);
  });

  // Use rrweb from node_modules instead of CDN
  let rrwebScript;
  try {
    // UMD build exposes global `rrweb` with rrweb.record
    const rrwebPath = path.join(__dirname, '..', 'node_modules', 'rrweb', 'dist', 'rrweb.umd.cjs');
    if (fs.existsSync(rrwebPath)) {
      rrwebScript = fs.readFileSync(rrwebPath, 'utf8');
    }
  } catch {}

  // Initialize event buffer
  await page.evaluate(`window.__kratos_events = [];`);

  if (rrwebScript) {
    // Inject rrweb inline
    await page.evaluate(rrwebScript).catch((e) => {
      console.error('[shared-screen] rrweb inject failed:', e.message);
    });

    // Start recording — try various global names
    await page.evaluate(`
      (function() {
        var record = typeof rrwebRecord !== 'undefined' ? rrwebRecord
                   : typeof rrweb !== 'undefined' && rrweb.record ? rrweb.record
                   : typeof exports !== 'undefined' && exports.record ? exports.record
                   : null;
        if (record) {
          record({ emit: function(e) { window.__kratos_events.push(e); } });
          window.__kratos_recording = true;
        } else {
          window.__kratos_recording = false;
          window.__kratos_error = 'rrweb record function not found';
        }
      })();
    `).catch((e) => {
      console.error('[shared-screen] rrweb record start failed:', e.message);
    });
  } else {
    console.error('[shared-screen] rrweb script not found, falling back to CDN');
    // Try CDN as last resort
    await page.addScriptTag({
      url: 'https://cdn.jsdelivr.net/npm/rrweb@latest/dist/record/rrweb-record.min.js',
    }).catch(() => {});

    await page.evaluate(`
      window.__kratos_events = [];
      if (typeof rrwebRecord !== 'undefined') {
        rrwebRecord({ emit: function(e) { window.__kratos_events.push(e); } });
        window.__kratos_recording = true;
      }
    `).catch(() => {});
  }

  // Log recording status
  const status = await page.evaluate(`({ recording: window.__kratos_recording, error: window.__kratos_error, eventCount: window.__kratos_events.length })`).catch(() => ({}));
  console.log('[shared-screen] agent', agentId, 'status:', JSON.stringify(status));

  const session = { browser, page, clients: new Set() };
  sessions.set(agentId, session);
  return session;
}

export async function destroySession(agentId) {
  const session = sessions.get(agentId);
  if (session) {
    await session.browser.close().catch(() => {});
    sessions.delete(agentId);
  }
}

export function getSession(agentId) {
  return sessions.get(agentId) || null;
}
