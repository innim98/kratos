import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { cn } from '../lib/utils.js';
import { Plus, ArrowLeft, FileText, ChevronRight, List, LayoutGrid, Columns2 } from 'lucide-react';
import MarkdownViewer from '../components/MarkdownViewer.jsx';

const STATUS_COLORS = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-blue-600 text-white',
  done: 'bg-emerald-600 text-white',
  deprecated: 'bg-red-600/50 text-red-200',
};

const STATUS_CARD_BG = {
  draft: 'bg-muted/30 border-muted-foreground/20',
  active: 'bg-blue-950/30 border-blue-500/40',
  done: 'bg-emerald-950/30 border-emerald-500/40',
  deprecated: 'bg-red-950/30 border-red-500/30 opacity-60',
};

const VIEW_MODES = [
  { key: 'list', icon: List, label: 'List' },
  { key: 'split', icon: Columns2, label: 'List + Viewer' },
  { key: 'grid', icon: LayoutGrid, label: 'Grid + Viewer' },
];

export default function Phases() {
  const [phases, setPhases] = useState([]);
  const [projects, setProjects] = useState([]);
  const [filterProject, setFilterProject] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newProject, setNewProject] = useState('');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('kratos_phases_view') || 'list');
  const [selectedPhase, setSelectedPhase] = useState(null);
  const [viewingDoc, setViewingDoc] = useState(null); // { doc, content }

  useEffect(() => {
    apiFetch('/api/projects').then(r => r.json()).then(d => { if (Array.isArray(d)) setProjects(d); });
  }, []);

  useEffect(() => { localStorage.setItem('kratos_phases_view', viewMode); }, [viewMode]);

  const loadPhases = () => {
    const qs = filterProject ? `?project_code=${filterProject}` : '';
    apiFetch(`/api/phases${qs}`).then(r => r.json()).then(d => {
      if (Array.isArray(d)) {
        // Sort descending: highest sort_order (newest) first
        setPhases(d.sort((a, b) => b.sort_order - a.sort_order || b.id - a.id));
      }
    });
  };

  useEffect(loadPhases, [filterProject]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newProject || !newName.trim()) return;
    await apiFetch('/api/phases', { method: 'POST', body: { project_code: newProject, name: newName.trim() } });
    setNewName(''); setShowAdd(false);
    loadPhases();
  };

  const handleStatusChange = async (phaseId, status) => {
    await apiFetch(`/api/phases/${phaseId}`, { method: 'PUT', body: { status } });
    loadPhases();
  };

  const handleViewDoc = async (doc) => {
    const res = await apiFetch(`/api/agents/${doc.agent_id}/files/read?path=${encodeURIComponent(doc.doc_path)}`);
    if (res.ok) {
      const data = await res.json();
      setViewingDoc({ doc, content: data.content });
    }
  };

  // Header (shared)
  const header = (
    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h2 className="text-xl font-semibold">Phases</h2>
      <div className="flex items-center gap-2">
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="h-8 px-2 text-xs rounded border border-input bg-background text-foreground">
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.code} value={p.code}>{p.code} — {p.name}</option>)}
        </select>
        <div className="flex items-center gap-0.5">
          {VIEW_MODES.map(({ key, icon: Icon, label }) => (
            <Button key={key} variant={viewMode === key ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setViewMode(key)} title={label}>
              <Icon className="h-3.5 w-3.5" />
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-4 w-4 mr-1" /> New
        </Button>
      </div>
    </div>
  );

  const addForm = showAdd && (
    <form onSubmit={handleAdd} className="mb-4 p-4 rounded-lg border border-border bg-card flex items-center gap-2">
      <select value={newProject} onChange={e => setNewProject(e.target.value)}
        className="h-9 px-2 text-sm rounded border border-input bg-background text-foreground w-24">
        <option value="">Project</option>
        {projects.map(p => <option key={p.code} value={p.code}>{p.code}</option>)}
      </select>
      <Input placeholder="Phase name" value={newName} onChange={e => setNewName(e.target.value)} className="flex-1" autoFocus />
      <Button type="submit" size="sm">Create</Button>
    </form>
  );

  // Markdown viewer panel
  const docViewer = viewingDoc ? (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <button onClick={() => setViewingDoc(null)} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium truncate">{viewingDoc.doc.title}</span>
        <Badge className={cn('text-[10px] ml-auto', STATUS_COLORS[viewingDoc.doc.status])}>{viewingDoc.doc.status}</Badge>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <MarkdownViewer content={viewingDoc.content} />
      </div>
    </div>
  ) : (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      Select a document to view
    </div>
  );

  // === MODE 1: List ===
  if (viewMode === 'list') {
    if (viewingDoc && !selectedPhase) {
      return (
        <div className="max-w-4xl">
          <button onClick={() => setViewingDoc(null)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="h-4 w-4" /> Back to phases
          </button>
          <div className="mb-4">
            <h2 className="text-lg font-semibold">{viewingDoc.doc.title}</h2>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span>{viewingDoc.doc.agent_name}</span>
              <span className="font-mono">{viewingDoc.doc.doc_path}</span>
              <Badge className={cn('text-[10px]', STATUS_COLORS[viewingDoc.doc.status])}>{viewingDoc.doc.status}</Badge>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-6">
            <MarkdownViewer content={viewingDoc.content} />
          </div>
        </div>
      );
    }

    return (
      <div>
        {header}
        {addForm}
        <div className="space-y-3">
          {phases.map(phase => (
            <PhaseListItem key={phase.id} phase={phase} onStatusChange={handleStatusChange} onViewDoc={handleViewDoc} />
          ))}
          {phases.length === 0 && <p className="text-center text-muted-foreground py-8">No phases</p>}
        </div>
      </div>
    );
  }

  // === MODE 2: Split (list + viewer) ===
  if (viewMode === 'split') {
    return (
      <div className="flex flex-col h-full">
        {header}
        {addForm}
        <div className="flex flex-1 min-h-0 gap-3">
          <div className="w-1/3 min-w-56 overflow-y-auto space-y-2 pr-2 border-r border-border">
            {phases.map(phase => (
              <PhaseCompactItem key={phase.id} phase={phase} selected={selectedPhase?.id === phase.id}
                onSelect={() => {
                  setSelectedPhase(phase);
                  if (phase.documents?.[0]) handleViewDoc(phase.documents[0]);
                  else setViewingDoc(null);
                }}
                onViewDoc={handleViewDoc} />
            ))}
          </div>
          <div className="flex-1 min-w-0 overflow-hidden rounded-lg border border-border bg-card">
            {docViewer}
          </div>
        </div>
      </div>
    );
  }

  // === MODE 3: Grid + viewer ===
  return (
    <div className="flex flex-col h-full">
      {header}
      {addForm}
      <div className="flex flex-1 min-h-0 gap-3">
        <div className="w-2/5 min-w-64 overflow-y-auto pr-2 border-r border-border">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {phases.map(phase => (
              <button
                key={phase.id}
                onClick={() => {
                  setSelectedPhase(phase);
                  if (phase.documents?.[0]) handleViewDoc(phase.documents[0]);
                  else setViewingDoc(null);
                }}
                className={cn(
                  'rounded border px-2 py-1.5 text-left transition-colors',
                  STATUS_CARD_BG[phase.status],
                  selectedPhase?.id === phase.id && 'ring-2 ring-ring border-ring'
                )}
                title={phase.name}
              >
                <div className="text-[10px] font-mono text-muted-foreground">{phase.project_code}-{phase.sort_order}</div>
                <div className="text-xs truncate font-medium">{phase.name.slice(0, 20)}</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <Badge className={cn('text-[8px] px-1 py-0', STATUS_COLORS[phase.status])}>{phase.status}</Badge>
                  {phase.documents?.length > 0 && <span className="text-[9px] text-muted-foreground">{phase.documents.length} docs</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {selectedPhase && (
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
              <span className="text-sm font-medium">{selectedPhase.name}</span>
              <div className="flex items-center gap-1 ml-auto">
                {['draft', 'active', 'done', 'deprecated'].map(s => (
                  <button key={s} onClick={() => handleStatusChange(selectedPhase.id, s)}
                    className={cn('px-1.5 py-0.5 rounded text-[10px]', s === selectedPhase.status ? STATUS_COLORS[s] : 'text-muted-foreground hover:bg-accent/50')}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {selectedPhase?.documents?.length > 1 && (
            <div className="flex items-center gap-1 px-3 py-1 border-b border-border shrink-0 overflow-x-auto">
              {selectedPhase.documents.map(doc => (
                <button key={doc.id} onClick={() => handleViewDoc(doc)}
                  className={cn('px-2 py-0.5 rounded text-[10px] shrink-0', viewingDoc?.doc?.id === doc.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50')}>
                  {doc.title}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-hidden rounded-lg border border-border bg-card">
            {docViewer}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

function PhaseListItem({ phase, onStatusChange, onViewDoc }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{phase.project_code}</span>
          <span className="font-medium text-sm">{phase.name}</span>
        </div>
        <div className="flex items-center gap-1">
          {['draft', 'active', 'done', 'deprecated'].map(s => (
            <button key={s} onClick={() => onStatusChange(phase.id, s)}
              className={cn('px-2 py-0.5 rounded text-[10px]', s === phase.status ? STATUS_COLORS[s] : 'text-muted-foreground hover:bg-accent/50')}>
              {s}
            </button>
          ))}
        </div>
      </div>
      {phase.documents?.length > 0 && (
        <div className="border-t border-border">
          {phase.documents.map(doc => (
            <button key={doc.id} onClick={() => onViewDoc(doc)}
              className="flex items-center gap-2 w-full px-4 py-2 text-left hover:bg-accent/50 border-b border-border last:border-0 text-sm">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 min-w-0 truncate">{doc.title}</span>
              <Badge className={cn('text-[10px]', STATUS_COLORS[doc.status])}>{doc.status}</Badge>
              <span className="text-[10px] text-muted-foreground shrink-0">{doc.agent_name}</span>
              <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}
      {(!phase.documents || phase.documents.length === 0) && (
        <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">No documents</div>
      )}
    </div>
  );
}

function PhaseCompactItem({ phase, selected, onSelect, onViewDoc }) {
  return (
    <div className={cn('rounded-lg border overflow-hidden cursor-pointer', selected ? 'border-ring bg-accent/20' : 'border-border bg-card hover:border-accent/50')} onClick={onSelect}>
      <div className="flex items-center gap-2 px-3 py-2">
        <Badge className={cn('text-[10px]', STATUS_COLORS[phase.status])}>{phase.status}</Badge>
        <span className="text-xs font-mono text-muted-foreground">{phase.project_code}</span>
        <span className="text-sm font-medium truncate">{phase.name}</span>
      </div>
      {selected && phase.documents?.length > 0 && (
        <div className="border-t border-border">
          {phase.documents.map(doc => (
            <button key={doc.id} onClick={(e) => { e.stopPropagation(); onViewDoc(doc); }}
              className="flex items-center gap-1.5 w-full px-3 py-1.5 text-left hover:bg-accent/50 text-xs border-b border-border last:border-0">
              <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="truncate">{doc.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
