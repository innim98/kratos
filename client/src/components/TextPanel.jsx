import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../lib/api.js';
import { RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils.js';

export default function TextPanel({ agentId, onBack }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const preRef = useRef(null);

  const loadText = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch(`/api/agents/${agentId}/terminal/text`);
    if (res.ok) {
      const data = await res.json();
      setText(data.text);
    }
    setLoading(false);
  }, [agentId]);

  useEffect(() => { loadText(); }, [loadText]);

  // Scroll to bottom when text loads
  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [text]);

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card/50 shrink-0">
        <span className="text-xs text-muted-foreground">Terminal text (select & copy)</span>
        <button
          onClick={loadText}
          disabled={loading}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50"
          title="Refresh"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </button>
      </div>
      <pre ref={preRef} className={cn('flex-1 overflow-auto p-3 text-sm md:text-sm text-xs font-mono whitespace-pre-wrap break-words bg-background select-text', onBack && 'pr-[44px]')}>
        {text}
      </pre>
      {/* Right-edge strip — tap to go back to the terminal (mirrors the TXT strip). */}
      {onBack && (
        <div
          className="absolute top-0 right-0 w-[40px] h-full flex items-center justify-center z-10 cursor-pointer"
          style={{ background: 'rgba(255,255,255,0.05)' }}
          onClick={(e) => { e.stopPropagation(); onBack(); }}
          title="Back to terminal"
        >
          <span className="text-white/40 text-[9px] font-bold" style={{ writingMode: 'vertical-lr' }}>TAP TO BACK</span>
        </div>
      )}
    </div>
  );
}
