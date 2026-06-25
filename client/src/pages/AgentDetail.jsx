import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch, getClientId } from '../lib/api.js';
import { Button } from '../components/ui/button.jsx';
import { cn } from '../lib/utils.js';
import { isEmbed } from '../lib/embed.js';
import TerminalPanel from '../components/TerminalPanel.jsx';
import FilesPanel from '../components/FilesPanel.jsx';
import TextPanel from '../components/TextPanel.jsx';
import TodosPanel from '../components/TodosPanel.jsx';
import IssuesPanel from '../components/IssuesPanel.jsx';
import PanelContent from '../components/PanelContent.jsx';
import SplitView from '../components/SplitView.jsx';
import FileViewer from '../components/FileViewer.jsx';
import UploadForAgent from '../components/UploadForAgent.jsx';
import AgentFiles from './AgentFiles.jsx';
import AgentStatusDialog from '../components/AgentStatusDialog.jsx';
import { Columns2, Rows2, Square, LayoutPanelLeft, Terminal, FileText, BookOpen, FolderOpen, Pencil, Check, X, ChevronLeft, RefreshCw } from 'lucide-react';

const SPLIT_MODES = [
  { key: 'horizontal', icon: Columns2, label: 'Side by side' },
  { key: 'vertical', icon: Rows2, label: 'Top and bottom' },
  { key: 'terminal-only', icon: Square, label: 'Single panel' },
  { key: 'ide', icon: LayoutPanelLeft, label: 'IDE mode' },
];

const LEFT_TABS = ['terminal', 'files', 'text'];
const RIGHT_TABS = ['files', 'text', 'todos', 'issues'];


function renderPanelContent(tab, agentId, termRef, agent, termKey) {
  if (tab === 'terminal') return <TerminalPanel key={termKey} ref={termRef} agentId={agentId} />;
  if (tab === 'files') return <FilesPanel agentId={agentId} />;
  if (tab === 'text') return <TextPanel agentId={agentId} />;
  if (tab === 'todos') return <TodosPanel agentId={agentId} />;
  if (tab === 'issues') return <IssuesPanel agentId={agentId} />;
  return null;
}

export default function AgentDetail({ agentId, onGoBack }) {
  const [agent, setAgent] = useState(null);
  const [splitMode, setSplitMode] = useState(() =>
    localStorage.getItem('kratos_split_mode') || 'horizontal'
  );
  const [leftTab, setLeftTab] = useState('terminal');
  const [rightTab, setRightTab] = useState('todos');
  const [mobileTab, setMobileTab] = useState('terminal');
  const [termKey, setTermKey] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [serverPort, setServerPort] = useState(null);
  const [showFullFiles, setShowFullFiles] = useState(false);
  const [ideFile, setIdeFile] = useState(null);
  const [ideBottomTab, setIdeBottomTab] = useState('terminal');
  const [ideFilesPaneWidth, setIdeFilesPaneWidth] = useState(() => {
    const saved = localStorage.getItem('kratos_ide_files_width');
    return saved ? parseFloat(saved) : 0.2;
  });
  const [ideVerticalRatio, setIdeVerticalRatio] = useState(() => {
    const saved = localStorage.getItem('kratos_ide_vertical_ratio');
    return saved ? parseFloat(saved) : 0.55;
  });
  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const termRef = useRef(null);
  const ideContainerRef = useRef(null);
  const ideRightRef = useRef(null);

  const startDrag = useCallback((ref, setter, axis, min, max) => {
    const getVal = (x, y) => {
      if (!ref.current) return null;
      const rect = ref.current.getBoundingClientRect();
      return axis === 'x'
        ? (x - rect.left) / rect.width
        : (y - rect.top) / rect.height;
    };
    const clamp = (v) => Math.max(min, Math.min(max, v));

    return {
      onMouseDown: (e) => {
        e.preventDefault();
        const onMove = (e) => {
          const v = getVal(e.clientX, e.clientY);
          if (v !== null) setter(clamp(v));
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      },
      onTouchStart: (e) => {
        e.preventDefault();
        const onMove = (e) => {
          const t = e.touches[0];
          const v = getVal(t.clientX, t.clientY);
          if (v !== null) setter(clamp(v));
        };
        const onEnd = () => {
          document.removeEventListener('touchmove', onMove);
          document.removeEventListener('touchend', onEnd);
        };
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);
      },
    };
  }, []);

  const ideHDrag = startDrag(ideContainerRef, setIdeFilesPaneWidth, 'x', 0.1, 0.4);
  const ideVDrag = startDrag(ideRightRef, setIdeVerticalRatio, 'y', 0.15, 0.85);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => { localStorage.setItem('kratos_split_mode', splitMode); }, [splitMode]);
  useEffect(() => { localStorage.setItem('kratos_ide_files_width', String(ideFilesPaneWidth)); }, [ideFilesPaneWidth]);
  useEffect(() => { localStorage.setItem('kratos_ide_vertical_ratio', String(ideVerticalRatio)); }, [ideVerticalRatio]);

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
    const port = serverPort || '15001';
    const guideUrl = `http://localhost:${port}/api/agents/${agentId}/guide`;
    const msg = `# Kratos API Guide: ${guideUrl}\n# Token: ${agent?.token || 'none'}\ncurl -s ${guideUrl}\n`;
    termRef.current?.sendInput(msg);
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

  // Embed: single panel with tabs + back button
  if (isEmbed) {
    const EMBED_TABS = ['terminal', 'files', 'text'];
    const backBtn = onGoBack ? (
      <button onClick={onGoBack} className="flex items-center text-xs text-muted-foreground hover:text-foreground shrink-0">
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
    ) : null;
    return (
      <div className="flex flex-col h-full">
        <PanelContent tabs={EMBED_TABS} activeTab={mobileTab} onTabChange={setMobileTab} leftAction={backBtn} actions={<><button onClick={() => setTermKey(k => k + 1)} className="flex items-center px-1.5 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50" title="Reconnect terminal"><RefreshCw className="h-3.5 w-3.5" /></button><UploadForAgent agentId={agentId} onSendToTerminal={(path) => termRef.current?.sendInput(path)} /></>}>
          {renderPanelContent(mobileTab, agentId, termRef, agent, termKey)}
        </PanelContent>
      </div>
    );
  }

  // Mobile
  if (isMobile) {
    const MOBILE_TABS = ['terminal', 'files', 'text', 'todos', 'issues'];
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
          <span className="text-sm font-semibold">{agent?.name || `Agent #${agentId}`}</span>
          {agent && (
            <button
              onClick={() => setStatusOpen(true)}
              className={cn('inline-flex items-center gap-1 text-xs', agent.status === 'online' ? 'text-emerald-500' : 'text-muted-foreground')}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', agent.status === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground/50')} />
              {agent.status}
            </button>
          )}
          <button onClick={handleSendGuide} className="text-xs text-muted-foreground hover:text-foreground" title="Send API guide to terminal">
            <BookOpen className="h-3.5 w-3.5" />
          </button>
          {agent?.ports?.length > 0 && (
            <div className="flex items-center gap-1">
              {agent.ports.map(p => (
                <a key={p.id} href={`http://${window.location.hostname}:${p.port}`} target="_blank" rel="noopener"
                  className="text-[10px] font-mono px-1 py-0.5 rounded bg-secondary text-secondary-foreground">
                  :{p.port}
                </a>
              ))}
            </div>
          )}
        </div>
        <AgentStatusDialog agent={agent} open={statusOpen} onOpenChange={setStatusOpen} />
        <PanelContent tabs={MOBILE_TABS} activeTab={mobileTab} onTabChange={setMobileTab} actions={<><button onClick={() => setTermKey(k => k + 1)} className="flex items-center px-1.5 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50" title="Reconnect terminal"><RefreshCw className="h-3.5 w-3.5" /></button><UploadForAgent agentId={agentId} onSendToTerminal={(path) => termRef.current?.sendInput(path)} /></>}>
          {renderPanelContent(mobileTab, agentId, termRef, agent, termKey)}
        </PanelContent>
      </div>
    );
  }

  // Desktop - shared header
  const headerBar = isEmbed ? null : (
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
        {agent?.ports?.length > 0 && (
          <div className="flex items-center gap-1 ml-2">
            {agent.ports.map(p => (
              <a
                key={p.id}
                href={`http://${window.location.hostname}:${p.port}`}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-secondary text-secondary-foreground hover:bg-accent"
                title={p.label || `Port ${p.port}`}
              >
                :{p.port}
                {p.label && <span className="text-muted-foreground">{p.label}</span>}
              </a>
            ))}
          </div>
        )}
      </div>
      <AgentStatusDialog agent={agent} open={statusOpen} onOpenChange={setStatusOpen} />
      <div className="flex items-center gap-1">
        {splitMode !== 'ide' && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowFullFiles(true)} title="Full-screen file browser">
            <FolderOpen className="h-3.5 w-3.5 mr-1" /> Files
          </Button>
        )}
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
  );

  // IDE 3-pane layout
  if (splitMode === 'ide') {
    return (
      <div className="flex flex-col h-full">
        {headerBar}
        <div ref={ideContainerRef} className="flex flex-1 min-h-0">
          {/* Left: File tree */}
          <div className="overflow-hidden" style={{ width: `${ideFilesPaneWidth * 100}%`, minWidth: 0 }}>
            <FilesPanel agentId={agentId} onFileSelect={setIdeFile} />
          </div>
          {/* Horizontal drag handle */}
          <div {...ideHDrag} className="shrink-0 w-1 bg-border hover:bg-ring transition-colors cursor-col-resize touch-none" />
          {/* Right: vertical split */}
          <div ref={ideRightRef} className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Top-right: File viewer */}
            <div className="overflow-hidden" style={{ height: `${ideVerticalRatio * 100}%`, minHeight: 0 }}>
              <FileViewer agentId={agentId} file={ideFile} onClose={() => setIdeFile(null)} />
            </div>
            {/* Vertical drag handle */}
            <div {...ideVDrag} className="shrink-0 h-1 bg-border hover:bg-ring transition-colors cursor-row-resize touch-none" />
            {/* Bottom-right: Terminal / Text */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-border bg-card/50 shrink-0">
                {[{ key: 'terminal', icon: Terminal, label: 'Terminal' }, { key: 'text', icon: FileText, label: 'Text' }].map(({ key, icon: Icon, label }) => (
                  <button
                    key={key}
                    onClick={() => setIdeBottomTab(key)}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                      ideBottomTab === key ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
                <span className="flex-1" />
                <UploadForAgent agentId={agentId} onSendToTerminal={(path) => termRef.current?.sendInput(path)} />
              </div>
              <div className="flex-1 min-h-0">
                {ideBottomTab === 'terminal'
                  ? <TerminalPanel key={termKey} ref={termRef} agentId={agentId} />
                  : <TextPanel agentId={agentId} />
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Standard 2-pane layout
  const uploadActions = <UploadForAgent agentId={agentId} onSendToTerminal={(path) => termRef.current?.sendInput(path)} />;

  const leftPanel = (
    <PanelContent tabs={LEFT_TABS} activeTab={leftTab} onTabChange={setLeftTab} actions={uploadActions}>
      {renderPanelContent(leftTab, agentId, termRef, agent, termKey)}
    </PanelContent>
  );

  const rightPanel = (
    <PanelContent tabs={RIGHT_TABS} activeTab={rightTab} onTabChange={setRightTab}>
      {renderPanelContent(rightTab, agentId, termRef, agent, termKey)}
    </PanelContent>
  );

  return (
    <div className="flex flex-col h-full">
      {headerBar}
      <SplitView mode={splitMode} left={leftPanel} right={rightPanel} />
    </div>
  );
}
