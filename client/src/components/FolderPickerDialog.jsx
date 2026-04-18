import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog.jsx';
import { Button } from './ui/button.jsx';
import { Input } from './ui/input.jsx';
import { cn } from '../lib/utils.js';
import { Folder, FolderOpen, ChevronRight, ChevronDown } from 'lucide-react';

function TreeNode({ entry, depth, selectedPath, onSelect, onToggle, expandedPaths, childrenMap }) {
  const isExpanded = expandedPaths.has(entry.path);
  const isSelected = selectedPath === entry.path;
  const children = childrenMap.get(entry.path);

  const handleToggle = (e) => {
    e.stopPropagation();
    onToggle(entry.path);
  };

  return (
    <div>
      <button
        onClick={() => onSelect(entry)}
        className={cn(
          'flex items-center gap-1 w-full text-sm text-left py-1.5 px-2 rounded-sm hover:bg-accent/50',
          isSelected && 'bg-accent text-accent-foreground'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <span onClick={handleToggle} className="flex items-center justify-center w-4 h-4 shrink-0 text-muted-foreground hover:text-foreground">
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
        {isExpanded
          ? <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
          : <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
        }
        <span className="truncate">{entry.name}</span>
      </button>

      {isExpanded && children && (
        <div>
          {children.length === 0 && (
            <span className="text-xs text-muted-foreground block" style={{ paddingLeft: `${(depth + 1) * 16 + 28}px` }}>
              (empty)
            </span>
          )}
          {children.map(child => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onToggle={onToggle}
              expandedPaths={expandedPaths}
              childrenMap={childrenMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FolderPickerDialog({ open, onOpenChange, onCreated }) {
  const [rootEntries, setRootEntries] = useState([]);
  const [rootPath, setRootPath] = useState('');
  const [childrenMap, setChildrenMap] = useState(new Map());
  const [expandedPaths, setExpandedPaths] = useState(new Set());
  const [selectedPath, setSelectedPath] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadChildren = useCallback(async (dirPath) => {
    const url = `/api/folders?path=${encodeURIComponent(dirPath)}`;
    const res = await apiFetch(url);
    if (res.ok) {
      const data = await res.json();
      setChildrenMap(prev => {
        const next = new Map(prev);
        next.set(dirPath, data.entries);
        return next;
      });
      return data;
    }
    return null;
  }, []);

  useEffect(() => {
    if (open) {
      setSelectedPath('');
      setName('');
      setError('');
      setExpandedPaths(new Set());
      setChildrenMap(new Map());

      apiFetch('/api/folders').then(r => r.json()).then(data => {
        setRootPath(data.path);
        setRootEntries(data.entries);
      });
    }
  }, [open]);

  const handleToggle = async (dirPath) => {
    const next = new Set(expandedPaths);
    if (next.has(dirPath)) {
      next.delete(dirPath);
    } else {
      next.add(dirPath);
      if (!childrenMap.has(dirPath)) {
        await loadChildren(dirPath);
      }
    }
    setExpandedPaths(next);
  };

  const handleSelect = (entry) => {
    setSelectedPath(entry.path);
    setName(entry.name);
    // auto-expand on select
    if (!expandedPaths.has(entry.path)) {
      handleToggle(entry.path);
    }
  };

  const handleCreate = async () => {
    if (!name || !selectedPath) return;
    setLoading(true);
    setError('');
    const res = await apiFetch('/api/agents', {
      method: 'POST',
      body: { name, folder: selectedPath },
    });
    setLoading(false);
    if (res.ok) {
      onOpenChange(false);
      onCreated();
    } else {
      const data = await res.json();
      setError(data.error || 'Failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Agent from Folder</DialogTitle>
          <DialogDescription>Browse and select a project folder</DialogDescription>
        </DialogHeader>

        <div className="text-xs text-muted-foreground font-mono bg-muted/50 rounded-md px-3 py-1.5 truncate">
          {rootPath}
        </div>

        <div className="border border-border rounded-md max-h-72 overflow-y-auto py-1">
          {rootEntries.length === 0 && (
            <p className="text-sm text-muted-foreground p-4 text-center">No subdirectories</p>
          )}
          {rootEntries.map(entry => (
            <TreeNode
              key={entry.path}
              entry={entry}
              depth={0}
              selectedPath={selectedPath}
              onSelect={handleSelect}
              onToggle={handleToggle}
              expandedPaths={expandedPaths}
              childrenMap={childrenMap}
            />
          ))}
        </div>

        {selectedPath && (
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Agent name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="agent-name" />
            <p className="text-xs text-muted-foreground font-mono truncate">{selectedPath}</p>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!name || !selectedPath || loading}>
            {loading ? 'Creating...' : 'Create Agent'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
