import { useState } from 'react';
import { cn } from '../lib/utils.js';
import SharedScreenView from './SharedScreenView.jsx';
import { Monitor, ScreenShare } from 'lucide-react';

export default function WebviewPanel({ webview, agentId }) {
  const [mode, setMode] = useState('local');

  if (!webview) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
        <Monitor className="h-5 w-5" />
        <span>No webview available</span>
      </div>
    );
  }

  const proxyUrl = `/api/agents/${agentId}/webview/proxy/`;

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-card/50 shrink-0">
        <button
          onClick={() => setMode('local')}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs',
            mode === 'local' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Monitor className="h-3.5 w-3.5" /> Local
        </button>
        <button
          onClick={() => setMode('shared')}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs',
            mode === 'shared' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <ScreenShare className="h-3.5 w-3.5" /> Shared Screen
        </button>
        <span className="flex-1" />
        <span className="text-[10px] text-muted-foreground font-mono">
          :{webview.port}{webview.path}
        </span>
      </div>

      <div className="flex-1 min-h-0">
        {mode === 'local' ? (
          <iframe
            src={proxyUrl}
            className="w-full h-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title="Agent Webview (Local)"
          />
        ) : (
          <SharedScreenView agentId={agentId} />
        )}
      </div>
    </div>
  );
}
