import { authenticateAny } from '../lib/auth.js';

export default async function todoRoutes(app) {
  const { db } = app;
  const auth = authenticateAny(app);

  app.get('/api/todos', { preHandler: auth }, async (request) => {
    const { agent_id, status } = request.query;
    let sql = 'SELECT * FROM todos';
    const conditions = [];
    const params = [];

    if (agent_id) { conditions.push('agent_id = ?'); params.push(agent_id); }
    if (status) { conditions.push('status = ?'); params.push(status); }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY priority DESC, created_at DESC';

    return db.prepare(sql).all(...params);
  });

  app.post('/api/todos', { preHandler: auth }, async (request, reply) => {
    const { title, description, description_md_path, priority, due_date, agent_id } = request.body || {};

    if (!title) return reply.code(400).send({ error: 'title is required' });

    const createdByType = request.authType;
    const createdById = request.authType === 'user'
      ? db.prepare('SELECT id FROM users WHERE username = ?').get(request.user.username)?.id || 0
      : request.agent.id;

    // If agent creates, auto-bind to itself unless specified
    const boundAgentId = agent_id || (request.authType === 'agent' ? request.agent.id : null);

    const result = db.prepare(`
      INSERT INTO todos (title, description, description_md_path, priority, due_date, agent_id, created_by_type, created_by_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title,
      description || '',
      description_md_path || null,
      priority || 3,
      due_date || null,
      boundAgentId,
      createdByType,
      createdById,
    );

    return db.prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid);
  });

  app.put('/api/todos/:id', { preHandler: auth }, async (request, reply) => {
    const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(request.params.id);
    if (!todo) return reply.code(404).send({ error: 'Todo not found' });

    const { title, description, description_md_path, priority, status, due_date, agent_id } = request.body || {};

    // Permission check: agents can only modify their own todos
    if (request.authType === 'agent') {
      if (todo.created_by_type === 'user') {
        return reply.code(403).send({ error: 'Agents cannot modify user-created todos' });
      }
      if (todo.created_by_id !== request.agent.id) {
        return reply.code(403).send({ error: 'Agents can only modify their own todos' });
      }
    }

    db.prepare(`
      UPDATE todos SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        description_md_path = COALESCE(?, description_md_path),
        priority = COALESCE(?, priority),
        status = COALESCE(?, status),
        due_date = COALESCE(?, due_date),
        agent_id = COALESCE(?, agent_id),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(title, description, description_md_path, priority, status, due_date, agent_id, request.params.id);

    return db.prepare('SELECT * FROM todos WHERE id = ?').get(request.params.id);
  });

  app.delete('/api/todos/:id', { preHandler: auth }, async (request, reply) => {
    const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(request.params.id);
    if (!todo) return reply.code(404).send({ error: 'Todo not found' });

    // Agents can only delete their own
    if (request.authType === 'agent' && (todo.created_by_type !== 'agent' || todo.created_by_id !== request.agent.id)) {
      return reply.code(403).send({ error: 'Cannot delete this todo' });
    }

    db.prepare('DELETE FROM todos WHERE id = ?').run(request.params.id);
    return { ok: true };
  });
}
