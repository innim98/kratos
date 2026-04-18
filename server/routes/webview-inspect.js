import puppeteer from 'puppeteer';
import { getWebview } from './webview.js';

// Reusable browser instance for inspect calls
let browser = null;

async function getBrowser() {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browser;
}

export default async function webviewInspectRoutes(app) {
  const localhostOnly = async (request, reply) => {
    const ip = request.ip;
    if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
      return reply.code(403).send({ error: 'Localhost only' });
    }
  };

  app.get('/api/agents/:id/webview/screenshot', { preHandler: localhostOnly }, async (request, reply) => {
    const webview = getWebview(Number(request.params.id));
    if (!webview) {
      return reply.code(404).send({ error: 'No webview registered' });
    }

    const url = `http://localhost:${webview.port}${webview.path}`;
    const b = await getBrowser();
    const page = await b.newPage();

    try {
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
      const buf = await page.screenshot({ type: 'png', fullPage: false });
      return { format: 'png', width: 1280, height: 720, base64: buf.toString('base64') };
    } catch (e) {
      return reply.code(502).send({ error: `Screenshot failed: ${e.message}` });
    } finally {
      await page.close();
    }
  });

  app.get('/api/agents/:id/webview/dom', { preHandler: localhostOnly }, async (request, reply) => {
    const webview = getWebview(Number(request.params.id));
    if (!webview) {
      return reply.code(404).send({ error: 'No webview registered' });
    }

    const url = `http://localhost:${webview.port}${webview.path}`;
    const b = await getBrowser();
    const page = await b.newPage();

    try {
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });

      const result = await page.evaluate(() => ({
        title: document.title,
        url: window.location.href,
        text: document.body.innerText,
        html: document.body.innerHTML.slice(0, 50000),
      }));

      return result;
    } catch (e) {
      return reply.code(502).send({ error: `DOM read failed: ${e.message}` });
    } finally {
      await page.close();
    }
  });

  app.addHook('onClose', async () => {
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
    }
  });
}
