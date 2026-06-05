import { useState, useEffect, useRef } from 'react';
import { apiFetch, getToken } from '../lib/api.js';
import { cn } from '../lib/utils.js';
import { Plus, ArrowLeft, Send, RefreshCw, Reply } from 'lucide-react';

function formatChatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts.endsWith('Z') ? ts : ts + 'Z');
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (d.toDateString() !== now.toDateString()) {
    return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
  }
  return time;
}
import { Button } from './ui/button.jsx';
import { Input } from './ui/input.jsx';

function MessageBubble({ m, onReply }) {
  return (
    <div className="text-sm group">
      <div className="flex items-center gap-2">
        <span className={cn('font-medium text-xs', m.sender_type === 'agent' ? 'text-blue-400' : 'text-foreground')}>
          {m.sender_name}
        </span>
        <span className="text-[10px] text-muted-foreground">{formatChatTime(m.created_at)}</span>
        {onReply && (
          <button
            onClick={onReply}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
            title="Reply"
          >
            <Reply className="h-3 w-3" />
          </button>
        )}
      </div>
      <p className="text-sm whitespace-pre-wrap break-words mt-0.5">{m.body}</p>
    </div>
  );
}

export default function ChatPanel({ agentId }) {
  const [chats, setChats] = useState([]);
  const [agents, setAgents] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    apiFetch('/api/agents').then(r => r.json()).then(d => { if (Array.isArray(d)) setAgents(d); });
  }, []);

  const loadChats = () => {
    apiFetch('/api/chats').then(r => r.json()).then(d => { if (Array.isArray(d)) setChats(d); });
  };

  useEffect(loadChats, []);

  if (selectedChat) {
    return <ChatRoom chatId={selectedChat} agents={agents} onBack={() => { setSelectedChat(null); loadChats(); }} />;
  }

  if (showCreate) {
    return <CreateChat agents={agents} agentId={agentId} onCreated={(id) => { setShowCreate(false); setSelectedChat(id); loadChats(); }} onCancel={() => setShowCreate(false)} />;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-sm font-semibold">Chats</span>
        <Button size="sm" className="h-7 text-xs" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {chats.map(chat => (
          <button
            key={chat.id}
            onClick={() => setSelectedChat(chat.id)}
            className="flex flex-col w-full px-3 py-2.5 border-b border-border hover:bg-accent/50 text-left"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">#{chat.id} {chat.name}</span>
              <span className="text-[10px] text-muted-foreground">{chat.messageCount} msgs</span>
            </div>
            {chat.lastMessage && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {chat.lastMessage.sender_name}: {chat.lastMessage.body}
              </p>
            )}
            <div className="flex gap-1 mt-1">
              {chat.participants?.map(p => (
                <span key={`${p.participant_type}-${p.participant_id}`} className="text-[10px] px-1 py-0.5 rounded bg-secondary text-secondary-foreground">
                  {p.name}
                </span>
              ))}
            </div>
          </button>
        ))}
        {chats.length === 0 && <p className="text-center text-muted-foreground text-xs py-8">No chats</p>}
      </div>
    </div>
  );
}

function CreateChat({ agents, agentId, onCreated, onCancel }) {
  const [name, setName] = useState('');
  const [selectedAgents, setSelectedAgents] = useState(new Set(agentId ? [agentId] : []));

  const toggle = (id) => {
    setSelectedAgents(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await apiFetch('/api/chats', {
      method: 'POST',
      body: { name: name.trim(), agent_ids: [...selectedAgents] },
    });
    if (res.ok) {
      const data = await res.json();
      onCreated(data.id);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">New Chat</span>
      </div>
      <form onSubmit={handleCreate} className="flex-1 overflow-y-auto p-3 space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">Chat Name</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Chat name" autoFocus />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Agents</label>
          <div className="space-y-1 mt-1">
            {agents.map(a => (
              <label key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50 cursor-pointer text-sm">
                <input type="checkbox" checked={selectedAgents.has(a.id)} onChange={() => toggle(a.id)} />
                <span className={cn('h-2 w-2 rounded-full', a.status === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground/50')} />
                {a.name}
              </label>
            ))}
          </div>
        </div>
        <Button type="submit" size="sm" disabled={!name.trim() || selectedAgents.size === 0}>Create</Button>
      </form>
    </div>
  );
}

function ChatRoom({ chatId, agents, onBack }) {
  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const lastIdRef = useRef(0);

  const loadChat = () => {
    apiFetch(`/api/chats/${chatId}`).then(r => r.json()).then(d => { if (d.id) setChat(d); });
  };

  const loadMessages = () => {
    apiFetch(`/api/chats/${chatId}/messages`).then(r => r.json()).then(d => {
      if (Array.isArray(d)) {
        setMessages(d);
        if (d.length > 0) lastIdRef.current = d[d.length - 1].id;
      }
    });
  };

  useEffect(() => {
    loadChat();
    loadMessages();
  }, [chatId]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = getToken();
    if (!token) return;

    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/terminal?token=${encodeURIComponent(token)}`);

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.type === 'chat-message' && msg.chatId === chatId) {
        setMessages(prev => {
          if (prev.some(m => m.id === msg.message.id)) return prev;
          return [...prev, msg.message];
        });
        lastIdRef.current = Math.max(lastIdRef.current, msg.message.id);
      }
    };

    return () => { if (ws.readyState === WebSocket.OPEN) ws.close(); };
  }, [chatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    await apiFetch(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      body: { body: input.trim(), parent_id: replyTo?.id || null },
    });
    setInput('');
    setReplyTo(null);
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);
    // Check for @ mention
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const atMatch = before.match(/@(\w*)$/);
    if (atMatch) {
      setMentionOpen(true);
      setMentionFilter(atMatch[1].toLowerCase());
    } else {
      setMentionOpen(false);
    }
  };

  const insertMention = (name) => {
    const cursor = inputRef.current?.selectionStart || input.length;
    const before = input.slice(0, cursor);
    const after = input.slice(cursor);
    const atIdx = before.lastIndexOf('@');
    const newInput = before.slice(0, atIdx) + `@${name} ` + after;
    setInput(newInput);
    setMentionOpen(false);
    inputRef.current?.focus();
  };

  const handleResendInvite = async (agentId) => {
    await apiFetch(`/api/chats/${chatId}/invite/${agentId}`, { method: 'POST' });
  };

  const agentParticipants = chat?.participants?.filter(p => p.participant_type === 'agent') || [];
  const allParticipants = chat?.participants || [];

  // Build mention candidates
  const mentionCandidates = [{ name: 'all', type: 'special' }, ...allParticipants.map(p => ({ name: p.name, type: p.participant_type }))]
    .filter(p => !mentionFilter || p.name.toLowerCase().includes(mentionFilter));

  // Group messages: top-level + replies
  const topMessages = messages.filter(m => !m.parent_id);
  const replyMap = {};
  for (const m of messages) {
    if (m.parent_id) {
      if (!replyMap[m.parent_id]) replyMap[m.parent_id] = [];
      replyMap[m.parent_id].push(m);
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold">#{chatId} {chat?.name}</span>
        </div>
        {agentParticipants.length > 0 && (
          <div className="flex items-center gap-1 mt-1 ml-6 flex-wrap">
            {agentParticipants.map(p => (
              <span key={p.participant_id} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                {p.name}
                <button
                  onClick={() => handleResendInvite(p.participant_id)}
                  className="text-muted-foreground hover:text-foreground"
                  title="Resend invite"
                >
                  <RefreshCw className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {topMessages.map(m => (
          <div key={m.id}>
            <MessageBubble m={m} onReply={() => { setReplyTo(m); inputRef.current?.focus(); }} />
            {replyMap[m.id]?.map(r => (
              <div key={r.id} className="ml-4 mt-1 pl-2 border-l-2 border-border">
                <MessageBubble m={r} />
              </div>
            ))}
          </div>
        ))}
        <div ref={messagesEndRef} />
        {messages.length === 0 && <p className="text-center text-muted-foreground text-xs py-4">No messages yet</p>}
      </div>

      {/* Reply indicator */}
      {replyTo && (
        <div className="flex items-center gap-2 px-3 py-1 border-t border-border bg-card/50 text-xs text-muted-foreground shrink-0">
          <span>Replying to <strong>{replyTo.sender_name}</strong>: {replyTo.body.slice(0, 40)}</span>
          <button onClick={() => setReplyTo(null)} className="hover:text-foreground ml-auto">✕</button>
        </div>
      )}

      {/* Mention autocomplete */}
      {mentionOpen && mentionCandidates.length > 0 && (
        <div className="border-t border-border bg-card/95 max-h-32 overflow-y-auto shrink-0">
          {mentionCandidates.map(p => (
            <button
              key={p.name}
              onMouseDown={e => e.preventDefault()}
              onClick={() => insertMention(p.name)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent/50 text-left"
            >
              <span className={cn(p.type === 'agent' ? 'text-blue-400' : p.type === 'special' ? 'text-yellow-400' : 'text-foreground')}>@{p.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="flex items-center gap-1 px-2 py-1.5 border-t border-border shrink-0">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleInputChange}
          placeholder="Message... (@ to mention)"
          className="flex-1 min-w-0 h-7 px-2 text-sm bg-background border border-input rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button type="submit" className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90">
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
