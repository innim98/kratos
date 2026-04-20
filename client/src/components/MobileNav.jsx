import { ChevronLeft, Bot, Settings, ListTodo, Network } from 'lucide-react';

export default function MobileNav({ view, selectedAgentId, onSelectAgent, onGoAgents, onGoSettings, onGoTodos, onGoPorts, onGoMenu, children }) {
  // State A: Menu
  if (view === 'welcome') {
    return (
      <div className="flex-1 flex flex-col p-4 gap-3">
        <button onClick={onGoAgents} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card text-left">
          <div className="flex items-center gap-3"><Bot className="h-5 w-5 text-muted-foreground" /><span className="font-medium">Agents</span></div>
          <ChevronLeft className="h-4 w-4 text-muted-foreground rotate-180" />
        </button>
        <button onClick={onGoTodos} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card text-left">
          <div className="flex items-center gap-3"><ListTodo className="h-5 w-5 text-muted-foreground" /><span className="font-medium">Todos</span></div>
          <ChevronLeft className="h-4 w-4 text-muted-foreground rotate-180" />
        </button>
        <button onClick={onGoPorts} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card text-left">
          <div className="flex items-center gap-3"><Network className="h-5 w-5 text-muted-foreground" /><span className="font-medium">Ports</span></div>
          <ChevronLeft className="h-4 w-4 text-muted-foreground rotate-180" />
        </button>
        <button onClick={onGoSettings} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card text-left">
          <div className="flex items-center gap-3"><Settings className="h-5 w-5 text-muted-foreground" /><span className="font-medium">Settings</span></div>
          <ChevronLeft className="h-4 w-4 text-muted-foreground rotate-180" />
        </button>
      </div>
    );
  }

  // Back-button views
  const backViews = {
    agents: { label: 'Agents', back: onGoMenu },
    todos: { label: 'Todos', back: onGoMenu },
    ports: { label: 'Ports', back: onGoMenu },
    settings: { label: 'Settings', back: onGoMenu },
    'agent-detail': { label: '', back: onGoAgents },
  };

  const config = backViews[view];
  if (config) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
          <button onClick={config.back} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          {config.label && <span className="font-medium text-sm">{config.label}</span>}
        </div>
        <div className={view === 'agent-detail' ? 'flex-1 min-h-0' : 'flex-1 overflow-y-auto p-4'}>
          {children}
        </div>
      </div>
    );
  }

  return <div className="flex-1 p-4">{children}</div>;
}
