import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { getToken } from '../lib/api.js';

const TerminalPanel = forwardRef(function TerminalPanel({ agentId }, ref) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const wsRef = useRef(null);
  const fitRef = useRef(null);

  useImperativeHandle(ref, () => ({
    sendInput(text) {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data: text }));
      }
    },
  }));

  useEffect(() => {
    if (!containerRef.current || !agentId) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      theme: {
        background: '#0a0a0a',
        foreground: '#e0e0e0',
        cursor: '#e0e0e0',
        selectionBackground: '#333333',
        black: '#0a0a0a',
        brightBlack: '#555555',
        white: '#e0e0e0',
        brightWhite: '#ffffff',
      },
      scrollback: 10000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = getToken();
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/terminal?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      const { cols, rows } = term;
      ws.send(JSON.stringify({ type: 'attach', agentId, cols, rows }));
    };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.type === 'output') {
        term.write(msg.data);
      } else if (msg.type === 'scrollback') {
        term.write(msg.data);
      } else if (msg.type === 'session-ended') {
        term.write('\r\n\x1b[90m[Session ended]\x1b[0m\r\n');
      } else if (msg.type === 'error') {
        term.write(`\r\n\x1b[31m[Error: ${msg.message}]\x1b[0m\r\n`);
      }
    };

    ws.onclose = () => {
      term.write('\r\n\x1b[90m[Disconnected]\x1b[0m\r\n');
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    const handleResize = () => {
      fit.fit();
      if (ws.readyState === WebSocket.OPEN) {
        const { cols, rows } = term;
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'detach' }));
        ws.close();
      }
      term.dispose();
    };
  }, [agentId]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-0"
      style={{ background: '#0a0a0a' }}
    />
  );
});

export default TerminalPanel;
