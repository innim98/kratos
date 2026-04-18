import { Monitor } from 'lucide-react';

export default function WebviewPanel({ webview, agentId }) {
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
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border text-xs text-muted-foreground bg-card/50 shrink-0">
        <Monitor className="h-3.5 w-3.5" />
        <span className="font-mono">localhost:{webview.port}{webview.path}</span>
      </div>
      <iframe
        src={proxyUrl}
        className="flex-1 w-full border-0 bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title="Agent Webview"
      />
    </div>
  );
}
