import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { cn } from '../lib/utils.js';
import { Plus, Check, Circle, Clock, X, List, LayoutGrid, Columns2 } from 'lucide-react';

const STATUS_ICONS = { pending: Circle, in_progress: Clock, completed: Check };
const STATUS_COLORS = { pending: 'text-muted-foreground', in_progress: 'text-yellow-500', completed: 'text-emerald-500' };
const STATUS_CARD_BG = {
  pending: 'bg-muted/30 border-muted-foreground/20',
  in_progress: 'bg-yellow-950/30 border-yellow-500/40',
  completed: 'bg-emerald-950/30 border-emerald-500/40 opacity-60',
};
const PRIORITY_LABELS = { 1: 'P1', 2: 'P2', 3: 'P3', 4: 'P4', 5: 'P5' };
const PRIORITY_COLORS = { 5: 'bg-red-600', 4: 'bg-orange-600', 3: 'bg-yellow-600', 2: 'bg-blue-600', 1: 'bg-muted' };

const VIEW_MODES = [
  { key: 'list', icon: List, label: 'List' },
  { key: 'split', icon: Columns2, label: 'List + Detail' },
  { key: 'grid', icon: LayoutGrid, label: 'Grid + Detail' },
];

export default function TodoList({ agentFilter }) {
  const [todos, setTodos] = useState([]);
  const [agents, setAgents] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState('all');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('kratos_todos_view') || 'list');
  const [selectedTodo, setSelectedTodo] = useState(null);
  const [editFields, setEditFields] = useState({});

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
    apiFetch(url).then(r => r.json()).then(data => { if (Array.isArray(data)) setTodos(data); });
  };

  useEffect(() => { apiFetch('/api/agents').then(r => r.json()).then(d => { if (Array.isArray(d)) setAgents(d); }); }, []);
  useEffect(loadTodos, [filter, agentFilter]);
  useEffect(() => { localStorage.setItem('kratos_todos_view', viewMode); }, [viewMode]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    await apiFetch('/api/todos', { method: 'POST', body: { title: title.trim(), description, priority, due_date: dueDate || null, agent_id: agentId ? Number(agentId) : null } });
    setTitle(''); setDescription(''); setPriority(3); setDueDate(''); setAgentId('');
    setShowAdd(false);
    loadTodos();
  };

  const handleStatusChange = async (todo, newStatus) => {
    await apiFetch(`/api/todos/${todo.id}`, { method: 'PUT', body: { status: newStatus } });
    loadTodos();
  };

  const handleDelete = async (id) => {
    await apiFetch(`/api/todos/${id}`, { method: 'DELETE' });
    if (selectedTodo?.id === id) setSelectedTodo(null);
    loadTodos();
  };

  const startEdit = (todo) => {
    setSelectedTodo(todo);
    setEditFields({ title: todo.title, description: todo.description || '', priority: todo.priority, status: todo.status, due_date: todo.due_date || '', agent_id: todo.agent_id || '' });
  };

  const handleEditSave = async () => {
    if (!selectedTodo) return;
    await apiFetch(`/api/todos/${selectedTodo.id}`, { method: 'PUT', body: { title: editFields.title, description: editFields.description, priority: editFields.priority, status: editFields.status, due_date: editFields.due_date || null, agent_id: editFields.agent_id ? Number(editFields.agent_id) : null } });
    setSelectedTodo(null);
    loadTodos();
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSave(); }
    if (e.key === 'Escape') setSelectedTodo(null);
  };

  const nextStatus = (s) => s === 'pending' ? 'in_progress' : s === 'in_progress' ? 'completed' : 'pending';

  // Header
  const header = (
    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h2 className="text-xl font-semibold">Todos</h2>
      <div className="flex items-center gap-2">
        <select value={filter} onChange={e => setFilter(e.target.value)} className="h-8 px-2 text-xs rounded border border-input bg-background text-foreground">
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        <div className="flex items-center gap-0.5">
          {VIEW_MODES.map(({ key, icon: Icon, label }) => (
            <Button key={key} variant={viewMode === key ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setViewMode(key)} title={label}>
              <Icon className="h-3.5 w-3.5" />
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
    </div>
  );

  const addForm = showAdd && (
    <form onSubmit={handleAdd} className="mb-4 p-4 rounded-lg border border-border bg-card space-y-3">
      <Input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
      <textarea placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)}
        className="w-full h-20 px-3 py-2 text-sm rounded-md border border-input bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
      <div className="flex items-center gap-3 flex-wrap">
        <select value={priority} onChange={e => setPriority(Number(e.target.value))} className="h-8 px-2 text-xs rounded border border-input bg-background text-foreground">
          <option value={5}>P5</option><option value={4}>P4</option><option value={3}>P3</option><option value={2}>P2</option><option value={1}>P1</option>
        </select>
        <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-8 w-auto text-xs" />
        {!agentFilter && (
          <select value={agentId} onChange={e => setAgentId(e.target.value)} className="h-8 px-2 text-xs rounded border border-input bg-background text-foreground">
            <option value="">No agent</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <span className="flex-1" />
        <Button type="submit" size="sm">Create</Button>
      </div>
    </form>
  );

  // Detail/edit panel
  const detailPanel = selectedTodo ? (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-muted-foreground">K-{selectedTodo.id}</span>
        <Input value={editFields.title} onChange={e => setEditFields({ ...editFields, title: e.target.value })} onKeyDown={handleEditKeyDown} className="h-8 text-sm flex-1" />
      </div>
      <textarea value={editFields.description} onChange={e => setEditFields({ ...editFields, description: e.target.value })} onKeyDown={handleEditKeyDown} placeholder="Description"
        className="w-full h-24 px-3 py-2 text-sm rounded-md border border-input bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
      <div className="flex items-center gap-2 flex-wrap">
        <select value={editFields.status} onChange={e => setEditFields({ ...editFields, status: e.target.value })} className="h-7 px-1.5 text-xs rounded border border-input bg-background text-foreground">
          <option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="completed">Completed</option>
        </select>
        <select value={editFields.priority} onChange={e => setEditFields({ ...editFields, priority: Number(e.target.value) })} className="h-7 px-1.5 text-xs rounded border border-input bg-background text-foreground">
          <option value={5}>P5</option><option value={4}>P4</option><option value={3}>P3</option><option value={2}>P2</option><option value={1}>P1</option>
        </select>
        <Input type="date" value={editFields.due_date} onChange={e => setEditFields({ ...editFields, due_date: e.target.value })} className="h-7 w-auto text-xs" />
        <select value={editFields.agent_id} onChange={e => setEditFields({ ...editFields, agent_id: e.target.value })} className="h-7 px-1.5 text-xs rounded border border-input bg-background text-foreground">
          <option value="">No agent</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <span className="flex-1" />
        <Button size="sm" className="h-7 text-xs" onClick={handleEditSave}><Check className="h-3 w-3 mr-1" /> Save</Button>
        <button onClick={() => setSelectedTodo(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
    </div>
  ) : (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Select a todo to edit</div>
  );

  // === List mode ===
  if (viewMode === 'list') {
    return (
      <div>
        {header}
        {addForm}
        <div className="space-y-1">
          {todos.map(todo => <TodoRow key={todo.id} todo={todo} agents={agents} selected={selectedTodo?.id === todo.id} onSelect={() => startEdit(todo)} onStatusChange={handleStatusChange} onDelete={handleDelete} nextStatus={nextStatus} />)}
          {todos.length === 0 && <p className="text-center text-muted-foreground py-8">No todos</p>}
        </div>
        {selectedTodo && viewMode === 'list' && (
          <div className="mt-4 rounded-lg border border-border bg-card">{detailPanel}</div>
        )}
      </div>
    );
  }

  // === Split mode ===
  if (viewMode === 'split') {
    return (
      <div className="flex flex-col h-full">
        {header}
        {addForm}
        <div className="flex flex-1 min-h-0 gap-3">
          <div className="w-1/3 min-w-56 overflow-y-auto space-y-1 pr-2 border-r border-border">
            {todos.map(todo => <TodoRow key={todo.id} todo={todo} agents={agents} compact selected={selectedTodo?.id === todo.id} onSelect={() => startEdit(todo)} onStatusChange={handleStatusChange} onDelete={handleDelete} nextStatus={nextStatus} />)}
          </div>
          <div className="flex-1 min-w-0 overflow-y-auto rounded-lg border border-border bg-card">
            {detailPanel}
          </div>
        </div>
      </div>
    );
  }

  // === Grid mode ===
  return (
    <div className="flex flex-col h-full">
      {header}
      {addForm}
      <div className="flex flex-1 min-h-0 gap-3">
        <div className="w-2/5 min-w-64 overflow-y-auto pr-2 border-r border-border">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-1">
            {todos.map(todo => (
              <button
                key={todo.id}
                onClick={() => startEdit(todo)}
                className={cn(
                  'rounded border px-2 py-1.5 text-left transition-colors',
                  STATUS_CARD_BG[todo.status],
                  selectedTodo?.id === todo.id && 'ring-2 ring-ring border-ring'
                )}
                title={todo.title}
              >
                <div className="text-[10px] font-mono text-muted-foreground">K-{todo.id}</div>
                <div className="text-xs truncate font-medium">{todo.title.slice(0, 20)}</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <Badge variant="outline" className={cn('text-[8px] px-1 py-0 text-white', PRIORITY_COLORS[todo.priority])}>{PRIORITY_LABELS[todo.priority]}</Badge>
                  <span className={cn('text-[9px]', STATUS_COLORS[todo.status])}>{todo.status}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-w-0 overflow-y-auto rounded-lg border border-border bg-card">
          {detailPanel}
        </div>
      </div>
    </div>
  );
}

function TodoRow({ todo, agents, compact, selected, onSelect, onStatusChange, onDelete, nextStatus }) {
  const StatusIcon = STATUS_ICONS[todo.status];
  const agentName = agents.find(a => a.id === todo.agent_id)?.name;
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border', compact ? 'px-2 py-1.5' : 'px-3 py-2.5', selected ? 'border-ring bg-accent/20' : 'border-border bg-card hover:border-accent/50')}>
      <button onClick={() => onStatusChange(todo, nextStatus(todo.status))} className={cn('mt-0.5 shrink-0', STATUS_COLORS[todo.status])}>
        <StatusIcon className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onSelect}>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">K-{todo.id}</span>
          <span className={cn(compact ? 'text-xs' : 'text-sm', 'truncate', todo.status === 'completed' && 'line-through text-muted-foreground')}>{todo.title}</span>
          <Badge variant="outline" className={cn('text-[10px] px-1 py-0 text-white', PRIORITY_COLORS[todo.priority])}>{PRIORITY_LABELS[todo.priority]}</Badge>
        </div>
        {!compact && todo.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{todo.description}</p>}
      </div>
      {!compact && <button onClick={() => onDelete(todo.id)} className="text-xs text-muted-foreground hover:text-destructive shrink-0">×</button>}
    </div>
  );
}
