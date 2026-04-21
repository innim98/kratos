import { authenticateAny } from '../lib/auth.js';
import { exportIssue } from '../lib/issue-export.js';

export default async function issueRoutes(app) {
  const { db } = app;
  const auth = authenticateAny(app);

  function getReporter(request) {
    if (request.authType === 'user') {
      const user = db.prepare('SELECT id FROM users WHERE username = ?').get(request.user.username);
      return { type: 'user', id: user?.id || 0 };
    }
    return { type: 'agent', id: request.agent.id };
  }

  function getAuthorName(type, id) {
    if (type === 'user') return db.prepare('SELECT username FROM users WHERE id = ?').get(id)?.username || 'unknown';
    return db.prepare('SELECT name FROM agents WHERE id = ?').get(id)?.name || 'unknown';
  }

  function enrichIssue(issue) {
    return {
      ...issue,
      reporter_name: getAuthorName(issue.reporter_type, issue.reporter_id),
      assignee_name: issue.assignee_agent_id
        ? db.prepare('SELECT name FROM agents WHERE id = ?').get(issue.assignee_agent_id)?.name || null
        : null,
    };
  }

  // List issues
  app.get('/api/issues', { preHandler: auth }, async (request) => {
    const { project_code, status, assignee_agent_id } = request.query;
    let sql = 'SELECT * FROM issues';
    const conditions = [];
    const params = [];

    if (project_code) { conditions.push('project_code = ?'); params.push(project_code); }
    if (status) { conditions.push('status = ?'); params.push(status); }
    if (assignee_agent_id) { conditions.push('assignee_agent_id = ?'); params.push(assignee_agent_id); }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY priority DESC, created_at DESC';

    return db.prepare(sql).all(...params).map(enrichIssue);
  });

  // Get single issue with comments
  app.get('/api/issues/:key', { preHandler: auth }, async (request, reply) => {
    const [code, numStr] = request.params.key.split('-');
    const num = parseInt(numStr, 10);
    if (!code || isNaN(num)) return reply.code(400).send({ error: 'Invalid issue key (e.g. HT-1)' });

    const issue = db.prepare('SELECT * FROM issues WHERE project_code = ? AND issue_number = ?').get(code.toUpperCase(), num);
    if (!issue) return reply.code(404).send({ error: 'Issue not found' });

    const comments = db.prepare('SELECT * FROM comments WHERE issue_id = ? ORDER BY created_at').all(issue.id);
    const enrichedComments = comments.map(c => ({
      ...c,
      author_name: getAuthorName(c.author_type, c.author_id),
    }));

    return { ...enrichIssue(issue), comments: enrichedComments };
  });

  // Create issue
  app.post('/api/issues', { preHandler: auth }, async (request, reply) => {
    const { project_code, title, description, priority, assignee_agent_id } = request.body || {};
    if (!project_code || !title) return reply.code(400).send({ error: 'project_code and title required' });

    const project = db.prepare('SELECT * FROM projects WHERE code = ?').get(project_code.toUpperCase());
    if (!project) return reply.code(404).send({ error: 'Project not found' });

    const reporter = getReporter(request);

    // Get next issue number
    const last = db.prepare('SELECT MAX(issue_number) as max FROM issues WHERE project_code = ?').get(project.code);
    const issueNumber = (last?.max || 0) + 1;

    const result = db.prepare(`
      INSERT INTO issues (project_code, issue_number, title, description, priority, reporter_type, reporter_id, assignee_agent_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(project.code, issueNumber, title, description || '', priority || 3, reporter.type, reporter.id, assignee_agent_id || null);

    const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(result.lastInsertRowid);
    exportIssue(db, issue);
    return enrichIssue(issue);
  });

  // Update issue
  app.put('/api/issues/:key', { preHandler: auth }, async (request, reply) => {
    const [code, numStr] = request.params.key.split('-');
    const num = parseInt(numStr, 10);
    const issue = db.prepare('SELECT * FROM issues WHERE project_code = ? AND issue_number = ?').get(code?.toUpperCase(), num);
    if (!issue) return reply.code(404).send({ error: 'Issue not found' });

    const { title, description, status, priority, assignee_agent_id } = request.body || {};

    // Agents can only set completed on their own issues
    if (request.authType === 'agent' && status === 'completed') {
      if (issue.reporter_type !== 'agent' || issue.reporter_id !== request.agent.id) {
        return reply.code(403).send({ error: 'Agents can only complete their own reported issues' });
      }
    }

    db.prepare(`
      UPDATE issues SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        status = COALESCE(?, status),
        priority = COALESCE(?, priority),
        assignee_agent_id = COALESCE(?, assignee_agent_id),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(title, description, status, priority, assignee_agent_id, issue.id);

    const updated = db.prepare('SELECT * FROM issues WHERE id = ?').get(issue.id);
    exportIssue(db, updated);
    return enrichIssue(updated);
  });

  // Add comment
  app.post('/api/issues/:key/comments', { preHandler: auth }, async (request, reply) => {
    const [code, numStr] = request.params.key.split('-');
    const num = parseInt(numStr, 10);
    const issue = db.prepare('SELECT * FROM issues WHERE project_code = ? AND issue_number = ?').get(code?.toUpperCase(), num);
    if (!issue) return reply.code(404).send({ error: 'Issue not found' });

    const { body, parent_id } = request.body || {};
    if (!body) return reply.code(400).send({ error: 'body required' });

    const author = getReporter(request);

    const result = db.prepare(
      'INSERT INTO comments (issue_id, parent_id, body, author_type, author_id) VALUES (?, ?, ?, ?, ?)'
    ).run(issue.id, parent_id || null, body, author.type, author.id);

    // Update issue timestamp + export
    db.prepare("UPDATE issues SET updated_at = datetime('now') WHERE id = ?").run(issue.id);
    const updatedIssue = db.prepare('SELECT * FROM issues WHERE id = ?').get(issue.id);
    exportIssue(db, updatedIssue);

    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(result.lastInsertRowid);
    return { ...comment, author_name: getAuthorName(comment.author_type, comment.author_id) };
  });

  // Edit comment
  app.put('/api/comments/:id', { preHandler: auth }, async (request, reply) => {
    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(request.params.id);
    if (!comment) return reply.code(404).send({ error: 'Comment not found' });

    // Only author can edit
    const isAuthor = request.authType === comment.author_type &&
      (request.authType === 'agent' ? request.agent.id === comment.author_id :
        db.prepare('SELECT id FROM users WHERE username = ?').get(request.user.username)?.id === comment.author_id);

    if (!isAuthor) return reply.code(403).send({ error: 'Only author can edit' });

    const { body } = request.body || {};
    if (!body) return reply.code(400).send({ error: 'body required' });

    db.prepare('UPDATE comments SET body = ? WHERE id = ?').run(body, comment.id);

    // Re-export
    const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(comment.issue_id);
    if (issue) exportIssue(db, issue);

    return db.prepare('SELECT * FROM comments WHERE id = ?').get(comment.id);
  });

  // Delete comment
  app.delete('/api/comments/:id', { preHandler: auth }, async (request, reply) => {
    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(request.params.id);
    if (!comment) return reply.code(404).send({ error: 'Comment not found' });

    const isAuthor = request.authType === comment.author_type &&
      (request.authType === 'agent' ? request.agent.id === comment.author_id :
        db.prepare('SELECT id FROM users WHERE username = ?').get(request.user.username)?.id === comment.author_id);

    if (!isAuthor) return reply.code(403).send({ error: 'Only author can delete' });

    const issueId = comment.issue_id;
    db.prepare('DELETE FROM comments WHERE id = ?').run(comment.id);

    const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId);
    if (issue) exportIssue(db, issue);

    return { ok: true };
  });
}
