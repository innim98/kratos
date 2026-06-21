import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { cn } from '../lib/utils.js';
import { Plus, ArrowLeft, FileText, ChevronRight } from 'lucide-react';
import MarkdownViewer from '../components/MarkdownViewer.jsx';

const STATUS_COLORS = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-blue-600 text-white',
  done: 'bg-emerald-600 text-white',
  deprecated: 'bg-red-600/50 text-red-200',
};

export default function Phases() {
  const [phases, setPhases] = useState([]);
  const [projects, setProjects] = useState([]);
  const [filterProject, setFilterProject] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newProject, setNewProject] = useState('');
  const [viewingDoc, setViewingDoc] = useState(null); // { doc, content }

  useEffect(() => {
    apiFetch('/api/projects').then(r => r.json()).then(d => { if (Array.isArray(d)) setProjects(d); });
  }, []);

  const loadPhases = () => {
    const qs = filterProject ? `?project_code=${filterProject}` : '';
    apiFetch(`/api/phases${qs}`).then(r => r.json()).then(d => { if (Array.isArray(d)) setPhases(d); });
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

  // Document viewer
  if (viewingDoc) {
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

  // Grid Map
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Phases</h2>
        <div className="flex items-center gap-2">
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
            className="h-8 px-2 text-xs rounded border border-input bg-background text-foreground">
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.code} value={p.code}>{p.code} — {p.name}</option>)}
          </select>
          <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="h-4 w-4 mr-1" /> New Phase
          </Button>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-4 p-4 rounded-lg border border-border bg-card flex items-center gap-2">
          <select value={newProject} onChange={e => setNewProject(e.target.value)}
            className="h-9 px-2 text-sm rounded border border-input bg-background text-foreground w-24">
            <option value="">Project</option>
            {projects.map(p => <option key={p.code} value={p.code}>{p.code}</option>)}
          </select>
          <Input placeholder="Phase name" value={newName} onChange={e => setNewName(e.target.value)} className="flex-1" autoFocus />
          <Button type="submit" size="sm">Create</Button>
        </form>
      )}

      <div className="space-y-3">
        {phases.map(phase => (
          <div key={phase.id} className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{phase.project_code}</span>
                <span className="font-medium text-sm">{phase.name}</span>
              </div>
              <div className="flex items-center gap-1">
                {['draft', 'active', 'done', 'deprecated'].map(s => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(phase.id, s)}
                    className={cn('px-2 py-0.5 rounded text-[10px]', s === phase.status ? STATUS_COLORS[s] : 'text-muted-foreground hover:bg-accent/50')}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            {phase.documents?.length > 0 && (
              <div className="border-t border-border">
                {phase.documents.map(doc => (
                  <button
                    key={doc.id}
                    onClick={() => handleViewDoc(doc)}
                    className="flex items-center gap-2 w-full px-4 py-2 text-left hover:bg-accent/50 border-b border-border last:border-0 text-sm"
                  >
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
        ))}
        {phases.length === 0 && <p className="text-center text-muted-foreground py-8">No phases</p>}
      </div>
    </div>
  );
}
