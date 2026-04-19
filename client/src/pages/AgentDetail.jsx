import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Button } from '../components/ui/button.jsx';
import { cn } from '../lib/utils.js';
import TerminalPanel from '../components/TerminalPanel.jsx';
import WebviewPanel from '../components/WebviewPanel.jsx';
import FilesPanel from '../components/FilesPanel.jsx';
import TextPanel from '../components/TextPanel.jsx';
import PanelContent from '../components/PanelContent.jsx';
import SplitView from '../components/SplitView.jsx';
import AgentFiles from './AgentFiles.jsx';
import { Columns2, Rows2, Square, BookOpen, FolderOpen } from 'lucide-react';

const SPLIT_MODES = [
  { key: 'horizontal', icon: Columns2, label: 'Side by side' },
  { key: 'vertical', icon: Rows2, label: 'Top and bottom' },
  { key: 'terminal-only', icon: Square, label: 'Single panel' },
];

const LEFT_TABS = ['terminal', 'files', 'text'];
const RIGHT_TABS = ['webview', 'files', 'text'];

function buildApiGuide(agentId, serverPort) {
  return `cat << 'KRATOS_API_GUIDE'

=== Kratos Webview API (Agent #${agentId}) ===
Server: http://localhost:${serverPort}

# Register webview
curl -X POST http://localhost:${serverPort}/api/agents/${agentId}/webview \\
  -H "Content-Type: application/json" \\
  -d '{"port": <YOUR_PORT>, "path": "/"}'

# Read page text
curl -s http://localhost:${serverPort}/api/agents/${agentId}/webview/dom | jq '.text'

# Screenshot
curl -s http://localhost:${serverPort}/api/agents/${agentId}/webview/screenshot \\
  | jq -r '.base64' | base64 -d > /tmp/screenshot.png

KRATOS_API_GUIDE
`;
}

function renderPanelContent(tab, agentId, termRef, agent) {
  if (tab === 'terminal') return <TerminalPanel ref={termRef} agentId={agentId} />;
  if (tab === 'files') return <FilesPanel agentId={agentId} />;
  if (tab === 'text') return <TextPanel agentId={agentId} />;
  if (tab === 'webview') return <WebviewPanel webview={agent?.webview} agentId={agentId} />;
  return null;
}

export default function AgentDetail({ agentId }) {
  const [agent, setAgent] = useState(null);
  const [splitMode, setSplitMode] = useState(() =>
    localStorage.getItem('kratos_split_mode') || 'horizontal'
  );
  const [leftTab, setLeftTab] = useState('terminal');
  const [rightTab, setRightTab] = useState('webview');
  const [mobileTab, setMobileTab] = useState('terminal');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [serverPort, setServerPort] = useState(null);
  const [showFullFiles, setShowFullFiles] = useState(false);
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
    termRef.current?.sendInput(buildApiGuide(agentId, serverPort || '15001'));
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
          <h2 className="text-sm font-semibold">{agent?.name || `Agent #${agentId}`}</h2>
          {agent && (
            <span className={cn('inline-flex items-center gap-1 text-xs', agent.status === 'online' ? 'text-emerald-500' : 'text-muted-foreground')}>
              <span className={cn('h-1.5 w-1.5 rounded-full', agent.status === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground/50')} />
              {agent.status}
            </span>
          )}
        </div>
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
