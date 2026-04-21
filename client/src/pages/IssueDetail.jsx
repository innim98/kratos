import { useState, useEffect, useRef } from 'react';
import { apiFetch, getToken } from '../lib/api.js';
import { Button } from '../components/ui/button.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { cn } from '../lib/utils.js';
import { ArrowLeft, Send, Reply, Paperclip, Image } from 'lucide-react';

const STATUSES = ['pending', 'todo', 'inprogress', 'verification', 'completed'];
const STATUS_COLORS = {
  pending: 'bg-muted text-muted-foreground',
  todo: 'bg-blue-600 text-white',
  inprogress: 'bg-yellow-600 text-white',
  verification: 'bg-purple-600 text-white',
  completed: 'bg-emerald-600 text-white',
};

export default function IssueDetail({ issueKey, onBack }) {
  const [issue, setIssue] = useState(null);
  const [commentBody, setCommentBody] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const load = () => {
    apiFetch(`/api/issues/${issueKey}`).then(r => r.json()).then(d => {
      if (d.id) setIssue(d);
    });
    apiFetch(`/api/issues/${issueKey}/attachments`).then(r => r.json()).then(d => {
      if (Array.isArray(d)) setAttachments(d);
    });
  };

  useEffect(load, [issueKey]);

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    const formData = new FormData();
    for (const f of files) formData.append('files', f);
    await fetch(`/api/issues/${issueKey}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    });
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    load();
  };

  const handleStatusChange = async (newStatus) => {
    await apiFetch(`/api/issues/${issueKey}`, { method: 'PUT', body: { status: newStatus } });
    load();
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    await apiFetch(`/api/issues/${issueKey}/comments`, {
      method: 'POST',
      body: { body: commentBody.trim(), parent_id: replyTo },
    });
    setCommentBody('');
    setReplyTo(null);
    load();
  };

  if (!issue) return <div className="p-4 text-muted-foreground">Loading...</div>;

  const topComments = issue.comments?.filter(c => !c.parent_id) || [];
  const replyMap = {};
  for (const c of issue.comments || []) {
    if (c.parent_id) {
      if (!replyMap[c.parent_id]) replyMap[c.parent_id] = [];
      replyMap[c.parent_id].push(c);
    }
  }

  return (
    <div className="max-w-3xl">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to issues
      </button>

      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-mono text-muted-foreground">{issueKey}</span>
          <Badge className={cn('text-xs', STATUS_COLORS[issue.status])}>{issue.status}</Badge>
        </div>
        <h2 className="text-xl font-semibold mb-2">{issue.title}</h2>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Reporter: {issue.reporter_name}</span>
          {issue.assignee_name && <span>Assignee: {issue.assignee_name}</span>}
          <span>{issue.created_at?.slice(0, 10)}</span>
        </div>
      </div>

      {/* Status buttons */}
      <div className="flex items-center gap-1 mb-4">
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => handleStatusChange(s)}
            className={cn(
              'px-2 py-1 rounded text-xs',
              s === issue.status ? STATUS_COLORS[s] : 'bg-secondary text-secondary-foreground hover:bg-accent'
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Description */}
      <div className="rounded-lg border border-border bg-card p-4 mb-6">
        <pre className="text-sm whitespace-pre-wrap break-words">{issue.description || '(no description)'}</pre>
      </div>

      {/* Attachments */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium flex items-center gap-1.5">
            <Paperclip className="h-4 w-4" /> Attachments ({attachments.length})
          </h3>
          <div>
            <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <Image className="h-3.5 w-3.5 mr-1" /> {uploading ? '...' : 'Attach'}
            </Button>
          </div>
        </div>
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map(a => (
              <a key={a.name} href={a.url} target="_blank" rel="noopener" className="block rounded border border-border overflow-hidden hover:border-accent/50">
                <img src={a.url} alt={a.name} className="h-24 w-auto object-cover" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Comments */}
      <h3 className="text-sm font-medium mb-3">Comments ({issue.comments?.length || 0})</h3>

      <div className="space-y-3 mb-4">
        {topComments.map(c => (
          <div key={c.id}>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">{c.author_name}
                  <span className="text-muted-foreground ml-1">({c.author_type})</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{c.created_at?.slice(0, 16).replace('T', ' ')}</span>
                  <button onClick={() => setReplyTo(c.id)} className="text-muted-foreground hover:text-foreground">
                    <Reply className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <pre className="text-sm whitespace-pre-wrap break-words">{c.body}</pre>
            </div>

            {/* Replies */}
            {(replyMap[c.id] || []).map(r => (
              <div key={r.id} className="ml-6 mt-1 rounded-lg border border-border bg-card/50 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{r.author_name}
                    <span className="text-muted-foreground ml-1">({r.author_type})</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground">{r.created_at?.slice(0, 16).replace('T', ' ')}</span>
                </div>
                <pre className="text-sm whitespace-pre-wrap break-words">{r.body}</pre>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Comment input */}
      <form onSubmit={handleComment} className="flex gap-2">
        <div className="flex-1">
          {replyTo && (
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-muted-foreground">Replying to comment</span>
              <button onClick={() => setReplyTo(null)} className="text-xs text-muted-foreground hover:text-foreground">cancel</button>
            </div>
          )}
          <textarea
            value={commentBody}
            onChange={e => setCommentBody(e.target.value)}
            placeholder="Add a comment..."
            className="w-full h-16 px-3 py-2 text-sm rounded-md border border-input bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </div>
        <Button type="submit" size="sm" className="self-end">
          <Send className="h-3.5 w-3.5" />
        </Button>
      </form>
    </div>
  );
}
