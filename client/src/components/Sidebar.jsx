import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Button } from './ui/button.jsx';
import { cn } from '../lib/utils.js';
import { Bot, Settings, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ListTodo, Network, AlertCircle, MessageSquare, Layers, PanelLeftClose, PanelLeftOpen, Lock } from 'lucide-react';
import { getClientId } from '../lib/api.js';

export default function Sidebar({ view, selectedAgentId, doneAgents, silentDoneAgents, onSelectAgent, onGoAgents, onGoSettings, onGoTodos, onGoPorts, onGoIssues, onGoChat, onGoPhases, collapsed, onToggleCollapse }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [agents, setAgents] = useState([]);

  const loadAgents = () => {
    apiFetch('/api/agents').then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAgents(data); })
      .catch(() => {});
  };

  useEffect(() => {
    if (view === 'agent-detail') loadAgents();
  }, [view, selectedAgentId]);

  const handleReorder = async (agentId, direction) => {
    await apiFetch(`/api/agents/${agentId}/order`, { method: 'PUT', body: { direction } });
    loadAgents();
  };

  // State C: agent switcher
  if (view === 'agent-detail') {
    // Collapsed: thin bar with expand button
    if (collapsed) {
      return (
        <nav className="w-10 min-w-10 flex flex-col border-r border-border bg-card/50 items-center py-2 gap-1">
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
          <div className="w-px h-3 bg-border" />
          {agents.map(a => {
            const isDone = doneAgents?.has(a.id);
            const isSilentDone = silentDoneAgents?.has(a.id);
            return (
              <button
                key={a.id}
                onClick={() => onSelectAgent(a.id)}
                className={cn(
                  'h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-bold',
                  isSilentDone && 'ring-1 ring-orange-500/50',
                  isDone && !isSilentDone && 'ring-1 ring-emerald-500/50',
                  a.id === selectedAgentId
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50 text-muted-foreground'
                )}
                title={a.name}
              >
                <span className={cn('h-2 w-2 rounded-full', isSilentDone ? 'bg-orange-400 animate-pulse' : isDone ? 'bg-emerald-400 animate-pulse' : a.status === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground/50')} />
              </button>
            );
          })}
        </nav>
      );
    }

    // Expanded
    return (
      <nav className="w-52 min-w-52 flex flex-col border-r border-border bg-card/50">
        <div className="flex items-center justify-between border-b border-border">
          <button
            onClick={onGoAgents}
            className="flex items-center gap-1 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> Agents
          </button>
          <button
            onClick={onToggleCollapse}
            className="p-1.5 mr-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {agents.map((a, idx) => {
            const isDone = doneAgents?.has(a.id);
            const isSilentDone = silentDoneAgents?.has(a.id);
            const isLockedByOther = a.lock && a.lock.clientId !== getClientId();
            return (
              <div key={a.id} className="flex items-center group">
                <button
                  onClick={() => onSelectAgent(a.id)}
                  className={cn(
                    'flex items-center gap-2 flex-1 min-w-0 rounded-md px-3 py-2 text-sm text-left',
                    isSilentDone && 'bg-orange-500/10 border border-orange-500/30',
                    isDone && !isSilentDone && 'bg-emerald-500/10 border border-emerald-500/30',
                    a.id === selectedAgentId
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50 text-muted-foreground'
                  )}
                >
                  <span className={cn('h-2 w-2 rounded-full shrink-0', isSilentDone ? 'bg-orange-400 animate-pulse' : isDone ? 'bg-emerald-400 animate-pulse' : a.status === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground/50')} />
                  <span className={cn('truncate', isSilentDone && 'font-bold text-orange-400', isDone && !isSilentDone && 'font-bold text-emerald-400')}>{a.name}</span>
                  {isLockedByOther && (
                    <span className="ml-auto shrink-0 flex items-center gap-1 text-[10px] text-yellow-500" title={`Locked by ${a.lock.username}`}>
                      <Lock className="h-3 w-3" />
                    </span>
                  )}
                  {!isLockedByOther && isSilentDone && <span className="text-[10px] text-orange-400 ml-auto">done</span>}
                  {!isLockedByOther && isDone && !isSilentDone && <span className="text-[10px] text-emerald-400 ml-auto">done</span>}
                </button>
                {isAdmin && (
                  <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => handleReorder(a.id, 'up')}
                      disabled={idx === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-20 p-0.5"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleReorder(a.id, 'down')}
                      disabled={idx === agents.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-20 p-0.5"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t border-border p-1.5 space-y-0.5">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onGoTodos}>
            <ListTodo className="h-4 w-4 mr-2" /> Todos
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onGoIssues}>
            <AlertCircle className="h-4 w-4 mr-2" /> Issues
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onGoChat}>
            <MessageSquare className="h-4 w-4 mr-2" /> Chat
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onGoPhases}>
            <Layers className="h-4 w-4 mr-2" /> Phases
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onGoPorts}>
            <Network className="h-4 w-4 mr-2" /> Ports
          </Button>
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
        <Button
          variant={view === 'todos' ? 'secondary' : 'ghost'}
          size="sm"
          className="w-full justify-start"
          onClick={onGoTodos}
        >
          <ListTodo className="h-4 w-4 mr-2" /> Todos
        </Button>
        <Button
          variant={view === 'issues' ? 'secondary' : 'ghost'}
          size="sm"
          className="w-full justify-start"
          onClick={onGoIssues}
        >
          <AlertCircle className="h-4 w-4 mr-2" /> Issues
        </Button>
        <Button
          variant={view === 'chat' ? 'secondary' : 'ghost'}
          size="sm"
          className="w-full justify-start"
          onClick={onGoChat}
        >
          <MessageSquare className="h-4 w-4 mr-2" /> Chat
        </Button>
        <Button
          variant={view === 'phases' ? 'secondary' : 'ghost'}
          size="sm"
          className="w-full justify-start"
          onClick={onGoPhases}
        >
          <Layers className="h-4 w-4 mr-2" /> Phases
        </Button>
        <Button
          variant={view === 'ports' ? 'secondary' : 'ghost'}
          size="sm"
          className="w-full justify-start"
          onClick={onGoPorts}
        >
          <Network className="h-4 w-4 mr-2" /> Ports
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
