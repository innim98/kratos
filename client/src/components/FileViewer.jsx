import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { cn, copyText } from '../lib/utils.js';
import { FileText, Image, X, Check } from 'lucide-react';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileViewer({ agentId, file, onClose }) {
  const [content, setContent] = useState(null);
  const [size, setSize] = useState(0);
  const [absolutePath, setAbsolutePath] = useState('');
  const [copied, setCopied] = useState(null); // null | 'path' | line number

  useEffect(() => {
    if (!file || file.isImage) {
      setContent(null);
      setAbsolutePath('');
      return;
    }
    apiFetch(`/api/agents/${agentId}/files/read?path=${encodeURIComponent(file.path)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setContent(data.content);
          setSize(data.size);
          setAbsolutePath(data.absolutePath || data.path);
        }
      });
  }, [agentId, file?.path]);

  const copyToClipboard = useCallback((text, key) => {
    copyText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }, []);

  if (!file) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <FileText className="h-5 w-5 mr-2 opacity-50" />
        Select a file to view
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card/50 shrink-0">
        <button
          onClick={() => copyToClipboard(absolutePath || file.path, 'path')}
          className="text-xs font-mono truncate flex-1 text-left hover:text-foreground transition-colors"
          title="Copy path"
        >
          {copied === 'path' ? <span className="inline-flex items-center gap-1 text-emerald-500"><Check className="h-3 w-3" />Copied</span> : (absolutePath || file.path)}
        </button>
        {!file.isImage && size > 0 && (
          <span className="text-[10px] text-muted-foreground shrink-0">{formatSize(size)}</span>
        )}
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {file.isImage ? (
        <div
          className="flex-1 overflow-auto flex items-center justify-center p-4"
          style={{ background: 'repeating-conic-gradient(hsl(var(--muted)) 0% 25%, hsl(var(--background)) 0% 50%) 50% / 16px 16px' }}
        >
          <img src={file.url} alt={file.name} className="max-w-full max-h-full object-contain" />
        </div>
      ) : content == null ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Loading...</div>
      ) : (
        <div className="flex-1 overflow-auto bg-background">
          <table className="text-sm font-mono border-collapse w-full">
            <tbody>
              {content.split('\n').map((line, i) => (
                <tr key={i} className="hover:bg-accent/30">
                  <td
                    onClick={() => copyToClipboard(`${absolutePath || file.path}:${i + 1}`, i + 1)}
                    className={cn(
                      'sticky left-0 select-none text-right pr-3 pl-2 text-xs bg-background border-r border-border cursor-pointer hover:text-foreground transition-colors',
                      copied === i + 1 ? 'text-emerald-500' : 'text-muted-foreground/50'
                    )}
                    style={{ minWidth: '3rem' }}
                    title={`Copy ${file.path}:${i + 1}`}
                  >
                    {i + 1}
                  </td>
                  <td className="pl-3 pr-2 whitespace-pre-wrap break-words">{line || '\u200b'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
