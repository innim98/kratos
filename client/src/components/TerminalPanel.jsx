import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { getToken } from '../lib/api.js';
import { cn } from '../lib/utils.js';
import { ChevronUp, Send } from 'lucide-react';

const ESC = '\x1b';

const QUICK_KEYS = [
  { label: 'ESC', seq: ESC },
  { label: 'TAB', seq: '\t' },
  { label: '^C', seq: '\x03' },
  { label: '↑', seq: ESC + '[A' },
  { label: '↓', seq: ESC + '[B' },
];

const EXTRA_KEYS = [
  { section: 'Arrows' },
  { label: '←', seq: ESC + '[D' },
  { label: '→', seq: ESC + '[C' },
  { label: '↑', seq: ESC + '[A' },
  { label: '↓', seq: ESC + '[B' },
  { section: 'Nav' },
  { label: 'Home', seq: ESC + '[H' },
  { label: 'End', seq: ESC + '[F' },
  { label: 'PgUp', seq: ESC + '[5~' },
  { label: 'PgDn', seq: ESC + '[6~' },
  { label: 'Del', seq: ESC + '[3~' },
  { section: 'Ctrl' },
  { label: '^A', seq: '\x01' },
  { label: '^D', seq: '\x04' },
  { label: '^L', seq: '\x0c' },
  { label: '^R', seq: '\x12' },
  { label: '^U', seq: '\x15' },
  { label: '^W', seq: '\x17' },
  { label: '^Z', seq: '\x1a' },
];

const TerminalPanel = forwardRef(function TerminalPanel({ agentId }, ref) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const wsRef = useRef(null);
  const fitRef = useRef(null);
  const inputRef = useRef(null);
  const [showExtras, setShowExtras] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useImperativeHandle(ref, () => ({
    sendInput(text) {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data: text }));
      }
    },
  }));

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const wsSend = (data) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data }));
    }
  };

  const handleInputSend = () => {
    const input = inputRef.current;
    if (!input) return;
    const text = input.value;
    if (text) {
      wsSend(text);
      setTimeout(() => wsSend('\r'), 50);
    } else {
      wsSend('\r');
    }
    input.value = '';
    input.focus();
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleInputSend();
    }
  };

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
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'detach' }));
        }
        ws.close();
      } catch {}
      term.dispose();
    };
  }, [agentId]);

  return (
    <div className="flex flex-col w-full h-full min-h-0">
      {/* Terminal */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        style={{ background: '#0a0a0a' }}
      />

      {/* Extra keys panel (collapsible) */}
      {showExtras && (
        <div className="flex flex-wrap gap-1 px-2 py-1.5 border-t border-border bg-card/80">
          {EXTRA_KEYS.map((k, i) =>
            k.section ? (
              <span key={i} className="text-[10px] text-muted-foreground w-full mt-1 first:mt-0">{k.section}</span>
            ) : (
              <button
                key={i}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => wsSend(k.seq)}
                className="px-2 py-1 text-xs rounded bg-secondary text-secondary-foreground hover:bg-accent active:bg-accent/80"
              >
                {k.label}
              </button>
            )
          )}
        </div>
      )}

      {/* Bottom bar: quick keys + IME input */}
      <div className="flex items-center gap-1 px-2 py-1 border-t border-border bg-card/80 shrink-0">
        {/* Quick keys */}
        {QUICK_KEYS.map((k, i) => (
          <button
            key={i}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => wsSend(k.seq)}
            className="px-1.5 py-0.5 text-xs rounded bg-secondary text-secondary-foreground hover:bg-accent active:bg-accent/80"
          >
            {k.label}
          </button>
        ))}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShowExtras(v => !v)}
          className={cn(
            'px-1.5 py-0.5 text-xs rounded',
            showExtras ? 'bg-accent text-accent-foreground' : 'bg-secondary text-secondary-foreground hover:bg-accent'
          )}
        >
          <ChevronUp className={cn('h-3 w-3 transition-transform', showExtras && 'rotate-180')} />
        </button>

        {/* IME input field */}
        <input
          ref={inputRef}
          type="text"
          placeholder="Input..."
          onKeyDown={handleInputKeyDown}
          className="flex-1 min-w-0 h-7 px-2 text-base bg-background border border-input rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleInputSend}
          className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
});

export default TerminalPanel;
