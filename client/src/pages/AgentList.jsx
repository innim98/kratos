import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { Button } from '../components/ui/button.jsx';
import { Badge } from '../components/ui/badge.jsx';
import FolderPickerDialog from '../components/FolderPickerDialog.jsx';
import TmuxPickerDialog from '../components/TmuxPickerDialog.jsx';
import { FolderPlus, Terminal, Trash2 } from 'lucide-react';

export default function AgentList({ onSelectAgent }) {
  const [agents, setAgents] = useState([]);
  const [folderOpen, setFolderOpen] = useState(false);
  const [tmuxOpen, setTmuxOpen] = useState(false);

  const loadAgents = () => {
    apiFetch('/api/agents').then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAgents(data); })
      .catch(() => {});
  };

  useEffect(loadAgents, []);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    await apiFetch(`/api/agents/${id}`, { method: 'DELETE' });
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Agents</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setFolderOpen(true)}>
            <FolderPlus className="h-4 w-4 mr-1.5" /> from folder
          </Button>
          <Button size="sm" variant="outline" onClick={() => setTmuxOpen(true)}>
            <Terminal className="h-4 w-4 mr-1.5" /> from tmux
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {agents.map(a => (
          <div
            key={a.id}
            onClick={() => onSelectAgent(a.id)}
            className="flex items-center justify-between rounded-lg border border-border bg-card p-4 cursor-pointer hover:border-primary/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className={`h-2.5 w-2.5 rounded-full ${a.status === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
              <div>
                <span className="font-medium">{a.name}</span>
                <span className="text-xs text-muted-foreground ml-2 font-mono">{a.tmux_session}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={a.status === 'online' ? 'success' : 'secondary'}>{a.status}</Badge>
              <span className="text-xs text-muted-foreground w-16 text-right">{timeAgo(a.lastActivity)}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={(e) => handleDelete(e, a.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        {agents.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="mb-2">No agents registered</p>
            <p className="text-sm">Add an agent from a folder or existing tmux session</p>
          </div>
        )}
      </div>

      <FolderPickerDialog open={folderOpen} onOpenChange={setFolderOpen} onCreated={loadAgents} />
      <TmuxPickerDialog open={tmuxOpen} onOpenChange={setTmuxOpen} onCreated={loadAgents} />
    </div>
  );
}
