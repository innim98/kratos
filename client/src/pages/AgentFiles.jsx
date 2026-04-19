import { useState, useEffect, useRef } from 'react';
import { apiFetch, getToken } from '../lib/api.js';
import { Button } from '../components/ui/button.jsx';
import { cn } from '../lib/utils.js';
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
  const ext = lower.split('.').pop();
  return CODE_EXTENSIONS.has(ext);
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AgentFiles({ agentId, onBack }) {
  const [entries, setEntries] = useState([]);
  const [currentPath, setCurrentPath] = useState('');
  const [rootPath, setRootPath] = useState('');
  const [viewingFile, setViewingFile] = useState(null); // { name, content, path }
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
      setRootPath(data.root);
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
    if (res.ok) {
      const data = await res.json();
      setViewingFile(data);
    }
  };

  const handleGoUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/');
    parts.pop();
    const parent = parts.join('/');
    loadDir(parent);
    setViewingFile(null);
  };

  const handleGoRoot = () => {
    loadDir('');
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

  // Breadcrumb segments
  const segments = currentPath ? currentPath.split('/') : [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <Button variant="ghost" size="sm" className="h-7" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="w-px h-4 bg-border" />

        {/* Breadcrumb */}
        <button onClick={handleGoRoot} className="text-xs text-muted-foreground hover:text-foreground">
          <Home className="h-3.5 w-3.5" />
        </button>
        {segments.map((seg, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <button
              onClick={() => loadDir(segments.slice(0, i + 1).join('/'))}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {seg}
            </button>
          </span>
        ))}

        <span className="flex-1" />
        <input ref={fileInputRef} type="file" multiple onChange={handleUpload} style={{ display: 'none' }} />
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload className="h-3.5 w-3.5 mr-1" /> {uploading ? '...' : 'Upload to this folder'}
        </Button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* File list */}
        <div className={cn('border-r border-border overflow-y-auto', viewingFile ? 'w-64 min-w-64' : 'flex-1')}>
          {currentPath && (
            <button
              onClick={handleGoUp}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 border-b border-border"
            >
              <Folder className="h-4 w-4" /> ..
            </button>
          )}
          {entries.map(entry => (
            <button
              key={entry.name}
              onClick={() => handleNavigate(entry)}
              className={cn(
                'flex items-center justify-between w-full px-3 py-2 text-sm text-left hover:bg-accent/50 border-b border-border',
                viewingFile?.name === entry.name && 'bg-accent text-accent-foreground'
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                {entry.type === 'directory'
                  ? <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                  : <File className="h-4 w-4 text-muted-foreground shrink-0" />
                }
                <span className="truncate">{entry.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {entry.type === 'file' && (
                  <span className="text-[10px] text-muted-foreground">{formatSize(entry.size)}</span>
                )}
                {entry.type === 'directory' && (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
            </button>
          ))}
          {entries.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground p-4 text-center">Empty directory</p>
          )}
        </div>

        {/* File viewer */}
        {viewingFile && (
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card/50 shrink-0">
              <span className="text-sm font-mono truncate">{viewingFile.path}</span>
              <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{formatSize(viewingFile.size)}</span>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-sm font-mono whitespace-pre-wrap break-words bg-background">
              {viewingFile.content}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
