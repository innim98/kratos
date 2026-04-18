import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../lib/api.js';
import { Button } from '../components/ui/button.jsx';
import { cn } from '../lib/utils.js';
import TerminalPanel from '../components/TerminalPanel.jsx';
import WebviewPanel from '../components/WebviewPanel.jsx';
import SplitView from '../components/SplitView.jsx';
import { Columns2, Rows2, Square, Monitor, Terminal, BookOpen, Upload } from 'lucide-react';
import { getToken } from '../lib/api.js';

const SPLIT_MODES = [
  { key: 'horizontal', icon: Columns2, label: 'Side by side' },
  { key: 'vertical', icon: Rows2, label: 'Top and bottom' },
  { key: 'terminal-only', icon: Square, label: 'Terminal only' },
];

function buildApiGuide(agentId, serverPort) {
  return `cat << 'KRATOS_API_GUIDE'

=== Kratos Webview API (Agent #${agentId}) ===
Server: http://localhost:${serverPort}

# Register webview (call after starting your dev server)
curl -X POST http://localhost:${serverPort}/api/agents/${agentId}/webview \\
  -H "Content-Type: application/json" \\
  -d '{"port": <YOUR_PORT>, "path": "/"}'

# Unregister webview
curl -X DELETE http://localhost:${serverPort}/api/agents/${agentId}/webview

# Read page text content
curl -s http://localhost:${serverPort}/api/agents/${agentId}/webview/dom | jq '.text'

# Read full DOM (title, url, text, html)
curl -s http://localhost:${serverPort}/api/agents/${agentId}/webview/dom

# Take screenshot (base64 PNG)
curl -s http://localhost:${serverPort}/api/agents/${agentId}/webview/screenshot \\
  | jq -r '.base64' | base64 -d > /tmp/screenshot.png

KRATOS_API_GUIDE
`;
}

export default function AgentDetail({ agentId }) {
  const [agent, setAgent] = useState(null);
  const [splitMode, setSplitMode] = useState(() =>
    localStorage.getItem('kratos_split_mode') || 'horizontal'
  );
  const [mobileTab, setMobileTab] = useState('terminal');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const termRef = useRef(null);

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

  const [serverPort, setServerPort] = useState(null);

  useEffect(() => {
    apiFetch('/api/config').then(r => r.json()).then(data => {
      if (data.serverPort) setServerPort(data.serverPort);
    });
  }, []);

  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleSendGuide = () => {
    const port = serverPort || '15001';
    const guide = buildApiGuide(agentId, port);
    termRef.current?.sendInput(guide);
  };

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    try {
      const token = getToken();
      const res = await fetch(`/api/agents/${agentId}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        termRef.current?.sendInput(`echo "[Kratos] ${data.files.length} file(s) uploaded to ${data.uploadDir}"\n`);
      }
    } catch {}
    setUploading(false);
    e.target.value = '';
  };

  const terminalEl = <TerminalPanel ref={termRef} agentId={agentId} />;
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
          <span className="flex-1" />
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Upload files to agent">
            <Upload className="h-3.5 w-3.5 mr-1" /> {uploading ? 'Uploading...' : 'Upload'}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleSendGuide} title="Send API guide to terminal">
            <BookOpen className="h-3.5 w-3.5 mr-1" /> API Guide
          </Button>
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
        <div className="flex items-center gap-1">
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Upload files to agent">
            <Upload className="h-3.5 w-3.5 mr-1" /> {uploading ? '...' : 'Upload'}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleSendGuide} title="Send API guide to terminal">
            <BookOpen className="h-3.5 w-3.5 mr-1" /> API Guide
          </Button>
          <div className="w-px h-4 bg-border mx-1" />
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
