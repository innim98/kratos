import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Button } from '../components/ui/button.jsx';
import { cn } from '../lib/utils.js';
import TerminalPanel from '../components/TerminalPanel.jsx';
import WebviewPanel from '../components/WebviewPanel.jsx';
import FilesPanel from '../components/FilesPanel.jsx';
import TextPanel from '../components/TextPanel.jsx';
import TodosPanel from '../components/TodosPanel.jsx';
import PanelContent from '../components/PanelContent.jsx';
import SplitView from '../components/SplitView.jsx';
import AgentFiles from './AgentFiles.jsx';
import AgentStatusDialog from '../components/AgentStatusDialog.jsx';
import { Columns2, Rows2, Square, BookOpen, FolderOpen, Pencil, Check, X } from 'lucide-react';

const SPLIT_MODES = [
  { key: 'horizontal', icon: Columns2, label: 'Side by side' },
  { key: 'vertical', icon: Rows2, label: 'Top and bottom' },
  { key: 'terminal-only', icon: Square, label: 'Single panel' },
];

const LEFT_TABS = ['terminal', 'files', 'text'];
const RIGHT_TABS = ['webview', 'files', 'text', 'todos'];

function buildApiGuide(agentId, serverPort, agentToken) {
  const authHeader = agentToken
    ? `-H "Authorization: Bearer ${agentToken}"`
    : '-H "Authorization: Bearer <AGENT_TOKEN>"';

  return `cat << 'KRATOS_API_GUIDE'

=== Kratos API Guide (Agent #${agentId}) ===
Server: http://localhost:${serverPort}
Token: ${agentToken || '<not generated>'}

# --- Webview (localhost-only, no auth needed) ---

# Register webview port
curl -X POST http://localhost:${serverPort}/api/agents/${agentId}/webview \\
  -H "Content-Type: application/json" \\
  -d '{"port": <YOUR_PORT>, "path": "/"}'

# Read page text / screenshot
curl -s http://localhost:${serverPort}/api/agents/${agentId}/webview/dom | jq '.text'
curl -s http://localhost:${serverPort}/api/agents/${agentId}/webview/screenshot | jq -r '.base64' | base64 -d > /tmp/screenshot.png

# --- Port Registration (register ALL ports you use) ---
# Webview, DB, cache, API servers — register them all for monitoring

curl -X POST http://localhost:${serverPort}/api/agents/${agentId}/ports \\
  ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"port": 5173, "label": "Vite dev server", "type": "webview"}'

curl -X POST http://localhost:${serverPort}/api/agents/${agentId}/ports \\
  ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"port": 5432, "label": "PostgreSQL", "type": "service"}'

# --- Todos (use agent token for auth) ---

# Create a todo
curl -X POST http://localhost:${serverPort}/api/todos \\
  ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"title": "Task description", "priority": 3}'

# List todos
curl -s http://localhost:${serverPort}/api/todos ${authHeader}

# Complete a todo (agents can only complete their own)
curl -X PUT http://localhost:${serverPort}/api/todos/<TODO_ID> \\
  ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"status": "completed"}'

KRATOS_API_GUIDE
`;
}

function renderPanelContent(tab, agentId, termRef, agent) {
  if (tab === 'terminal') return <TerminalPanel ref={termRef} agentId={agentId} />;
  if (tab === 'files') return <FilesPanel agentId={agentId} />;
  if (tab === 'text') return <TextPanel agentId={agentId} />;
  if (tab === 'webview') return <WebviewPanel webview={agent?.webview} agentId={agentId} />;
  if (tab === 'todos') return <TodosPanel agentId={agentId} />;
  return null;
}

export default function AgentDetail({ agentId }) {
  const [agent, setAgent] = useState(null);
  const [splitMode, setSplitMode] = useState(() =>
    localStorage.getItem('kratos_split_mode') || 'horizontal'
  );
  const [leftTab, setLeftTab] = useState('terminal');
  const [rightTab, setRightTab] = useState('todos');
  const [mobileTab, setMobileTab] = useState('terminal');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [serverPort, setServerPort] = useState(null);
  const [showFullFiles, setShowFullFiles] = useState(false);
  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const termRef = useRef(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => { localStorage.setItem('kratos_split_mode', splitMode); }, [splitMode]);

  const loadAgent = useCallback(() => {
    apiFetch('/api/agents').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setAgent(data.find(a => a.id === agentId) || null);
    });
  }, [agentId]);

  useEffect(loadAgent, [loadAgent]);
  useEffect(() => {
    const interval = setInterval(loadAgent, 3000);
    return () => clearInterval(interval);
  }, [loadAgent]);

  useEffect(() => {
    apiFetch('/api/config').then(r => r.json()).then(d => {
      if (d.serverPort) setServerPort(d.serverPort);
    });
  }, []);

  const handleSendGuide = () => {
    termRef.current?.sendInput(buildApiGuide(agentId, serverPort || '15001', agent?.token));
  };

  const handleStartRename = () => {
    setEditName(agent?.name || '');
    setEditing(true);
  };

  const handleRename = async () => {
    if (!editName.trim()) return;
    const res = await apiFetch(`/api/agents/${agentId}`, {
      method: 'PUT',
      body: { name: editName.trim() },
    });
    if (res.ok) {
      loadAgent();
      setEditing(false);
    }
  };

  const handleRenameKeyDown = (e) => {
    if (e.key === 'Enter') handleRename();
    if (e.key === 'Escape') setEditing(false);
  };

  // Full-screen Files mode
  if (showFullFiles) {
    return <AgentFiles agentId={agentId} onBack={() => setShowFullFiles(false)} />;
  }

  // Mobile
  if (isMobile) {
    const MOBILE_TABS = ['terminal', 'webview', 'files', 'text'];
    return (
      <div className="flex flex-col h-full">
        <PanelContent tabs={MOBILE_TABS} activeTab={mobileTab} onTabChange={setMobileTab}>
          {renderPanelContent(mobileTab, agentId, termRef, agent)}
        </PanelContent>
      </div>
    );
  }

  // Desktop
  const leftPanel = (
    <PanelContent tabs={LEFT_TABS} activeTab={leftTab} onTabChange={setLeftTab}>
      {renderPanelContent(leftTab, agentId, termRef, agent)}
    </PanelContent>
  );

  const rightPanel = (
    <PanelContent tabs={RIGHT_TABS} activeTab={rightTab} onTabChange={setRightTab}>
      {renderPanelContent(rightTab, agentId, termRef, agent)}
    </PanelContent>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          {editing ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={handleRenameKeyDown}
                className="h-6 px-1.5 text-sm font-semibold bg-background border border-input rounded w-40 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button onClick={handleRename} className="text-emerald-500 hover:text-emerald-400"><Check className="h-3.5 w-3.5" /></button>
              <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <button onClick={handleStartRename} className="flex items-center gap-1.5 group" title="Click to rename">
              <h2 className="text-sm font-semibold">{agent?.name || `Agent #${agentId}`}</h2>
              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
          {agent && !editing && (
            <button
              onClick={() => setStatusOpen(true)}
              className={cn('inline-flex items-center gap-1 text-xs cursor-pointer hover:underline', agent.status === 'online' ? 'text-emerald-500' : 'text-muted-foreground')}
              title="View agent details"
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', agent.status === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground/50')} />
              {agent.status}
            </button>
          )}
        </div>
        <AgentStatusDialog agent={agent} open={statusOpen} onOpenChange={setStatusOpen} />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowFullFiles(true)} title="Full-screen file browser">
            <FolderOpen className="h-3.5 w-3.5 mr-1" /> Files
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

      <SplitView mode={splitMode} left={leftPanel} right={rightPanel} />
    </div>
  );
}
