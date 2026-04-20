import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { Badge } from '../components/ui/badge.jsx';
import { Button } from '../components/ui/button.jsx';
import { cn } from '../lib/utils.js';
import { RefreshCw, Network, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

export default function PortsDashboard() {
  const [ports, setPorts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showSystem, setShowSystem] = useState(false);

  const loadPorts = async () => {
    setLoading(true);
    const res = await apiFetch('/api/ports/scan');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) setPorts(data);
    }
    setLoading(false);
  };

  useEffect(() => { loadPorts(); }, []);

  // Group ports
  const agentPorts = ports.filter(p => p.agentId && !p.system);
  const unassigned = ports.filter(p => !p.agentId && !p.system);
  const systemPorts = ports.filter(p => p.system);

  // Group agent ports by agent
  const byAgent = {};
  for (const p of agentPorts) {
    if (!byAgent[p.agentName]) byAgent[p.agentName] = [];
    byAgent[p.agentName].push(p);
  }

  const hostname = window.location.hostname;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Network className="h-5 w-5" /> Ports
        </h2>
        <Button size="sm" variant="outline" onClick={loadPorts} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} /> Scan
        </Button>
      </div>

      {/* Agent Ports */}
      {Object.keys(byAgent).length > 0 && (
        <section className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Agent Ports</h3>
          {Object.entries(byAgent).map(([agentName, agentPorts]) => (
            <div key={agentName} className="mb-3">
              <h4 className="text-sm font-medium mb-1">{agentName}</h4>
              <div className="space-y-1">
                {agentPorts.map(p => (
                  <PortRow key={p.port} port={p} hostname={hostname} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Unassigned User Ports */}
      {unassigned.length > 0 && (
        <section className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Unassigned Ports</h3>
          <div className="space-y-1">
            {unassigned.map(p => (
              <PortRow key={p.port} port={p} hostname={hostname} />
            ))}
          </div>
        </section>
      )}

      {/* System Ports */}
      {systemPorts.length > 0 && (
        <section>
          <button
            onClick={() => setShowSystem(!showSystem)}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground mb-2 hover:text-foreground"
          >
            {showSystem ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            System ({systemPorts.length})
          </button>
          {showSystem && (
            <div className="space-y-1">
              {systemPorts.map(p => (
                <PortRow key={p.port} port={p} hostname={hostname} />
              ))}
            </div>
          )}
        </section>
      )}

      {ports.length === 0 && !loading && (
        <p className="text-center text-muted-foreground py-8">No ports detected. Click Scan.</p>
      )}
    </div>
  );
}

function PortRow({ port: p, hostname }) {
  const url = `http://${hostname}:${p.port}`;
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-card text-sm">
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs w-14">:{p.port}</span>
        <span className="text-muted-foreground truncate max-w-32">{p.command}</span>
        {p.agentLabel && <Badge variant="secondary" className="text-[10px]">{p.agentLabel}</Badge>}
        {p.agentType && <Badge variant="outline" className="text-[10px]">{p.agentType}</Badge>}
      </div>
      <div className="flex items-center gap-2">
        {p.cwd && <span className="text-[10px] text-muted-foreground truncate max-w-48">{p.cwd}</span>}
        {!p.system && (
          <a href={url} target="_blank" rel="noopener" className="text-muted-foreground hover:text-foreground">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}
