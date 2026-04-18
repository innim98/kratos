import { getWebview } from './webview.js';
import { getOrCreateSession, destroySession } from '../lib/shared-screen.js';

// Per-agent event buffer stored server-side (not in Puppeteer page)
const agentEvents = new Map();

export default async function webviewSharedRoutes(app) {
  app.get('/ws/agents/:id/shared', { websocket: true, preHandler: async (request, reply) => {
    const token = request.query.token;
    if (!token) return reply.code(401).send({ error: 'Token required' });
    try {
      request.user = app.jwt.verify(token);
    } catch {
      return reply.code(401).send({ error: 'Invalid token' });
    }
  }}, async (socket, request) => {
    const agentId = Number(request.params.id);
    const webview = getWebview(agentId);

    if (!webview) {
      socket.send(JSON.stringify({ type: 'error', message: 'No webview registered' }));
      socket.close();
      return;
    }

    let session;
    try {
      session = await getOrCreateSession(agentId, webview);
    } catch (e) {
      socket.send(JSON.stringify({ type: 'error', message: `Failed to launch browser: ${e.message}` }));
      socket.close();
      return;
    }

    session.clients.add(socket);

    // Initialize server-side event buffer if needed + start polling from Puppeteer
    if (!agentEvents.has(agentId)) {
      agentEvents.set(agentId, []);
      startPolling(agentId, session);
    }

    // Send ALL existing events to new client (includes full snapshot)
    const events = agentEvents.get(agentId);
    if (events.length > 0) {
      socket.send(JSON.stringify({ type: 'rrweb-events', data: events }));
    }

    // Handle input from client
    socket.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type !== 'shared-input' || !session.page) return;

      const { event } = msg;
      try {
        if (event.type === 'click') {
          await session.page.mouse.click(event.x, event.y);
        } else if (event.type === 'keypress') {
          await session.page.keyboard.press(event.key);
        } else if (event.type === 'type') {
          await session.page.keyboard.type(event.text);
        } else if (event.type === 'scroll') {
          await session.page.evaluate(`window.scrollTo(${event.x}, ${event.y})`);
        }
      } catch {
        // input injection failed
      }
    });

    socket.on('close', () => {
      session.clients.delete(socket);

      if (session.clients.size === 0) {
        setTimeout(() => {
          if (session.clients.size === 0) {
            stopPolling(agentId);
            agentEvents.delete(agentId);
            destroySession(agentId);
          }
        }, 30000);
      }
    });
  });
}

// Poll Puppeteer for new rrweb events, store in server buffer, broadcast to all clients
const pollers = new Map();

function startPolling(agentId, session) {
  if (pollers.has(agentId)) return;

  const interval = setInterval(async () => {
    try {
      const newEvents = await session.page.evaluate(`
        var e = window.__kratos_events.splice(0);
        e;
      `);
      if (newEvents.length === 0) return;

      const events = agentEvents.get(agentId);
      if (!events) return;

      for (const event of newEvents) {
        events.push(event);

        // Broadcast to all connected clients
        const msg = JSON.stringify({ type: 'rrweb-event', data: event });
        for (const client of session.clients) {
          if (client.readyState === 1) {
            client.send(msg);
          }
        }
      }
    } catch {
      // page might have been closed
    }
  }, 100);

  pollers.set(agentId, interval);
}

function stopPolling(agentId) {
  const interval = pollers.get(agentId);
  if (interval) {
    clearInterval(interval);
    pollers.delete(agentId);
  }
}
