import { useState, useRef } from 'react';
import { getToken } from '../lib/api.js';
import { cn, copyText } from '../lib/utils.js';
import { Upload, Check, Copy, CornerDownLeft } from 'lucide-react';

function formatEta(seconds) {
  if (!seconds || !isFinite(seconds)) return '';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
}

export default function UploadForAgent({ agentId, onSendToTerminal }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0); // 0-100
  const [eta, setEta] = useState('');
  const [uploadedPath, setUploadedPath] = useState(null);
  const [copied, setCopied] = useState(false);
  const startTimeRef = useRef(0);

  const handleUpload = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadedPath(null);
    setProgress(0);
    setEta('');
    startTimeRef.current = Date.now();

    const formData = new FormData();
    for (const f of files) formData.append('files', f);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/agents/${agentId}/upload`);
    xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        const pct = Math.round((ev.loaded / ev.total) * 100);
        setProgress(pct);
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        if (pct > 0) {
          const remaining = (elapsed / pct) * (100 - pct);
          setEta(formatEta(remaining));
        }
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.files?.length > 0) {
            const p = data.files.length === 1 ? data.files[0].path : data.uploadDir;
            setUploadedPath(p);
          }
        } catch {}
      }
      setUploading(false);
      setProgress(0);
      setEta('');
      if (fileRef.current) fileRef.current.value = '';
    };

    xhr.onerror = () => {
      setUploading(false);
      setProgress(0);
      setEta('');
      if (fileRef.current) fileRef.current.value = '';
    };

    xhr.send(formData);
  };

  const handleCopy = () => {
    if (!uploadedPath) return;
    copyText(uploadedPath).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <>
      <input ref={fileRef} type="file" multiple onChange={handleUpload} style={{ display: 'none' }} />
      <button
        onClick={() => fileRef.current?.click()}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        disabled={uploading}
        title="Upload to tmp/kratos/"
      >
        <Upload className="h-3.5 w-3.5" />
        {uploading ? `${progress}%${eta ? ' ' + eta : ''}` : 'up4agent'}
      </button>
      {uploadedPath && (
        <>
          <button
            onClick={handleCopy}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
              copied ? 'text-emerald-500 bg-emerald-500/10' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            )}
            title={uploadedPath}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            <span className="max-w-28 truncate hidden sm:inline">{uploadedPath.split('/').pop()}</span>
          </button>
          {onSendToTerminal && (
            <button
              onClick={() => onSendToTerminal(uploadedPath)}
              className="flex items-center px-1.5 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              title="Send path to terminal"
            >
              <CornerDownLeft className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      )}
    </>
  );
}
