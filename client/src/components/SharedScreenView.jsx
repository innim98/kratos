import { useEffect, useRef } from 'react';
import { getToken } from '../lib/api.js';

export default function SharedScreenView({ agentId }) {
  const containerRef = useRef(null);
  const wsRef = useRef(null);
  const iframeRef = useRef(null);

  useEffect(() => {
    if (!agentId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = getToken();
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/ws/agents/${agentId}/shared?token=${encodeURIComponent(token)}`
    );
    wsRef.current = ws;

    const allEvents = [];

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.type === 'rrweb-events') {
        // Initial batch of events
        allEvents.push(...msg.data);
        renderEvents(allEvents);
      } else if (msg.type === 'rrweb-event') {
        allEvents.push(msg.data);
        renderEvents(allEvents);
      } else if (msg.type === 'error') {
        if (containerRef.current) {
          containerRef.current.innerHTML = `<div style="color: #888; padding: 2rem; text-align: center;">${msg.message}</div>`;
        }
      }
    };

    // Simple replay: render events into a sandboxed iframe
    function renderEvents(events) {
      if (!containerRef.current) return;

      // Use rrweb-player if available, otherwise show event count
      if (!iframeRef.current) {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width: 100%; height: 100%; border: 0; background: white;';
        iframe.sandbox = 'allow-scripts allow-same-origin';
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(iframe);
        iframeRef.current = iframe;

        // Load rrweb replayer into iframe
        iframe.srcdoc = `
          <!DOCTYPE html>
          <html><head>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/rrweb-player@2.0.0-alpha.17/dist/style.css" />
            <style>
              body { margin: 0; background: #111; overflow: hidden; }
              .rr-player { width: 100vw !important; height: 100vh !important; }
              .rr-player__frame { width: 100% !important; height: 100% !important; }
              .rr-controller { display: none !important; }
            </style>
          </head><body>
            <div id="player"></div>
            <script src="https://cdn.jsdelivr.net/npm/rrweb-player@2.0.0-alpha.17/dist/index.js"><\/script>
            <script>
              window.replayer = null;
              window.updateEvents = function(events) {
                if (!events.length) return;
                if (window.replayer) {
                  // Add incremental events
                  for (const e of events) {
                    try { window.replayer.addEvent(e); } catch {}
                  }
                } else {
                  try {
                    window.replayer = new rrwebPlayer({
                      target: document.getElementById('player'),
                      props: {
                        events: events,
                        showController: false,
                        autoPlay: true,
                        liveMode: true,
                      },
                    });
                  } catch(e) {
                    document.body.innerHTML = '<div style="color:#888;padding:2rem">Replay error: ' + e.message + '</div>';
                  }
                }
              };
            <\/script>
          </body></html>
        `;
      }

      // Wait for iframe to load then send events
      const iframe = iframeRef.current;
      const tryUpdate = () => {
        if (iframe.contentWindow?.updateEvents) {
          iframe.contentWindow.updateEvents(events);
        } else {
          setTimeout(tryUpdate, 200);
        }
      };
      tryUpdate();
    }

    // Capture clicks on the container and forward to server
    const handleClick = (e) => {
      if (!iframeRef.current) return;
      const rect = iframeRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'shared-input', event: { type: 'click', x, y } }));
      }
    };

    containerRef.current?.addEventListener('click', handleClick);

    return () => {
      containerRef.current?.removeEventListener('click', handleClick);
      if (ws.readyState === WebSocket.OPEN) ws.close();
      iframeRef.current = null;
    };
  }, [agentId]);

  return <div ref={containerRef} className="w-full h-full bg-black" />;
}
