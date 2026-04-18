import { useState, useEffect } from 'react';
import { cn } from '../lib/utils.js';
import { getToken, apiFetch } from '../lib/api.js';
import { Monitor, ScreenShare, RefreshCw, ExternalLink } from 'lucide-react';

export default function WebviewPanel({ webview, agentId }) {
  const [iframeKey, setIframeKey] = useState(0);
  const [spinning, setSpinning] = useState(false);

  const handleRefresh = () => {
    setSpinning(true);
    setIframeKey(k => k + 1);
    setTimeout(() => setSpinning(false), 600);
  };

  const handleSharedScreen = () => {
    const token = getToken();
    const url = `/shared/${agentId}?token=${encodeURIComponent(token)}`;
    window.open(url, `kratos-shared-${agentId}`, 'noopener');
  };

  if (!webview) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
        <Monitor className="h-5 w-5" />
        <span>No webview available</span>
      </div>
    );
  }

  const proxyUrl = `http://${window.location.hostname}:${webview.port}${webview.path}`;

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-card/50 shrink-0">
        <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-accent-foreground">
          <Monitor className="h-3.5 w-3.5" /> Local
        </div>
        <button
          onClick={handleSharedScreen}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50"
          title="Open Shared Screen in new tab"
        >
          <ScreenShare className="h-3.5 w-3.5" /> Shared Screen
          <ExternalLink className="h-3 w-3" />
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
        <iframe
          key={iframeKey}
          src={proxyUrl}
          className="w-full h-full border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          title="Agent Webview (Local)"
        />
      </div>
    </div>
  );
}
