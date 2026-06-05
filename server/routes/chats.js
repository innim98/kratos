import { execSync } from 'child_process';
import { authenticateAny } from '../lib/auth.js';

export default async function chatRoutes(app) {
  const { db } = app;
  const auth = authenticateAny(app);

  function getSender(request) {
    if (request.authType === 'user') {
      const user = db.prepare('SELECT id FROM users WHERE username = ?').get(request.user.username);
      return { type: 'user', id: user?.id || 0, name: request.user.username };
    }
    return { type: 'agent', id: request.agent.id, name: request.agent.name };
  }

  function getParticipantName(type, id) {
    if (type === 'user') {
      const u = db.prepare('SELECT username FROM users WHERE id = ?').get(id);
      return u?.username || `user#${id}`;
    }
    const a = db.prepare('SELECT name FROM agents WHERE id = ?').get(id);
    return a?.name || `agent#${id}`;
  }

  function enrichChat(chat) {
    const participants = db.prepare('SELECT * FROM chat_participants WHERE chat_id = ?').all(chat.id);
    const lastMsg = db.prepare('SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY id DESC LIMIT 1').get(chat.id);
    const msgCount = db.prepare('SELECT COUNT(*) as c FROM chat_messages WHERE chat_id = ?').get(chat.id).c;
    return {
      ...chat,
      participants: participants.map(p => ({
        ...p,
        name: getParticipantName(p.participant_type, p.participant_id),
      })),
      lastMessage: lastMsg ? { ...lastMsg, sender_name: getParticipantName(lastMsg.sender_type, lastMsg.sender_id) } : null,
      messageCount: msgCount,
    };
  }

  function tmuxSendLines(session, lines) {
    for (const line of lines) {
      try {
        execSync(`tmux send-keys -t ${session} ${JSON.stringify(line)} Enter Enter`, { timeout: 3000 });
      } catch {}
    }
  }

  function notifyAgentTmux(agentId, chatId, senderName, preview) {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);
    if (!agent) return;
    tmuxSendLines(agent.tmux_session, [
      `# 💬 Kratos chat #${chatId} — ${senderName}: ${preview.slice(0, 80)}`,
    ]);
  }

  function sendInvite(agentId, chatId, chatName) {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);
    if (!agent) return;
    const port = process.env.PORT || 15001;
    tmuxSendLines(agent.tmux_session, [
      `# 💬 Kratos Chat #${chatId} "${chatName}" 에 초대되었습니다`,
      `# Token: ${agent.token}`,
      `# Guide: http://localhost:${port}/api/agents/${agentId}/guide`,
      `# 읽기: curl -s -H "Authorization: Bearer ${agent.token}" http://localhost:${port}/api/chats/${chatId}/messages | jq`,
      `# 쓰기: curl -s -X POST -H "Authorization: Bearer ${agent.token}" -H "Content-Type: application/json" -d '{"body":"hello"}' http://localhost:${port}/api/chats/${chatId}/messages | jq`,
    ]);
  }

  // Create chat
  app.post('/api/chats', { preHandler: auth }, async (request, reply) => {
    const { name, agent_ids } = request.body || {};
    if (!name) return reply.code(400).send({ error: 'name required' });

    const sender = getSender(request);

    const result = db.prepare(
      'INSERT INTO chats (name, created_by_type, created_by_id) VALUES (?, ?, ?)'
    ).run(name, sender.type, sender.id);

    const chatId = result.lastInsertRowid;

    // Add creator as participant
    db.prepare('INSERT INTO chat_participants (chat_id, participant_type, participant_id) VALUES (?, ?, ?)').run(chatId, sender.type, sender.id);

    // Add agents
    if (Array.isArray(agent_ids)) {
      for (const aid of agent_ids) {
        try {
          db.prepare('INSERT INTO chat_participants (chat_id, participant_type, participant_id) VALUES (?, ?, ?)').run(chatId, 'agent', aid);
        } catch {}
        sendInvite(aid, chatId, name);
      }
    }

    const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId);
    return enrichChat(chat);
  });

  // List my chats
  app.get('/api/chats', { preHandler: auth }, async (request) => {
    const sender = getSender(request);
    const chats = db.prepare(`
      SELECT c.* FROM chats c
      JOIN chat_participants cp ON cp.chat_id = c.id
      WHERE cp.participant_type = ? AND cp.participant_id = ?
      ORDER BY c.id DESC
    `).all(sender.type, sender.id);
    return chats.map(enrichChat);
  });

  // Get chat detail
  app.get('/api/chats/:id', { preHandler: auth }, async (request, reply) => {
    const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(request.params.id);
    if (!chat) return reply.code(404).send({ error: 'Chat not found' });
    return enrichChat(chat);
  });

  // Delete chat
  app.delete('/api/chats/:id', { preHandler: auth }, async (request, reply) => {
    const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(request.params.id);
    if (!chat) return reply.code(404).send({ error: 'Chat not found' });

    const sender = getSender(request);
    const isCreator = chat.created_by_type === sender.type && chat.created_by_id === sender.id;
    const isAdmin = request.authType === 'user' && request.user.role === 'admin';
    if (!isCreator && !isAdmin) return reply.code(403).send({ error: 'Only creator or admin can delete' });

    db.prepare('DELETE FROM chats WHERE id = ?').run(chat.id);
    return { ok: true };
  });

  // Resend invite to an agent
  app.post('/api/chats/:id/invite/:agentId', { preHandler: auth }, async (request, reply) => {
    const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(request.params.id);
    if (!chat) return reply.code(404).send({ error: 'Chat not found' });
    sendInvite(Number(request.params.agentId), chat.id, chat.name);
    return { ok: true };
  });

  // Get messages
  app.get('/api/chats/:id/messages', { preHandler: auth }, async (request) => {
    const chatId = request.params.id;
    const after = parseInt(request.query.after) || 0;
    const limit = Math.min(100, parseInt(request.query.limit) || 50);

    const messages = db.prepare(
      'SELECT * FROM chat_messages WHERE chat_id = ? AND id > ? ORDER BY id ASC LIMIT ?'
    ).all(chatId, after, limit);

    return messages.map(m => ({
      ...m,
      sender_name: getParticipantName(m.sender_type, m.sender_id),
    }));
  });

  // Post message
  app.post('/api/chats/:id/messages', { preHandler: auth }, async (request, reply) => {
    const chatId = Number(request.params.id);
    const { body, parent_id } = request.body || {};
    if (!body) return reply.code(400).send({ error: 'body required' });

    const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId);
    if (!chat) return reply.code(404).send({ error: 'Chat not found' });

    const sender = getSender(request);

    const result = db.prepare(
      'INSERT INTO chat_messages (chat_id, sender_type, sender_id, body, parent_id) VALUES (?, ?, ?, ?, ?)'
    ).run(chatId, sender.type, sender.id, body, parent_id || null);

    const msg = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(result.lastInsertRowid);
    const enrichedMsg = { ...msg, sender_name: sender.name };

    // WS broadcast to all connected clients
    const wsData = JSON.stringify({ type: 'chat-message', chatId, message: enrichedMsg });
    for (const client of app.websocketServer?.clients || []) {
      if (client.readyState === 1) {
        try { client.send(wsData); } catch {}
      }
    }

    // Parse @mentions and notify agents via tmux
    const mentions = body.match(/@[\w-]+/g) || [];
    const participants = db.prepare(
      "SELECT cp.*, a.name as agent_name FROM chat_participants cp JOIN agents a ON cp.participant_id = a.id WHERE cp.chat_id = ? AND cp.participant_type = 'agent'"
    ).all(chatId);

    const isAll = mentions.some(m => m.toLowerCase() === '@all');
    const mentionedNames = new Set(mentions.map(m => m.slice(1).toLowerCase()));

    for (const p of participants) {
      // Don't notify the sender
      if (sender.type === 'agent' && sender.id === p.participant_id) continue;

      if (isAll || mentionedNames.has(p.agent_name.toLowerCase())) {
        notifyAgentTmux(p.participant_id, chatId, sender.name, body);
      }
    }

    return enrichedMsg;
  });
}
