import { useState, useEffect, useRef } from 'react';
import { apiFetch, getToken } from '../lib/api.js';
import { cn } from '../lib/utils.js';
import { Button } from './ui/button.jsx';
import { Folder, File, ChevronRight, ArrowLeft, Upload, Home } from 'lucide-react';

const CODE_EXTENSIONS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
  'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'fish',
  'css', 'scss', 'less', 'html', 'xml', 'svg', 'json', 'yaml', 'yml', 'toml',
  'md', 'txt', 'csv', 'sql', 'graphql', 'proto', 'env', 'ini', 'conf',
  'dockerfile', 'makefile', 'gitignore', 'editorconfig',
]);

function isViewable(name) {
  const lower = name.toLowerCase();
  if (CODE_EXTENSIONS.has(lower)) return true;
  return CODE_EXTENSIONS.has(lower.split('.').pop());
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilesPanel({ agentId }) {
  const [entries, setEntries] = useState([]);
  const [currentPath, setCurrentPath] = useState('');
  const [viewingFile, setViewingFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const loadDir = async (relPath) => {
    setLoading(true);
    const qs = relPath ? `?path=${encodeURIComponent(relPath)}` : '';
    const res = await apiFetch(`/api/agents/${agentId}/files${qs}`);
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries);
      setCurrentPath(data.relativePath);
    }
    setLoading(false);
  };

  useEffect(() => { loadDir(''); }, [agentId]);

  const handleNavigate = (entry) => {
    if (entry.type === 'directory') {
      const newPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      loadDir(newPath);
      setViewingFile(null);
    } else if (isViewable(entry.name)) {
      readFile(currentPath ? `${currentPath}/${entry.name}` : entry.name);
    }
  };

  const readFile = async (relPath) => {
    const res = await apiFetch(`/api/agents/${agentId}/files/read?path=${encodeURIComponent(relPath)}`);
    if (res.ok) setViewingFile(await res.json());
  };

  const handleGoUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/');
    parts.pop();
    loadDir(parts.join('/'));
    setViewingFile(null);
  };

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    const formData = new FormData();
    for (const file of files) formData.append('files', file);
    await fetch(`/api/agents/${agentId}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    });
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    loadDir(currentPath);
  };

  // Viewing a file — show viewer only (list collapsed)
  if (viewingFile) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card/50 shrink-0">
          <button onClick={() => setViewingFile(null)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-mono truncate flex-1">{viewingFile.path}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">{formatSize(viewingFile.size)}</span>
        </div>
        <pre className="flex-1 overflow-auto p-3 text-sm font-mono whitespace-pre-wrap break-words bg-background">
          {viewingFile.content}
        </pre>
      </div>
    );
  }

  // File list
  const segments = currentPath ? currentPath.split('/') : [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-border bg-card/50 shrink-0">
        <button onClick={() => { loadDir(''); setViewingFile(null); }} className="text-xs text-muted-foreground hover:text-foreground">
          <Home className="h-3.5 w-3.5" />
        </button>
        {segments.map((seg, i) => (
          <span key={i} className="flex items-center gap-0.5">
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <button onClick={() => loadDir(segments.slice(0, i + 1).join('/'))} className="text-[11px] text-muted-foreground hover:text-foreground truncate max-w-20">
              {seg}
            </button>
          </span>
        ))}
        <span className="flex-1" />
        <input ref={fileInputRef} type="file" multiple onChange={handleUpload} style={{ display: 'none' }} />
        <button onClick={() => fileInputRef.current?.click()} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1" disabled={uploading}>
          <Upload className="h-3 w-3" /> {uploading ? '...' : 'Upload'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {currentPath && (
          <button onClick={handleGoUp} className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 border-b border-border">
            <Folder className="h-3.5 w-3.5" /> ..
          </button>
        )}
        {entries.map(entry => (
          <button
            key={entry.name}
            onClick={() => handleNavigate(entry)}
            className="flex items-center justify-between w-full px-3 py-1.5 text-sm text-left hover:bg-accent/50 border-b border-border"
          >
            <div className="flex items-center gap-2 min-w-0">
              {entry.type === 'directory'
                ? <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                : <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              }
              <span className="truncate text-xs">{entry.name}</span>
            </div>
            {entry.type === 'file' && <span className="text-[10px] text-muted-foreground shrink-0 ml-1">{formatSize(entry.size)}</span>}
            {entry.type === 'directory' && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
          </button>
        ))}
        {entries.length === 0 && !loading && (
          <p className="text-xs text-muted-foreground p-3 text-center">Empty</p>
        )}
      </div>
    </div>
  );
}
