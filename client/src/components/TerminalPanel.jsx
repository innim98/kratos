import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { getToken, apiFetch } from '../lib/api.js';
import { cn } from '../lib/utils.js';
import { ChevronUp, Send, Keyboard, History, X, Search, Mic, MicOff, Loader2, RefreshCw } from 'lucide-react';

const ESC = '\x1b';

const QUICK_KEYS = [
  { label: 'ESC', seq: ESC },
  { label: 'TAB', seq: '\t' },
  { label: '^C', seq: '\x03' },
  { label: '↑', seq: ESC + '[A' },
  { label: '↓', seq: ESC + '[B' },
  { label: 'PgUp', seq: ESC + '[5~' },
  { label: 'PgDn', seq: ESC + '[6~' },
  { label: 'q', seq: 'q' },
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

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() !== now.toDateString()) {
    return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
  }
  return time;
}

function getHistory(agentId) {
  try { return JSON.parse(localStorage.getItem(`kratos_input_history_${agentId}`)) || []; }
  catch { return []; }
}
function pushHistory(agentId, text) {
  const h = getHistory(agentId);
  if (h.length > 0 && h[0].text === text) return;
  h.unshift({ text, ts: Date.now() });
  if (h.length > 500) h.length = 500;
  localStorage.setItem(`kratos_input_history_${agentId}`, JSON.stringify(h));
}
function saveDraft(agentId, text) {
  localStorage.setItem(`kratos_input_draft_${agentId}`, text);
}
function loadDraft(agentId) {
  return localStorage.getItem(`kratos_input_draft_${agentId}`) || '';
}

const TerminalPanel = forwardRef(function TerminalPanel({ agentId }, ref) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const wsRef = useRef(null);
  const fitRef = useRef(null);
  const inputRef = useRef(null);
  const [showExtras, setShowExtras] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [showKeysOverride, setShowKeysOverride] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [recording, setRecording] = useState(false);
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

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
      pushHistory(agentId, text);
      wsSend(text);
      setTimeout(() => wsSend('\r'), 50);
      input.value = '';
      saveDraft(agentId, '');
      input.focus();
    } else {
      wsSend('\r');
    }
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleInputSend();
    }
  };

  const handleInputChange = () => {
    if (inputRef.current) saveDraft(agentId, inputRef.current.value);
  };

  // Restore draft on mount
  useEffect(() => {
    if (inputRef.current) inputRef.current.value = loadDraft(agentId);
  }, [agentId]);

  // Save draft on background/unload
  useEffect(() => {
    const save = () => { if (inputRef.current) saveDraft(agentId, inputRef.current.value); };
    document.addEventListener('visibilitychange', save);
    window.addEventListener('beforeunload', save);
    return () => {
      document.removeEventListener('visibilitychange', save);
      window.removeEventListener('beforeunload', save);
    };
  }, [agentId]);

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setVoiceProcessing(true);
        const formData = new FormData();
        formData.append('files', blob, 'voice.webm');
        try {
          const res = await fetch(`/api/agents/${agentId}/voice`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${getToken()}` },
            body: formData,
          });
          const data = await res.json();
          if (data.text && termRef.current) {
            termRef.current.write(`\r\n\x1b[36m[Voice: ${data.text}]\x1b[0m\r\n`);
          } else if (data.error) {
            termRef.current?.write(`\r\n\x1b[31m[Voice error: ${data.error}]\x1b[0m\r\n`);
          }
        } catch {
          termRef.current?.write('\r\n\x1b[31m[Voice upload failed]\x1b[0m\r\n');
        }
        setVoiceProcessing(false);
      };
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setRecording(true);
    } catch {
      termRef.current?.write('\r\n\x1b[31m[Microphone access denied]\x1b[0m\r\n');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
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
        if (msg.message?.includes('posix_spawnp')) {
          const release = window.confirm('PTY 자원이 부족합니다. Orphan PTY를 정리할까요?');
          if (release) {
            apiFetch('/api/pty-release', { method: 'POST' }).then(r => r.json()).then(d => {
              term.write(`\r\n\x1b[33m[Released ${d.released} orphan PTYs (${d.before?.serverPtmxFds} → ${d.after?.serverPtmxFds})]\x1b[0m\r\n`);
            }).catch(() => {});
          }
        }
      } else if (msg.type === 'voice-speak') {
        term.write(`\r\n\x1b[35m[🔊 ${msg.agentName}: ${msg.text}]\x1b[0m\r\n`);
        try {
          const utterance = new SpeechSynthesisUtterance(msg.text);
          utterance.lang = 'ko-KR';
          speechSynthesis.speak(utterance);
        } catch {}
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

      {/* Extra keys panel */}
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

      {/* Quick keys row — manually toggled */}
      {showKeysOverride && (
        <div className="flex items-center gap-1 px-2 py-1 border-t border-border bg-card/80 shrink-0">
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
        </div>
      )}

      {/* History panel */}
      {showHistory && (
        <div className="max-h-48 border-t border-border bg-card/95 flex flex-col shrink-0">
          <div className="flex items-center gap-1 px-2 py-1 border-b border-border">
            <Search className="h-3 w-3 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search history..."
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              className="flex-1 min-w-0 h-6 px-1.5 text-xs bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
              autoFocus
            />
            <button onMouseDown={e => e.preventDefault()} onClick={() => { setShowHistory(false); setHistorySearch(''); }} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {getHistory(agentId)
              .filter(h => !historySearch || h.text.toLowerCase().includes(historySearch.toLowerCase()))
              .map((h, i) => (
                <div key={`${h.ts}-${i}`} className="flex items-center gap-1 px-2 py-1.5 hover:bg-accent/50 border-b border-border/50 text-xs">
                  <button
                    className="flex-1 min-w-0 text-left truncate text-foreground"
                    onClick={() => {
                      if (inputRef.current) { inputRef.current.value = h.text; saveDraft(agentId, h.text); }
                      setShowHistory(false); setHistorySearch('');
                      inputRef.current?.focus();
                    }}
                  >
                    {h.text}
                  </button>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatTime(h.ts)}
                  </span>
                  <button
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      const hist = getHistory(agentId).filter((_, j) => j !== i);
                      localStorage.setItem(`kratos_input_history_${agentId}`, JSON.stringify(hist));
                      setHistorySearch(s => s); // force re-render
                    }}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))
            }
            {getHistory(agentId).length === 0 && (
              <p className="text-center text-muted-foreground text-xs py-4">No history</p>
            )}
          </div>
        </div>
      )}

      {/* Bottom bar: buttons + IME input */}
      <div className="flex items-center gap-1 px-2 py-1 border-t border-border bg-card/80 shrink-0">
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShowKeysOverride(v => !v)}
          className={cn(
            'px-1.5 py-0.5 text-xs rounded flex items-center gap-0.5',
            showKeysOverride ? 'bg-accent text-accent-foreground' : 'bg-secondary text-secondary-foreground hover:bg-accent'
          )}
        >
          <Keyboard className="h-3 w-3" />
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShowHistory(v => !v)}
          className={cn(
            'px-1.5 py-0.5 text-xs rounded flex items-center gap-0.5',
            showHistory ? 'bg-accent text-accent-foreground' : 'bg-secondary text-secondary-foreground hover:bg-accent'
          )}
        >
          <History className="h-3 w-3" />
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={recording ? stopRecording : startRecording}
          disabled={voiceProcessing}
          className={cn(
            'px-1.5 py-0.5 text-xs rounded flex items-center gap-0.5',
            recording ? 'bg-red-500 text-white animate-pulse' : voiceProcessing ? 'bg-yellow-500/20 text-yellow-500' : 'bg-secondary text-secondary-foreground hover:bg-accent'
          )}
          title={recording ? 'Stop recording' : voiceProcessing ? 'Processing...' : 'Voice input'}
        >
          {voiceProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : recording ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
        </button>

        <input
          ref={inputRef}
          type="text"
          placeholder="Input..."
          onKeyDown={handleInputKeyDown}
          onChange={handleInputChange}
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
