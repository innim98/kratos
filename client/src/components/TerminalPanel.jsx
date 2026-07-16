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

const TerminalPanel = forwardRef(function TerminalPanel({ agentId, onEnterText, serverPort }, ref) {
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

  // Text mode state
  const [textMode, setTextMode] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [textContent, setTextContent] = useState('');
  const textRef = useRef(null);
  const pollRef = useRef(null);
  const dragStartYRef = useRef(null);

  useImperativeHandle(ref, () => ({
    sendInput(text) {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data: text }));
      }
    },
    insertToInput(text) {
      const input = inputRef.current;
      if (!input) return;
      input.value = input.value ? `${input.value} ${text}` : text;
      saveDraft(agentId, input.value);
      input.focus();
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

  // Drag-and-drop a local file onto the terminal → upload to the agent's dir,
  // then type the resulting path(s) straight into the terminal. (Browsers hide
  // the original local path, so we upload and use the server-side path.)
  const uploadDroppedFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return [];
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    try {
      const res = await fetch(`/api/agents/${agentId}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.files || []).map(f => f.path);
    } catch { return []; }
  };

  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
  const handleTermDragOver = (e) => { if (hasFiles(e)) { e.preventDefault(); setDragOver(true); } };
  const handleTermDragLeave = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); };
  const handleTermDrop = async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    setDragOver(false);
    const paths = await uploadDroppedFiles(e.dataTransfer.files);
    if (paths.length) wsSend(paths.join(' ') + ' ');
  };

  // Safety net: clear the drag overlay whenever a drag ends anywhere on the
  // page (e.g. the file was dropped on the up4agent button, not the terminal),
  // otherwise the overlay can get stuck visible.
  useEffect(() => {
    const clear = () => setDragOver(false);
    window.addEventListener('drop', clear);
    window.addEventListener('dragend', clear);
    return () => {
      window.removeEventListener('drop', clear);
      window.removeEventListener('dragend', clear);
    };
  }, []);

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

  // --- Text mode ---
  const loadTextContent = async () => {
    const res = await apiFetch(`/api/agents/${agentId}/terminal/text`);
    if (res.ok) {
      const data = await res.json();
      setTextContent(prev => prev === data.text ? prev : data.text);
    }
  };

  const enterTextMode = () => {
    setTextMode(true);
    // Snapshot only: capture the terminal text at entry, no auto-refresh.
    loadTextContent();
  };

  // When the parent owns a Terminal/Text tab (AgentDetail), the TXT strip should
  // switch that top tab to "Text" instead of using the in-panel text overlay.
  const goText = () => { if (onEnterText) onEnterText(); else enterTextMode(); };

  const exitTextMode = () => {
    setTextMode(false);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  // Cleanup polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Auto-scroll text to bottom on content change
  useEffect(() => {
    if (textMode && textRef.current) {
      textRef.current.scrollTop = textRef.current.scrollHeight;
    }
  }, [textContent, textMode]);


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

    termRef.current = term;
    fitRef.current = fit;

    const _el0 = containerRef.current;
    console.log(`[term] mount agent=${agentId} container=${_el0?.clientWidth}x${_el0?.clientHeight}`);

    // Fit only when the container actually has a size. xterm throws
    // "Cannot read properties of undefined (reading 'dimensions')" if fit()
    // runs while the container is 0×0 (common on mobile during initial layout
    // or when the panel mounts briefly hidden), which leaves the renderer
    // uninitialized and the terminal permanently blank. Never let fit throw.
    const safeFit = () => {
      const el = containerRef.current;
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return false;
      try { fit.fit(); return true; } catch { return false; }
    };

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = getToken();
    // Connect straight to the backend port when it differs from the page's port
    // (dev: page on Vite :15000, backend :15001). This bypasses the Vite dev
    // WebSocket proxy, which drops the terminal upgrade for remote/mobile
    // clients (e.g. iPhone over Tailscale) even though plain HTTP still works —
    // the cause of a black terminal while Text mode (HTTP fetch) works fine.
    // In production (single port) serverPort matches location.port, so this is
    // identical to using the current host.
    const wsHost = (serverPort && String(serverPort) !== window.location.port)
      ? `${window.location.hostname}:${serverPort}`
      : window.location.host;
    console.log(`[term] ws connect ${protocol}//${wsHost} (page host ${window.location.host}, serverPort ${serverPort})`);
    const ws = new WebSocket(`${protocol}//${wsHost}/ws/terminal?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      const { cols, rows } = term;
      console.log(`[term] ws open agent=${agentId} attach ${cols}x${rows}`);
      ws.send(JSON.stringify({ type: 'attach', agentId, cols, rows }));
    };
    ws.onerror = (e) => { console.warn(`[term] ws error agent=${agentId}`, e?.message || e?.type || e); };

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
      if (!safeFit()) return;
      if (ws.readyState === WebSocket.OPEN) {
        const { cols, rows } = term;
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    // Initial fit, deferred past layout and retried for up to ~1s until the
    // container has a real size — otherwise the very first fit can no-op and
    // the terminal stays blank until an unrelated resize happens.
    let rafId = 0;
    let fitTries = 0;
    const initialFit = () => {
      const el = containerRef.current;
      if (el && el.clientWidth > 0 && el.clientHeight > 0) {
        handleResize();
        console.log(`[term] initial fit ok after ${fitTries} tries → ${term.cols}x${term.rows}`);
        return;
      }
      if (fitTries++ < 60) { rafId = requestAnimationFrame(initialFit); return; }
      console.warn(`[term] container still ${el?.clientWidth}x${el?.clientHeight} after ${fitTries} tries — terminal may render blank`);
    };
    rafId = requestAnimationFrame(initialFit);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'detach' }));
        }
        ws.close();
      } catch {}
      term.dispose();
    };
  }, [agentId, serverPort]);

  return (
    <div className="flex flex-col w-full h-full min-h-0">
      {/* Text mode overlay */}
      {textMode && (
        <div className="flex flex-col flex-1 min-h-0 relative" style={{ background: '#151515' }}>
          {(
            <div
              className="absolute top-0 right-0 w-[40px] h-full flex items-center justify-center z-10 touch-none"
              style={{ background: 'rgba(255,255,255,0.08)' }}
              onClick={exitTextMode}
              onTouchStart={(e) => { dragStartYRef.current = e.touches[0].clientY; }}
              onTouchMove={(e) => {
                if (dragStartYRef.current == null || !textRef.current) return;
                const el = e.currentTarget;
                const rect = el.getBoundingClientRect();
                const ratio = (e.touches[0].clientY - rect.top) / rect.height;
                const maxScroll = textRef.current.scrollHeight - textRef.current.clientHeight;
                textRef.current.scrollTop = ratio * maxScroll;
              }}
              onTouchEnd={() => { dragStartYRef.current = null; }}
            >
              <span className="text-white/15 text-[10px] font-bold" style={{ writingMode: 'vertical-lr' }}>DRAG SCROLL · TAP BACK</span>
            </div>
          )}
          <pre
            ref={textRef}
            className="flex-1 overflow-auto p-3 whitespace-pre-wrap break-words select-text"
            style={{
              background: '#151515',
              color: '#e0e0e0',
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
              fontSize: '13px',
              lineHeight: '1.4',
            }}
          >
            {textContent || 'Loading...'}
          </pre>
        </div>
      )}

      {/* Terminal */}
      <div
        className={cn('flex-1 min-h-0 relative', textMode && 'hidden')}
        onDragOver={handleTermDragOver}
        onDragLeave={handleTermDragLeave}
        onDrop={handleTermDrop}
      >
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ background: '#0a0a0a' }}
        />
        {dragOver && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-primary/20 border-2 border-dashed border-primary pointer-events-none">
            <span className="text-sm font-medium text-primary bg-background/85 px-3 py-1.5 rounded shadow">
              여기에 놓으면 업로드 후 경로를 터미널에 입력
            </span>
          </div>
        )}
        {(
          <div
            className="absolute top-0 right-0 w-[40px] h-full flex items-center justify-center z-10 touch-none"
            style={{ background: 'rgba(255,255,255,0.05)' }}
            onClick={(e) => { e.stopPropagation(); goText(); }}
            onTouchStart={(e) => {
              dragStartYRef.current = e.touches[0].clientY;
            }}
            onTouchMove={(e) => {
              if (dragStartYRef.current == null) return;
              if (!textMode && Math.abs(e.touches[0].clientY - dragStartYRef.current) > 10) {
                goText();
              }
              if (textRef.current) {
                const el = e.currentTarget;
                const rect = el.getBoundingClientRect();
                const ratio = (e.touches[0].clientY - rect.top) / rect.height;
                const maxScroll = textRef.current.scrollHeight - textRef.current.clientHeight;
                textRef.current.scrollTop = ratio * maxScroll;
              }
            }}
            onTouchEnd={() => { dragStartYRef.current = null; }}
          >
            <span className="text-white/40 text-[9px] font-bold" style={{ writingMode: 'vertical-lr' }}>TXT</span>
          </div>
        )}
      </div>

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
