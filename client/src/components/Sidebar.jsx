import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { Button } from './ui/button.jsx';
import { cn } from '../lib/utils.js';
import { Bot, Settings, ChevronLeft } from 'lucide-react';

export default function Sidebar({ view, selectedAgentId, onSelectAgent, onGoAgents, onGoSettings }) {
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    if (view === 'agent-detail') {
      apiFetch('/api/agents').then(r => r.json())
        .then(data => { if (Array.isArray(data)) setAgents(data); })
        .catch(() => {});
    }
  }, [view, selectedAgentId]);

  // State C: agent switcher
  if (view === 'agent-detail') {
    return (
      <nav className="w-52 min-w-52 flex flex-col border-r border-border bg-card/50">
        <button
          onClick={onGoAgents}
          className="flex items-center gap-1 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground border-b border-border"
        >
          <ChevronLeft className="h-4 w-4" /> Agents
        </button>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {agents.map(a => (
            <button
              key={a.id}
              onClick={() => onSelectAgent(a.id)}
              className={cn(
                'flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm text-left',
                a.id === selectedAgentId
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50 text-muted-foreground'
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', a.status === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground/50')} />
              <span className="truncate">{a.name}</span>
            </button>
          ))}
        </div>

        <div className="border-t border-border p-1.5">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onGoSettings}>
            <Settings className="h-4 w-4 mr-2" /> Settings
          </Button>
        </div>
      </nav>
    );
  }

  // State A/B: menu
  return (
    <nav className="w-52 min-w-52 flex flex-col border-r border-border bg-card/50">
      <div className="flex-1 p-1.5 space-y-0.5">
        <Button
          variant={view === 'agents' ? 'secondary' : 'ghost'}
          size="sm"
          className="w-full justify-start"
          onClick={onGoAgents}
        >
          <Bot className="h-4 w-4 mr-2" /> Agents
        </Button>
      </div>
      <div className="border-t border-border p-1.5">
        <Button
          variant={view === 'settings' ? 'secondary' : 'ghost'}
          size="sm"
          className="w-full justify-start"
          onClick={onGoSettings}
        >
          <Settings className="h-4 w-4 mr-2" /> Settings
        </Button>
      </div>
    </nav>
  );
}
