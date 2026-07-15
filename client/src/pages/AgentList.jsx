import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { Button } from '../components/ui/button.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { cn } from '../lib/utils.js';
import FolderPickerDialog from '../components/FolderPickerDialog.jsx';
import TmuxPickerDialog from '../components/TmuxPickerDialog.jsx';
import { FolderPlus, Terminal, Trash2, List, LayoutGrid, ClipboardList } from 'lucide-react';
import { getLogText, clearLogs, getLogCount } from '../lib/logbuffer.js';

const VIEW_MODES = [
  { key: 'list', icon: List, label: 'List' },
  { key: 'grid', icon: LayoutGrid, label: 'Grid (by folder)' },
];

export default function AgentList({ onSelectAgent }) {
  const [agents, setAgents] = useState([]);
  const [folderOpen, setFolderOpen] = useState(false);
  const [tmuxOpen, setTmuxOpen] = useState(false);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('kratos_agents_view') || 'list');
  const [logMsg, setLogMsg] = useState('');

  // Export captured console/error logs for on-device debugging: copy to clipboard
  // (works on secure/localhost contexts) and always download a .txt as a fallback.
  const handleExportLogs = async () => {
    const text = getLogText();
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); copied = true; }
    } catch {}
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `kratos-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {}
    setLogMsg(`${getLogCount()} lines — ${copied ? 'copied + downloaded' : 'downloaded'}`);
    setTimeout(() => setLogMsg(''), 4000);
  };

  const loadAgents = () => {
    apiFetch('/api/agents').then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAgents(data); })
      .catch(() => {});
  };

  useEffect(loadAgents, []);
  useEffect(() => { localStorage.setItem('kratos_agents_view', viewMode); }, [viewMode]);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    await apiFetch(`/api/agents/${id}`, { method: 'DELETE' });
    loadAgents();
  };

  const toggleManager = async (e, a) => {
    e.stopPropagation();
    await apiFetch(`/api/agents/${a.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_manager: !a.is_manager }),
    });
    loadAgents();
  };

  const timeAgo = (ts) => {
    if (!ts) return '';
    const diff = Math.floor(Date.now() / 1000 - ts);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  // Group agents by registered folder
  const groupedByFolder = () => {
    const groups = {};
    for (const a of agents) {
      const folder = a.folder || 'other';
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(a);
    }
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Agents</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            {VIEW_MODES.map(({ key, icon: Icon, label }) => (
              <Button key={key} variant={viewMode === key ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setViewMode(key)} title={label}>
                <Icon className="h-3.5 w-3.5" />
              </Button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={handleExportLogs} title="Copy/download captured console logs">
            <ClipboardList className="h-4 w-4 mr-1.5" /> Logs
          </Button>
          <Button size="sm" variant="outline" onClick={() => setFolderOpen(true)}>
            <FolderPlus className="h-4 w-4 mr-1.5" /> from folder
          </Button>
          <Button size="sm" variant="outline" onClick={() => setTmuxOpen(true)}>
            <Terminal className="h-4 w-4 mr-1.5" /> from tmux
          </Button>
        </div>
      </div>
      {logMsg && <p className="mb-3 text-xs text-emerald-500">{logMsg}</p>}

      {viewMode === 'list' && (
        <div className="space-y-2">
          {agents.map(a => (
            <div
              key={a.id}
              onClick={() => onSelectAgent(a.id)}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4 cursor-pointer hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${a.status === 'working' ? 'bg-emerald-500 animate-pulse' : a.status === 'ask' ? 'bg-purple-500 animate-pulse' : a.status === 'idle' ? 'bg-yellow-500' : a.status === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                <div>
                  <span className="font-medium">{a.name}</span>
                  {a.nickname && <span className="text-xs text-muted-foreground/70 ml-2">{a.nickname}</span>}
                  <span className="text-xs text-muted-foreground ml-2 font-mono">{a.tmux_session}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={a.status === 'offline' ? 'secondary' : 'success'}>{a.status}</Badge>
                <Button
                  variant={a.is_manager ? 'secondary' : 'ghost'}
                  size="icon"
                  className={cn('h-6 w-6 text-xs font-semibold', a.is_manager ? 'text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground')}
                  onClick={(e) => toggleManager(e, a)}
                  title={a.is_manager ? 'Unset manager' : 'Set as manager'}
                >
                  M
                </Button>
                <span className="text-xs text-muted-foreground w-16 text-right">{timeAgo(a.lastActivity)}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={(e) => handleDelete(e, a.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewMode === 'grid' && (
        <div className="space-y-4">
          {groupedByFolder().map(([folder, folderAgents]) => (
            <div key={folder}>
              <div className="text-xs font-mono text-muted-foreground mb-1.5 px-1">{folder}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {folderAgents.map(a => (
                  <button
                    key={a.id}
                    onClick={() => onSelectAgent(a.id)}
                    className={cn(
                      'rounded-lg border px-3 py-2.5 text-left transition-colors hover:border-primary/50',
                      a.status === 'working' ? 'bg-emerald-950/20 border-emerald-500/30' : a.status === 'ask' ? 'bg-purple-950/20 border-purple-500/30' : a.status === 'idle' ? 'bg-yellow-950/20 border-yellow-500/30' : a.status === 'online' ? 'bg-emerald-950/10 border-emerald-500/20' : 'bg-card border-border'
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={cn('h-2 w-2 rounded-full shrink-0', a.status === 'working' ? 'bg-emerald-500 animate-pulse' : a.status === 'ask' ? 'bg-purple-500 animate-pulse' : a.status === 'idle' ? 'bg-yellow-500' : a.status === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
                      <span className="text-sm font-medium truncate">{a.name}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-muted-foreground">{timeAgo(a.lastActivity)}</span>
                      <Badge variant={a.status === 'offline' ? 'secondary' : 'success'} className="text-[9px] px-1 py-0">{a.status}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {agents.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="mb-2">No agents registered</p>
          <p className="text-sm">Add an agent from a folder or existing tmux session</p>
        </div>
      )}

      <FolderPickerDialog open={folderOpen} onOpenChange={setFolderOpen} onCreated={loadAgents} />
      <TmuxPickerDialog open={tmuxOpen} onOpenChange={setTmuxOpen} onCreated={loadAgents} />
    </div>
  );
}
