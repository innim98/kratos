import { authenticateAny } from '../lib/auth.js';

const VALID_STATUSES = ['active', 'draft', 'done', 'deprecated'];

export default async function phaseRoutes(app) {
  const { db } = app;
  const auth = authenticateAny(app);

  function getAgentName(id) {
    const a = db.prepare('SELECT name FROM agents WHERE id = ?').get(id);
    return a?.name || `agent#${id}`;
  }

  function enrichPhase(phase) {
    const docs = db.prepare('SELECT * FROM phase_documents WHERE phase_id = ? ORDER BY updated_at DESC').all(phase.id);
    return {
      ...phase,
      documents: docs.map(d => ({ ...d, agent_name: getAgentName(d.agent_id) })),
    };
  }

  // List phases by project
  app.get('/api/phases', { preHandler: auth }, async (request) => {
    const { project_code } = request.query;
    let sql = 'SELECT * FROM phases';
    const params = [];
    if (project_code) { sql += ' WHERE project_code = ?'; params.push(project_code); }
    sql += ' ORDER BY sort_order ASC, id ASC';
    return db.prepare(sql).all(...params).map(enrichPhase);
  });

  // Create phase
  app.post('/api/phases', { preHandler: auth }, async (request, reply) => {
    const { project_code, name, status } = request.body || {};
    if (!project_code || !name) return reply.code(400).send({ error: 'project_code and name required' });
    const s = (status && VALID_STATUSES.includes(status)) ? status : 'draft';

    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM phases WHERE project_code = ?').get(project_code)?.m || 0;
    const result = db.prepare(
      'INSERT INTO phases (project_code, name, status, sort_order) VALUES (?, ?, ?, ?)'
    ).run(project_code, name, s, maxOrder + 1);

    const phase = db.prepare('SELECT * FROM phases WHERE id = ?').get(result.lastInsertRowid);
    return enrichPhase(phase);
  });

  // Update phase
  app.put('/api/phases/:id', { preHandler: auth }, async (request, reply) => {
    const phase = db.prepare('SELECT * FROM phases WHERE id = ?').get(request.params.id);
    if (!phase) return reply.code(404).send({ error: 'Phase not found' });

    const { name, status, sort_order } = request.body || {};
    if (status && !VALID_STATUSES.includes(status)) return reply.code(400).send({ error: 'Invalid status' });

    db.prepare(`
      UPDATE phases SET
        name = COALESCE(?, name),
        status = COALESCE(?, status),
        sort_order = COALESCE(?, sort_order)
      WHERE id = ?
    `).run(name, status, sort_order, phase.id);

    const updated = db.prepare('SELECT * FROM phases WHERE id = ?').get(phase.id);
    return enrichPhase(updated);
  });

  // Delete phase
  app.delete('/api/phases/:id', { preHandler: auth }, async (request, reply) => {
    const phase = db.prepare('SELECT * FROM phases WHERE id = ?').get(request.params.id);
    if (!phase) return reply.code(404).send({ error: 'Phase not found' });
    db.prepare('DELETE FROM phases WHERE id = ?').run(phase.id);
    return { ok: true };
  });

  // --- Phase Documents ---

  // List documents for a phase
  app.get('/api/phases/:id/documents', { preHandler: auth }, async (request) => {
    const docs = db.prepare('SELECT * FROM phase_documents WHERE phase_id = ? ORDER BY updated_at DESC').all(request.params.id);
    return docs.map(d => ({ ...d, agent_name: getAgentName(d.agent_id) }));
  });

  // Register document (agent or user)
  app.post('/api/phases/:id/documents', { preHandler: auth }, async (request, reply) => {
    const phase = db.prepare('SELECT * FROM phases WHERE id = ?').get(request.params.id);
    if (!phase) return reply.code(404).send({ error: 'Phase not found' });

    const { title, doc_path, status, agent_id } = request.body || {};
    if (!title || !doc_path) return reply.code(400).send({ error: 'title and doc_path required' });
    const s = (status && VALID_STATUSES.includes(status)) ? status : 'draft';

    // Determine agent_id: from body, or from auth if agent token
    let effectiveAgentId = agent_id;
    if (!effectiveAgentId && request.authType === 'agent') {
      effectiveAgentId = request.agent.id;
    }
    if (!effectiveAgentId) return reply.code(400).send({ error: 'agent_id required' });

    try {
      const result = db.prepare(
        'INSERT INTO phase_documents (phase_id, agent_id, title, doc_path, status) VALUES (?, ?, ?, ?, ?)'
      ).run(phase.id, effectiveAgentId, title, doc_path, s);
      const doc = db.prepare('SELECT * FROM phase_documents WHERE id = ?').get(result.lastInsertRowid);
      return { ...doc, agent_name: getAgentName(doc.agent_id) };
    } catch {
      return reply.code(409).send({ error: 'Document already registered' });
    }
  });

  // Update document (status, doc_path, title)
  app.put('/api/phase-documents/:id', { preHandler: auth }, async (request, reply) => {
    const doc = db.prepare('SELECT * FROM phase_documents WHERE id = ?').get(request.params.id);
    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    const { title, doc_path, status } = request.body || {};
    if (status && !VALID_STATUSES.includes(status)) return reply.code(400).send({ error: 'Invalid status' });

    db.prepare(`
      UPDATE phase_documents SET
        title = COALESCE(?, title),
        doc_path = COALESCE(?, doc_path),
        status = COALESCE(?, status),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(title, doc_path, status, doc.id);

    const updated = db.prepare('SELECT * FROM phase_documents WHERE id = ?').get(doc.id);
    return { ...updated, agent_name: getAgentName(updated.agent_id) };
  });

  // Delete document
  app.delete('/api/phase-documents/:id', { preHandler: auth }, async (request, reply) => {
    const doc = db.prepare('SELECT * FROM phase_documents WHERE id = ?').get(request.params.id);
    if (!doc) return reply.code(404).send({ error: 'Document not found' });
    db.prepare('DELETE FROM phase_documents WHERE id = ?').run(doc.id);
    return { ok: true };
  });
}
