import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rrwebDir = path.join(__dirname, '..', 'node_modules', 'rrweb', 'dist');

export default async function sharedPageRoutes(app) {
  // Serve rrweb UMD bundle
  app.get('/shared/rrweb.js', async (request, reply) => {
    const filePath = path.join(rrwebDir, 'rrweb.umd.cjs');
    reply.header('content-type', 'application/javascript');
    reply.header('cache-control', 'public, max-age=86400');
    return reply.send(fs.createReadStream(filePath));
  });

  // Serve rrweb CSS
  app.get('/shared/rrweb.css', async (request, reply) => {
    const filePath = path.join(rrwebDir, 'style.css');
    reply.header('content-type', 'text/css');
    reply.header('cache-control', 'public, max-age=86400');
    return reply.send(fs.createReadStream(filePath));
  });

  // Shared Screen page
  app.get('/shared/:id', async (request, reply) => {
    const { id } = request.params;
    const token = request.query.token;

    if (!token) {
      return reply.code(401).send('Token required');
    }

    try {
      app.jwt.verify(token);
    } catch {
      return reply.code(401).send('Invalid token');
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shared Screen - Agent #${id}</title>
  <link rel="stylesheet" href="/shared/rrweb.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #111; color: #e0e0e0; font-family: sans-serif; height: 100vh; display: flex; flex-direction: column; }
    #status { padding: 8px 16px; font-size: 13px; background: #1a1a1a; border-bottom: 1px solid #333; display: flex; align-items: center; gap: 8px; }
    #status .dot { width: 8px; height: 8px; border-radius: 50%; background: #555; }
    #status .dot.connected { background: #4caf50; }
    #status .dot.error { background: #e94560; }
    #player-container { flex: 1; overflow: hidden; display: flex; align-items: center; justify-content: center; }
    #error { color: #e94560; padding: 2rem; text-align: center; display: none; }
    .rr-player { background: #111 !important; }
    .rr-player__frame { background: white; }
    .rr-controller { display: none !important; }
  </style>
</head>
<body>
  <div id="status">
    <span class="dot" id="dot"></span>
    <span id="status-text">Connecting...</span>
    <span style="flex:1"></span>
    <span id="event-count" style="color:#666; font-size:11px;"></span>
  </div>
  <div id="player-container"></div>
  <div id="error"></div>

  <script src="/shared/rrweb.js"></script>
  <script>
    (function() {
      var dot = document.getElementById('dot');
      var statusText = document.getElementById('status-text');
      var eventCountEl = document.getElementById('event-count');
      var errorEl = document.getElementById('error');
      var container = document.getElementById('player-container');

      var token = ${JSON.stringify(token)};
      var agentId = ${JSON.stringify(id)};
      var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      var wsUrl = protocol + '//' + location.host + '/ws/agents/' + agentId + '/shared?token=' + encodeURIComponent(token);

      var replayer = null;
      var allEvents = [];
      var eventCount = 0;

      function showError(msg) {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
        dot.className = 'dot error';
        statusText.textContent = 'Error';
        console.error('[SharedScreen]', msg);
      }

      function log(msg) {
        console.log('[SharedScreen]', msg);
      }

      // Check rrweb loaded
      if (typeof rrweb === 'undefined') {
        showError('rrweb library failed to load');
        return;
      }
      log('rrweb loaded, Replayer available: ' + (typeof rrweb.Replayer !== 'undefined'));

      var ws = new WebSocket(wsUrl);

      ws.onopen = function() {
        dot.className = 'dot connected';
        statusText.textContent = 'Connected, waiting for snapshot...';
        log('WebSocket connected');
      };

      ws.onclose = function() {
        dot.className = 'dot';
        statusText.textContent = 'Disconnected';
        log('WebSocket closed');
      };

      ws.onerror = function(e) {
        showError('WebSocket error');
      };

      ws.onmessage = function(e) {
        var msg;
        try { msg = JSON.parse(e.data); } catch(err) { showError('Invalid message: ' + err.message); return; }

        if (msg.type === 'error') {
          showError(msg.message);
          return;
        }

        if (msg.type === 'rrweb-events') {
          log('Received initial batch: ' + msg.data.length + ' events');
          for (var i = 0; i < msg.data.length; i++) {
            allEvents.push(msg.data[i]);
          }
          initReplayer();
          return;
        }

        if (msg.type === 'rrweb-event') {
          eventCount++;
          eventCountEl.textContent = eventCount + ' events';
          allEvents.push(msg.data);

          if (replayer) {
            try {
              replayer.addEvent(msg.data);
            } catch(err) {
              log('addEvent error: ' + err.message);
            }
          } else {
            initReplayer();
          }
          return;
        }
      };

      function initReplayer() {
        if (replayer) return;
        if (allEvents.length === 0) return;

        // Need at least a full snapshot (type 2) to start
        var hasSnapshot = allEvents.some(function(e) { return e.type === 2; });
        if (!hasSnapshot) {
          statusText.textContent = 'Waiting for full snapshot...';
          log('No full snapshot yet, have ' + allEvents.length + ' events');
          return;
        }

        log('Initializing Replayer with ' + allEvents.length + ' events');
        try {
          replayer = new rrweb.Replayer(allEvents, {
            root: container,
            liveMode: true,
            showWarning: false,
            showDebug: false,
          });
          replayer.startLive();
          statusText.textContent = 'Live';
          log('Replayer started in live mode');
        } catch(err) {
          showError('Replayer init failed: ' + err.message);
          console.error(err);
        }
      }

      // Forward clicks to server → Puppeteer
      container.addEventListener('click', function(e) {
        if (ws.readyState !== WebSocket.OPEN) return;
        var rect = container.getBoundingClientRect();
        ws.send(JSON.stringify({
          type: 'shared-input',
          event: { type: 'click', x: e.clientX - rect.left, y: e.clientY - rect.top }
        }));
      });
    })();
  </script>
</body>
</html>`;

    reply.header('content-type', 'text/html');
    return reply.send(html);
  });
}
