import { useState } from 'react';
import { cn } from '../lib/utils.js';
import { Terminal, FolderOpen, Monitor, FileText, ListTodo } from 'lucide-react';

const TAB_ICONS = {
  terminal: Terminal,
  files: FolderOpen,
  webview: Monitor,
  text: FileText,
  todos: ListTodo,
};

const TAB_LABELS = {
  terminal: 'Terminal',
  files: 'Files',
  webview: 'Webview',
  text: 'Text',
  todos: 'Todos',
};

export default function PanelContent({ tabs, activeTab, onTabChange, children }) {
  return (
    <div className="flex flex-col h-full w-full min-h-0">
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-border bg-card/50 shrink-0">
        {tabs.map(tab => {
          const Icon = TAB_ICONS[tab];
          const active = tab === activeTab;
          return (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {TAB_LABELS[tab]}
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}
