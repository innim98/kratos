import { useState, useEffect } from 'react';
import { cn } from '../lib/utils.js';
import { getToken, apiFetch } from '../lib/api.js';
import SharedScreenView from './SharedScreenView.jsx';
import { Monitor, ScreenShare, RefreshCw } from 'lucide-react';

export default function WebviewPanel({ webview, agentId }) {
  const [mode, setMode] = useState('local');
  const [iframeKey, setIframeKey] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [backendPort, setBackendPort] = useState(null);

  useEffect(() => {
    apiFetch('/api/config').then(r => r.json()).then(d => {
      if (d.serverPort) setBackendPort(d.serverPort);
    });
  }, []);

  const handleRefresh = () => {
    setSpinning(true);
    setIframeKey(k => k + 1);
    setTimeout(() => setSpinning(false), 600);
  };

  if (!webview) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
        <Monitor className="h-5 w-5" />
        <span>No webview available</span>
      </div>
    );
  }

  // Point iframe directly to the agent's local dev server
  // The webview port is the agent's actual server — connect directly for full Vite HMR support
  const proxyUrl = `http://${window.location.hostname}:${webview.port}${webview.path}`;

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
        <button
          onClick={handleRefresh}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', spinning && 'animate-spin')} />
        </button>
        <span className="text-[10px] text-muted-foreground font-mono ml-1">
          :{webview.port}{webview.path}
        </span>
      </div>

      <div className="flex-1 min-h-0">
        {mode === 'local' ? (
          <iframe
            key={iframeKey}
            src={proxyUrl}
            className="w-full h-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title="Agent Webview (Local)"
          />
        ) : (
          <SharedScreenView key={`shared-${iframeKey}`} agentId={agentId} />
        )}
      </div>
    </div>
  );
}
