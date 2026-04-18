import puppeteer from 'puppeteer';

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

  // Inject rrweb record script before page loads
  await page.evaluateOnNewDocument(`
    window.__rrweb_events = [];
    window.__rrweb_listeners = [];
  `);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});

  // Inject rrweb record via CDN
  await page.addScriptTag({
    url: 'https://cdn.jsdelivr.net/npm/rrweb@2.0.0-alpha.17/dist/record/rrweb-record.min.js',
  }).catch(() => {});

  // Start recording
  await page.evaluate(`
    if (typeof rrwebRecord !== 'undefined') {
      rrwebRecord({
        emit(event) {
          window.__rrweb_events.push(event);
          for (const fn of window.__rrweb_listeners) fn(event);
        },
      });
    }
  `).catch(() => {});

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
