import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import TerminalPanel from '../components/TerminalPanel.jsx';

export default function AgentDetail({ agentId }) {
  const [agent, setAgent] = useState(null);

  useEffect(() => {
    apiFetch('/api/agents').then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        setAgent(data.find(a => a.id === agentId) || null);
      }
    });
  }, [agentId]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-3 shrink-0">
        <h2 className="text-lg font-semibold">{agent?.name || `Agent #${agentId}`}</h2>
        {agent && (
          <span className={`inline-flex items-center gap-1.5 text-xs ${agent.status === 'online' ? 'text-emerald-500' : 'text-muted-foreground'}`}>
            <span className={`h-2 w-2 rounded-full ${agent.status === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`} />
            {agent.status}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 rounded-md overflow-hidden border border-border">
        <TerminalPanel agentId={agentId} />
      </div>
    </div>
  );
}
