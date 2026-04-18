import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog.jsx';
import { Button } from './ui/button.jsx';
import { Input } from './ui/input.jsx';
import { Badge } from './ui/badge.jsx';
import { Terminal } from 'lucide-react';

export default function TmuxPickerDialog({ open, onOpenChange, onCreated }) {
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      apiFetch('/api/tmux/sessions').then(r => r.json())
        .then(data => { if (Array.isArray(data)) setSessions(data); })
        .catch(() => {});
      setSelected(null);
      setName('');
      setError('');
    }
  }, [open]);

  const handleSelect = (session) => {
    setSelected(session);
    setName(session.name);
  };

  const handleCreate = async () => {
    if (!name || !selected) return;
    setLoading(true);
    setError('');
    const res = await apiFetch('/api/agents', {
      method: 'POST',
      body: { name, tmux_session: selected.name },
    });
    setLoading(false);
    if (res.ok) {
      onOpenChange(false);
      onCreated();
    } else {
      const data = await res.json();
      setError(data.error || 'Failed');
    }
  };

  const timeAgo = (ts) => {
    if (!ts) return '';
    const diff = Math.floor(Date.now() / 1000 - ts);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  const available = sessions.filter(s => !s.registered);
  const registered = sessions.filter(s => s.registered);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Agent from tmux</DialogTitle>
          <DialogDescription>Select an existing tmux session to register</DialogDescription>
        </DialogHeader>

        <div className="border border-border rounded-md max-h-64 overflow-y-auto">
          {sessions.length === 0 && (
            <p className="text-sm text-muted-foreground p-4 text-center">No tmux sessions running</p>
          )}

          {available.map(s => (
            <button
              key={s.name}
              onClick={() => handleSelect(s)}
              className={`flex items-center justify-between w-full px-3 py-2.5 text-sm text-left border-b border-border last:border-0 hover:bg-accent/50 ${selected?.name === s.name ? 'bg-accent text-accent-foreground' : ''}`}
            >
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                <span className="font-mono">{s.name}</span>
              </div>
              <span className="text-xs text-muted-foreground">{timeAgo(s.activity)}</span>
            </button>
          ))}

          {registered.map(s => (
            <div
              key={s.name}
              className="flex items-center justify-between px-3 py-2.5 text-sm border-b border-border last:border-0 opacity-50"
            >
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                <span className="font-mono">{s.name}</span>
              </div>
              <Badge variant="secondary">registered</Badge>
            </div>
          ))}
        </div>

        {selected && (
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Agent name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="agent-name" />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!name || !selected || loading}>
            {loading ? 'Creating...' : 'Register Agent'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
