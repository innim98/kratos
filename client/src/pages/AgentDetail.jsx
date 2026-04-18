import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { Button } from '../components/ui/button.jsx';
import { cn } from '../lib/utils.js';
import TerminalPanel from '../components/TerminalPanel.jsx';
import WebviewPanel from '../components/WebviewPanel.jsx';
import SplitView from '../components/SplitView.jsx';
import { Columns2, Rows2, Square, Monitor, Terminal } from 'lucide-react';

const SPLIT_MODES = [
  { key: 'horizontal', icon: Columns2, label: 'Side by side' },
  { key: 'vertical', icon: Rows2, label: 'Top and bottom' },
  { key: 'terminal-only', icon: Square, label: 'Terminal only' },
];

export default function AgentDetail({ agentId }) {
  const [agent, setAgent] = useState(null);
  const [splitMode, setSplitMode] = useState(() =>
    localStorage.getItem('kratos_split_mode') || 'horizontal'
  );
  const [mobileTab, setMobileTab] = useState('terminal');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    localStorage.setItem('kratos_split_mode', splitMode);
  }, [splitMode]);

  useEffect(() => {
    apiFetch('/api/agents').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setAgent(data.find(a => a.id === agentId) || null);
    });
  }, [agentId]);

  // Listen for webview updates via the terminal WS (already connected)
  // Agent data is refreshed on mount; webview-update will be handled when we integrate WS events

  const terminalEl = <TerminalPanel agentId={agentId} />;
  const webviewEl = <WebviewPanel webview={agent?.webview} agentId={agentId} />;

  // Mobile: tab view
  if (isMobile) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border shrink-0">
          <button
            onClick={() => setMobileTab('terminal')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded text-sm', mobileTab === 'terminal' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground')}
          >
            <Terminal className="h-4 w-4" /> Terminal
          </button>
          <button
            onClick={() => setMobileTab('webview')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded text-sm', mobileTab === 'webview' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground')}
          >
            <Monitor className="h-4 w-4" /> Webview
          </button>
        </div>
        <div className="flex-1 min-h-0">
          {mobileTab === 'terminal' ? terminalEl : webviewEl}
        </div>
      </div>
    );
  }

  // Desktop: split view
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">{agent?.name || `Agent #${agentId}`}</h2>
          {agent && (
            <span className={cn('inline-flex items-center gap-1 text-xs', agent.status === 'online' ? 'text-emerald-500' : 'text-muted-foreground')}>
              <span className={cn('h-1.5 w-1.5 rounded-full', agent.status === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground/50')} />
              {agent.status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {SPLIT_MODES.map(({ key, icon: Icon, label }) => (
            <Button
              key={key}
              variant={splitMode === key ? 'secondary' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              onClick={() => setSplitMode(key)}
              title={label}
            >
              <Icon className="h-3.5 w-3.5" />
            </Button>
          ))}
        </div>
      </div>

      <SplitView
        mode={splitMode}
        left={terminalEl}
        right={webviewEl}
      />
    </div>
  );
}
