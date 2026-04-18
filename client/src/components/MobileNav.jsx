import { Button } from './ui/button.jsx';
import { ChevronLeft, Bot, Settings } from 'lucide-react';

export default function MobileNav({ view, selectedAgentId, onSelectAgent, onGoAgents, onGoSettings, onGoMenu, children }) {
  // State A: Menu — fullscreen menu buttons
  if (view === 'welcome') {
    return (
      <div className="flex-1 flex flex-col p-4 gap-3">
        <button
          onClick={onGoAgents}
          className="flex items-center justify-between p-4 rounded-lg border border-border bg-card text-left"
        >
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Agents</span>
          </div>
          <ChevronLeft className="h-4 w-4 text-muted-foreground rotate-180" />
        </button>
        <button
          onClick={onGoSettings}
          className="flex items-center justify-between p-4 rounded-lg border border-border bg-card text-left"
        >
          <div className="flex items-center gap-3">
            <Settings className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Settings</span>
          </div>
          <ChevronLeft className="h-4 w-4 text-muted-foreground rotate-180" />
        </button>
      </div>
    );
  }

  // State B: Agent List — back button + agent list
  if (view === 'agents') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
          <button onClick={onGoMenu} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <span className="font-medium text-sm">Agents</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    );
  }

  // Settings — back button + settings
  if (view === 'settings') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
          <button onClick={onGoMenu} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <span className="font-medium text-sm">Settings</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    );
  }

  // State C: Agent Detail — back button + terminal/webview (tabs handled inside AgentDetail)
  if (view === 'agent-detail') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
          <button onClick={onGoAgents} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
        </div>
        <div className="flex-1 min-h-0">
          {children}
        </div>
      </div>
    );
  }

  return <div className="flex-1 p-4">{children}</div>;
}
