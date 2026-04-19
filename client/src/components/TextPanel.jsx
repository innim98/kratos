import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils.js';

export default function TextPanel({ agentId }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="flex flex-col h-full">
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
      <pre className="flex-1 overflow-auto p-3 text-sm font-mono whitespace-pre-wrap break-words bg-background select-text">
        {text}
      </pre>
    </div>
  );
}
