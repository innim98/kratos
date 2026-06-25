import { useState } from 'react';
import { cn } from '../lib/utils.js';
import { Terminal, FolderOpen, FileText, ListTodo, AlertCircle } from 'lucide-react';

const TAB_ICONS = {
  terminal: Terminal,
  files: FolderOpen,
  text: FileText,
  todos: ListTodo,
  issues: AlertCircle,
};

const TAB_LABELS = {
  terminal: 'Terminal',
  files: 'Files',
  text: 'Text',
  todos: 'Todos',
  issues: 'Issues',
};

export default function PanelContent({ tabs, activeTab, onTabChange, actions, leftAction, children }) {
  return (
    <div className="flex flex-col h-full w-full min-h-0">
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-border bg-card/50 shrink-0 overflow-x-auto">
        {leftAction}
        {tabs.map(tab => {
          const Icon = TAB_ICONS[tab];
          const active = tab === activeTab;
          return (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={cn(
                'flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded text-xs transition-colors shrink-0',
                active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              )}
              title={TAB_LABELS[tab]}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{TAB_LABELS[tab]}</span>
            </button>
          );
        })}
        {actions && <><span className="flex-1 min-w-2" />{actions}</>}
      </div>
      <div className="flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}
