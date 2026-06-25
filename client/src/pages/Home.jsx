import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { cn } from '../lib/utils.js';
import { Badge } from '../components/ui/badge.jsx';
import { Bot, ListTodo, AlertCircle, Layers } from 'lucide-react';

export default function Home({ onSelectAgent, onGoTodos, onGoIssues, onGoPhases }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    apiFetch('/api/dashboard').then(r => r.json()).then(setData).catch(() => {});
  }, []);

  if (!data) return <div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>;

  const timeAgo = (ts) => {
    if (!ts) return '';
    const diff = Math.floor(Date.now() / 1000 - ts);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Agents */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Bot className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Agents</h3>
          <Badge variant="secondary" className="text-xs">{data.agents.online} / {data.agents.total} online</Badge>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {data.agents.top.map(a => (
            <button
              key={a.id}
              onClick={() => onSelectAgent(a.id)}
              className={cn(
                'rounded-lg border px-3 py-2.5 text-left transition-colors hover:border-primary/50',
                a.status === 'working' ? 'bg-emerald-950/20 border-emerald-500/30' : a.status === 'idle' ? 'bg-yellow-950/20 border-yellow-500/30' : a.status === 'online' ? 'bg-emerald-950/10 border-emerald-500/20' : 'bg-card border-border'
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', a.status === 'working' ? 'bg-emerald-500 animate-pulse' : a.status === 'idle' ? 'bg-yellow-500' : a.status === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
                <span className="text-sm font-medium truncate">{a.name}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{timeAgo(a.lastActivity)} ago</span>
            </button>
          ))}
        </div>
      </section>

      {/* Todos */}
      <section>
        <button onClick={onGoTodos} className="flex items-center gap-2 mb-3 hover:text-foreground text-muted-foreground transition-colors">
          <ListTodo className="h-5 w-5" />
          <h3 className="font-semibold text-foreground">Todos</h3>
          <Badge variant="secondary" className="text-xs">{data.todos.open} open</Badge>
        </button>
        <div className="space-y-1">
          {data.todos.oldest.map(t => (
            <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded border border-border bg-card text-sm">
              <span className="text-[10px] font-mono text-muted-foreground shrink-0">K-{t.id}</span>
              <span className="truncate flex-1">{t.title}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{t.created_at?.slice(0, 10)}</span>
            </div>
          ))}
          {data.todos.oldest.length === 0 && <p className="text-xs text-muted-foreground">No open todos</p>}
        </div>
      </section>

      {/* Issues */}
      <section>
        <button onClick={onGoIssues} className="flex items-center gap-2 mb-3 hover:text-foreground text-muted-foreground transition-colors">
          <AlertCircle className="h-5 w-5" />
          <h3 className="font-semibold text-foreground">Issues</h3>
          <Badge variant="secondary" className="text-xs">{data.issues.open} open</Badge>
        </button>
        <div className="space-y-1">
          {data.issues.oldest.map(i => (
            <div key={i.id} className="flex items-center gap-2 px-3 py-2 rounded border border-border bg-card text-sm">
              <span className="text-[10px] font-mono text-muted-foreground shrink-0">{i.project_code}-{i.issue_number}</span>
              <span className="truncate flex-1">{i.title}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{i.created_at?.slice(0, 10)}</span>
            </div>
          ))}
          {data.issues.oldest.length === 0 && <p className="text-xs text-muted-foreground">No open issues</p>}
        </div>
      </section>

      {/* Phases */}
      {data.phases.length > 0 && (
        <section>
          <button onClick={onGoPhases} className="flex items-center gap-2 mb-3 hover:text-foreground text-muted-foreground transition-colors">
            <Layers className="h-5 w-5" />
            <h3 className="font-semibold text-foreground">Active Phases</h3>
          </button>
          <div className="space-y-1">
            {data.phases.map(p => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded border border-border bg-card text-sm">
                <span className="text-[10px] font-mono text-muted-foreground shrink-0">{p.project_code}</span>
                <span className="truncate flex-1">{p.name}</span>
                <Badge className="text-[10px] bg-blue-600 text-white">active</Badge>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
