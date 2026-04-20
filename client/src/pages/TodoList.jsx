import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { cn } from '../lib/utils.js';
import { Plus, Check, Circle, Clock, ChevronDown, ChevronUp } from 'lucide-react';

const STATUS_ICONS = {
  pending: Circle,
  in_progress: Clock,
  completed: Check,
};

const STATUS_COLORS = {
  pending: 'text-muted-foreground',
  in_progress: 'text-yellow-500',
  completed: 'text-emerald-500',
};

const PRIORITY_LABELS = { 1: 'P1', 2: 'P2', 3: 'P3', 4: 'P4', 5: 'P5' };
const PRIORITY_COLORS = {
  5: 'bg-red-600', 4: 'bg-orange-600', 3: 'bg-yellow-600', 2: 'bg-blue-600', 1: 'bg-muted',
};

export default function TodoList({ agentFilter }) {
  const [todos, setTodos] = useState([]);
  const [agents, setAgents] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'pending' | 'completed'

  // Add form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState(3);
  const [dueDate, setDueDate] = useState('');
  const [agentId, setAgentId] = useState('');

  const loadTodos = () => {
    let url = '/api/todos';
    const params = [];
    if (agentFilter) params.push(`agent_id=${agentFilter}`);
    if (filter !== 'all') params.push(`status=${filter}`);
    if (params.length) url += '?' + params.join('&');

    apiFetch(url).then(r => r.json()).then(data => {
      if (Array.isArray(data)) setTodos(data);
    });
  };

  useEffect(() => {
    apiFetch('/api/agents').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setAgents(data);
    });
  }, []);

  useEffect(loadTodos, [filter, agentFilter]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    await apiFetch('/api/todos', {
      method: 'POST',
      body: {
        title: title.trim(),
        description,
        priority,
        due_date: dueDate || null,
        agent_id: agentId ? Number(agentId) : null,
      },
    });
    setTitle(''); setDescription(''); setPriority(3); setDueDate(''); setAgentId('');
    setShowAdd(false);
    loadTodos();
  };

  const handleStatusChange = async (todo, newStatus) => {
    await apiFetch(`/api/todos/${todo.id}`, {
      method: 'PUT',
      body: { status: newStatus },
    });
    loadTodos();
  };

  const handleDelete = async (id) => {
    await apiFetch(`/api/todos/${id}`, { method: 'DELETE' });
    loadTodos();
  };

  const nextStatus = (status) => {
    if (status === 'pending') return 'in_progress';
    if (status === 'in_progress') return 'completed';
    return 'pending';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Todos</h2>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="h-8 px-2 text-xs rounded border border-input bg-background text-foreground"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
          <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-4 p-4 rounded-lg border border-border bg-card space-y-3">
          <Input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full h-20 px-3 py-2 text-sm rounded-md border border-input bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground">Priority</label>
              <select value={priority} onChange={e => setPriority(Number(e.target.value))}
                className="h-8 px-2 text-xs rounded border border-input bg-background text-foreground">
                <option value={5}>P5 (Critical)</option>
                <option value={4}>P4 (High)</option>
                <option value={3}>P3 (Medium)</option>
                <option value={2}>P2 (Low)</option>
                <option value={1}>P1 (Lowest)</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground">Due</label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-8 w-auto text-xs" />
            </div>
            {!agentFilter && (
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground">Agent</label>
                <select value={agentId} onChange={e => setAgentId(e.target.value)}
                  className="h-8 px-2 text-xs rounded border border-input bg-background text-foreground">
                  <option value="">None</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}
            <span className="flex-1" />
            <Button type="submit" size="sm">Create</Button>
          </div>
        </form>
      )}

      <div className="space-y-1">
        {todos.map(todo => {
          const StatusIcon = STATUS_ICONS[todo.status];
          const agentName = agents.find(a => a.id === todo.agent_id)?.name;
          return (
            <div key={todo.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-border bg-card hover:border-accent/50">
              <button
                onClick={() => handleStatusChange(todo, nextStatus(todo.status))}
                className={cn('mt-0.5 shrink-0', STATUS_COLORS[todo.status])}
                title={`Status: ${todo.status} (click to advance)`}
              >
                <StatusIcon className="h-4 w-4" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn('text-sm', todo.status === 'completed' && 'line-through text-muted-foreground')}>
                    {todo.title}
                  </span>
                  <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 text-white', PRIORITY_COLORS[todo.priority])}>
                    {PRIORITY_LABELS[todo.priority]}
                  </Badge>
                  {agentName && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{agentName}</Badge>
                  )}
                  {todo.created_by_type === 'agent' && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">agent</Badge>
                  )}
                </div>
                {todo.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{todo.description}</p>
                )}
                {todo.due_date && (
                  <span className="text-[10px] text-muted-foreground">Due: {todo.due_date}</span>
                )}
              </div>
              <button onClick={() => handleDelete(todo.id)} className="text-xs text-muted-foreground hover:text-destructive shrink-0">
                ×
              </button>
            </div>
          );
        })}
        {todos.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No todos</p>
        )}
      </div>
    </div>
  );
}
