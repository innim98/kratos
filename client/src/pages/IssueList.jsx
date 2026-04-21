import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { cn } from '../lib/utils.js';
import { Plus, AlertCircle } from 'lucide-react';

const STATUS_COLORS = {
  pending: 'bg-muted text-muted-foreground',
  todo: 'bg-blue-600 text-white',
  inprogress: 'bg-yellow-600 text-white',
  verification: 'bg-purple-600 text-white',
  completed: 'bg-emerald-600 text-white',
};

const PRIORITY_LABELS = { 1: 'P1', 2: 'P2', 3: 'P3', 4: 'P4', 5: 'P5' };
const PRIORITY_COLORS = { 5: 'bg-red-600', 4: 'bg-orange-600', 3: 'bg-yellow-600', 2: 'bg-blue-600', 1: 'bg-muted' };

export default function IssueList({ onSelectIssue }) {
  const [issues, setIssues] = useState([]);
  const [projects, setProjects] = useState([]);
  const [agents, setAgents] = useState([]);
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  // Add form
  const [projectCode, setProjectCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState(3);
  const [assignee, setAssignee] = useState('');

  useEffect(() => {
    apiFetch('/api/projects').then(r => r.json()).then(d => { if (Array.isArray(d)) setProjects(d); });
    apiFetch('/api/agents').then(r => r.json()).then(d => { if (Array.isArray(d)) setAgents(d); });
  }, []);

  const loadIssues = () => {
    const params = [];
    if (filterProject) params.push(`project_code=${filterProject}`);
    if (filterStatus) params.push(`status=${filterStatus}`);
    const qs = params.length ? '?' + params.join('&') : '';
    apiFetch(`/api/issues${qs}`).then(r => r.json()).then(d => { if (Array.isArray(d)) setIssues(d); });
  };

  useEffect(loadIssues, [filterProject, filterStatus]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!projectCode || !title.trim()) return;
    await apiFetch('/api/issues', {
      method: 'POST',
      body: { project_code: projectCode, title: title.trim(), description, priority, assignee_agent_id: assignee ? Number(assignee) : null },
    });
    setTitle(''); setDescription(''); setPriority(3); setAssignee('');
    setShowAdd(false);
    loadIssues();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <AlertCircle className="h-5 w-5" /> Issues
        </h2>
        <div className="flex items-center gap-2">
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
            className="h-8 px-2 text-xs rounded border border-input bg-background text-foreground">
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.code} value={p.code}>{p.code} — {p.name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="h-8 px-2 text-xs rounded border border-input bg-background text-foreground">
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="todo">Todo</option>
            <option value="inprogress">In Progress</option>
            <option value="verification">Verification</option>
            <option value="completed">Completed</option>
          </select>
          <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="h-4 w-4 mr-1" /> New Issue
          </Button>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-4 p-4 rounded-lg border border-border bg-card space-y-3">
          <div className="flex gap-2">
            <select value={projectCode} onChange={e => setProjectCode(e.target.value)}
              className="h-9 px-2 text-sm rounded border border-input bg-background text-foreground w-32">
              <option value="">Project</option>
              {projects.map(p => <option key={p.code} value={p.code}>{p.code}</option>)}
            </select>
            <Input placeholder="Issue title" value={title} onChange={e => setTitle(e.target.value)} className="flex-1" autoFocus />
          </div>
          <textarea placeholder="Description (markdown)" value={description} onChange={e => setDescription(e.target.value)}
            className="w-full h-24 px-3 py-2 text-sm rounded-md border border-input bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground">Priority</label>
              <select value={priority} onChange={e => setPriority(Number(e.target.value))}
                className="h-8 px-2 text-xs rounded border border-input bg-background text-foreground">
                <option value={5}>P5 Critical</option><option value={4}>P4 High</option>
                <option value={3}>P3 Medium</option><option value={2}>P2 Low</option><option value={1}>P1 Lowest</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground">Assignee</label>
              <select value={assignee} onChange={e => setAssignee(e.target.value)}
                className="h-8 px-2 text-xs rounded border border-input bg-background text-foreground">
                <option value="">None</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <span className="flex-1" />
            <Button type="submit" size="sm">Create</Button>
          </div>
        </form>
      )}

      <div className="space-y-1">
        {issues.map(issue => {
          const key = `${issue.project_code}-${issue.issue_number}`;
          return (
            <button
              key={issue.id}
              onClick={() => onSelectIssue(key)}
              className="flex items-center justify-between w-full px-4 py-3 rounded-lg border border-border bg-card hover:border-accent/50 text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-mono text-muted-foreground shrink-0 w-14">{key}</span>
                <Badge className={cn('text-[10px] shrink-0', STATUS_COLORS[issue.status])}>{issue.status}</Badge>
                <Badge variant="outline" className={cn('text-[10px] text-white shrink-0', PRIORITY_COLORS[issue.priority])}>{PRIORITY_LABELS[issue.priority]}</Badge>
                <span className="text-sm truncate">{issue.title}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2 text-xs text-muted-foreground">
                {issue.assignee_name && <span>{issue.assignee_name}</span>}
                <span>{issue.reporter_name}</span>
              </div>
            </button>
          );
        })}
        {issues.length === 0 && <p className="text-center text-muted-foreground py-8">No issues</p>}
      </div>
    </div>
  );
}
