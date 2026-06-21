import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { cn } from '../lib/utils.js';
import { Plus, List, LayoutGrid, Columns2, AlertCircle } from 'lucide-react';
import IssueDetail from './IssueDetail.jsx';

const STATUS_COLORS = {
  pending: 'bg-muted text-muted-foreground',
  todo: 'bg-blue-600 text-white',
  inprogress: 'bg-yellow-600 text-white',
  verification: 'bg-purple-600 text-white',
  completed: 'bg-emerald-600 text-white',
};

const STATUS_CARD_BG = {
  pending: 'bg-muted/30 border-muted-foreground/20',
  todo: 'bg-blue-950/30 border-blue-500/40',
  inprogress: 'bg-yellow-950/30 border-yellow-500/40',
  verification: 'bg-purple-950/30 border-purple-500/40',
  completed: 'bg-emerald-950/30 border-emerald-500/40',
};

const PRIORITY_LABELS = { 1: 'P1', 2: 'P2', 3: 'P3', 4: 'P4', 5: 'P5' };
const PRIORITY_COLORS = { 5: 'bg-red-600', 4: 'bg-orange-600', 3: 'bg-yellow-600', 2: 'bg-blue-600', 1: 'bg-muted' };

const VIEW_MODES = [
  { key: 'list', icon: List, label: 'List' },
  { key: 'split', icon: Columns2, label: 'List + Detail' },
  { key: 'grid', icon: LayoutGrid, label: 'Grid + Detail' },
];

export default function Issues() {
  const [issues, setIssues] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [projects, setProjects] = useState([]);
  const [agents, setAgents] = useState([]);
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('kratos_issues_view') || 'list');
  const [selectedIssue, setSelectedIssue] = useState(null);
  const PAGE_SIZE = 20;

  useEffect(() => {
    apiFetch('/api/projects').then(r => r.json()).then(d => { if (Array.isArray(d)) setProjects(d); });
    apiFetch('/api/agents').then(r => r.json()).then(d => { if (Array.isArray(d)) setAgents(d); });
  }, []);

  useEffect(() => { localStorage.setItem('kratos_issues_view', viewMode); }, [viewMode]);

  const loadIssues = () => {
    const params = [];
    if (filterProject) params.push(`project_code=${filterProject}`);
    if (filterStatus) params.push(`status=${filterStatus}`);
    if (search.trim()) params.push(`q=${encodeURIComponent(search.trim())}`);
    params.push(`page=${page}`);
    params.push(`limit=${PAGE_SIZE}`);
    const qs = '?' + params.join('&');
    apiFetch(`/api/issues${qs}`).then(r => r.json()).then(d => {
      if (d.issues) { setIssues(d.issues); setTotal(d.total); }
      else if (Array.isArray(d)) { setIssues(d); setTotal(d.length); }
    });
  };

  useEffect(loadIssues, [filterProject, filterStatus, search, page]);
  useEffect(() => { setPage(1); }, [filterProject, filterStatus, search]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const getKey = (issue) => `${issue.project_code}-${issue.issue_number}`;

  // Header
  const header = (
    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <AlertCircle className="h-5 w-5" /> Issues <span className="text-sm font-normal text-muted-foreground">({total})</span>
      </h2>
      <div className="flex items-center gap-2 flex-wrap">
        <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-40 text-xs" />
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className="h-8 px-2 text-xs rounded border border-input bg-background text-foreground">
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.code} value={p.code}>{p.code}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-8 px-2 text-xs rounded border border-input bg-background text-foreground">
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="todo">Todo</option>
          <option value="inprogress">In Progress</option>
          <option value="verification">Verification</option>
          <option value="completed">Completed</option>
        </select>
        <div className="flex items-center gap-0.5">
          {VIEW_MODES.map(({ key, icon: Icon, label }) => (
            <Button key={key} variant={viewMode === key ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setViewMode(key)} title={label}>
              <Icon className="h-3.5 w-3.5" />
            </Button>
          ))}
        </div>
      </div>
    </div>
  );

  const pagination = totalPages > 1 && (
    <div className="flex items-center justify-center gap-2 mt-4">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
      <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
    </div>
  );

  // Detail panel
  const detailPanel = selectedIssue ? (
    <IssueDetail issueKey={selectedIssue} onBack={() => setSelectedIssue(null)} />
  ) : (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Select an issue</div>
  );

  // === List mode ===
  if (viewMode === 'list') {
    if (selectedIssue) {
      return <IssueDetail issueKey={selectedIssue} onBack={() => setSelectedIssue(null)} />;
    }
    return (
      <div>
        {header}
        <div className="space-y-1">
          {issues.map(issue => (
            <IssueRow key={issue.id} issue={issue} onSelect={() => setSelectedIssue(getKey(issue))} />
          ))}
          {issues.length === 0 && <p className="text-center text-muted-foreground py-8">No issues</p>}
        </div>
        {pagination}
      </div>
    );
  }

  // === Split mode ===
  if (viewMode === 'split') {
    return (
      <div className="flex flex-col h-full">
        {header}
        <div className="flex flex-1 min-h-0 gap-3">
          <div className="w-1/3 min-w-56 overflow-y-auto space-y-1 pr-2 border-r border-border">
            {issues.map(issue => (
              <IssueRow key={issue.id} issue={issue} compact selected={selectedIssue === getKey(issue)} onSelect={() => setSelectedIssue(getKey(issue))} />
            ))}
            {pagination}
          </div>
          <div className="flex-1 min-w-0 overflow-y-auto">
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
      <div className="flex flex-1 min-h-0 gap-3">
        <div className="w-2/5 min-w-64 overflow-y-auto pr-2 border-r border-border">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-1">
            {issues.map(issue => (
              <button
                key={issue.id}
                onClick={() => setSelectedIssue(getKey(issue))}
                className={cn(
                  'rounded border px-2 py-1.5 text-left transition-colors',
                  STATUS_CARD_BG[issue.status],
                  selectedIssue === getKey(issue) && 'ring-2 ring-ring border-ring'
                )}
                title={issue.title}
              >
                <div className="text-[10px] font-mono text-muted-foreground">{getKey(issue)}</div>
                <div className="text-xs truncate font-medium">{issue.title.slice(0, 20)}</div>
                <Badge className={cn('text-[8px] px-1 py-0 mt-0.5', STATUS_COLORS[issue.status])}>{issue.status}</Badge>
              </button>
            ))}
          </div>
          {pagination}
        </div>
        <div className="flex-1 min-w-0 overflow-y-auto">
          {detailPanel}
        </div>
      </div>
    </div>
  );
}

function IssueRow({ issue, compact, selected, onSelect }) {
  const key = `${issue.project_code}-${issue.issue_number}`;
  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex items-center justify-between w-full rounded-lg border text-left',
        compact ? 'px-3 py-2' : 'px-4 py-3',
        selected ? 'border-ring bg-accent/20' : 'border-border bg-card hover:border-accent/50'
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-mono text-muted-foreground shrink-0">{key}</span>
        <Badge className={cn('text-[10px] shrink-0', STATUS_COLORS[issue.status])}>{issue.status}</Badge>
        <span className={cn('truncate', compact ? 'text-xs' : 'text-sm')}>{issue.title}</span>
      </div>
    </button>
  );
}
