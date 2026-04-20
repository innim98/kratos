import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog.jsx';
import { Badge } from './ui/badge.jsx';
import { apiFetch } from '../lib/api.js';
import { cn } from '../lib/utils.js';
import { Copy, Check, Network } from 'lucide-react';

export default function AgentStatusDialog({ agent, open, onOpenChange }) {
  const [ports, setPorts] = useState([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open && agent) {
      apiFetch(`/api/agents/${agent.id}/ports`).then(r => r.json())
        .then(data => { if (Array.isArray(data)) setPorts(data); });
    }
  }, [open, agent]);

  const handleCopyToken = () => {
    if (agent?.token) {
      navigator.clipboard.writeText(agent.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!agent) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {agent.name}
            <Badge variant={agent.status === 'online' ? 'success' : 'secondary'}>{agent.status}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">tmux session</span>
              <span className="font-mono">{agent.tmux_session}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Agent token</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs truncate max-w-48">{agent.token || 'none'}</span>
                {agent.token && (
                  <button onClick={handleCopyToken} className="text-muted-foreground hover:text-foreground" title="Copy token">
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Ports */}
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <Network className="h-4 w-4" /> Registered Ports
            </h4>
            {ports.length === 0 ? (
              <p className="text-xs text-muted-foreground">No ports registered</p>
            ) : (
              <div className="space-y-1">
                {ports.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-1.5 rounded border border-border text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">:{p.port}</span>
                      <span className="text-muted-foreground">{p.label}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{p.type}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
