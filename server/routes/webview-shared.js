import { getWebview } from './webview.js';
import { getOrCreateSession, destroySession } from '../lib/shared-screen.js';

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

    // Send existing events (snapshot + mutations so far)
    try {
      const events = await session.page.evaluate('window.__rrweb_events || []');
      if (events.length > 0) {
        socket.send(JSON.stringify({ type: 'rrweb-events', data: events }));
      }
    } catch {
      // page might be navigating
    }

    // Listen for new events from rrweb
    const eventListener = async (event) => {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'rrweb-event', data: event }));
      }
    };

    try {
      await session.page.evaluate(`
        window.__rrweb_listeners.push((event) => {
          // Events are buffered and polled by the server
        });
      `);
    } catch {
      // ignore
    }

    // Poll for new events (simpler than CDP for cross-browser compat)
    const pollInterval = setInterval(async () => {
      if (socket.readyState !== 1) {
        clearInterval(pollInterval);
        return;
      }
      try {
        const newEvents = await session.page.evaluate(`
          const events = window.__rrweb_events.splice(0);
          events;
        `);
        for (const event of newEvents) {
          socket.send(JSON.stringify({ type: 'rrweb-event', data: event }));
        }
      } catch {
        // page might have been closed
      }
    }, 100);

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
      clearInterval(pollInterval);
      session.clients.delete(socket);

      // Destroy session when no clients remain
      if (session.clients.size === 0) {
        setTimeout(() => {
          const current = getOrCreateSession.sessions?.get(agentId);
          if (current && current.clients.size === 0) {
            destroySession(agentId);
          }
        }, 30000); // 30s grace period
      }
    });
  });
}
