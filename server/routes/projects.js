export default async function projectRoutes(app) {
  const { db } = app;

  const authenticate = async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    try {
      request.user = app.jwt.verify(authHeader.slice(7));
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  };

  const requireAdmin = async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;
    if (request.user.role !== 'admin') {
      return reply.code(403).send({ error: 'Admin required' });
    }
  };

  app.get('/api/projects', { preHandler: authenticate }, async () => {
    return db.prepare('SELECT * FROM projects ORDER BY code').all();
  });

  app.post('/api/projects', { preHandler: requireAdmin }, async (request, reply) => {
    const { code, name, folder } = request.body || {};
    if (!code || !name || !folder) {
      return reply.code(400).send({ error: 'code, name, and folder required' });
    }
    try {
      db.prepare('INSERT INTO projects (code, name, folder) VALUES (?, ?, ?)').run(code.toUpperCase(), name, folder);
      return db.prepare('SELECT * FROM projects WHERE code = ?').get(code.toUpperCase());
    } catch {
      return reply.code(409).send({ error: 'Project code already exists' });
    }
  });

  app.put('/api/projects/:code', { preHandler: requireAdmin }, async (request, reply) => {
    const { name, folder } = request.body || {};
    const project = db.prepare('SELECT * FROM projects WHERE code = ?').get(request.params.code);
    if (!project) return reply.code(404).send({ error: 'Project not found' });

    db.prepare('UPDATE projects SET name = COALESCE(?, name), folder = COALESCE(?, folder) WHERE code = ?')
      .run(name, folder, request.params.code);
    return db.prepare('SELECT * FROM projects WHERE code = ?').get(request.params.code);
  });

  app.delete('/api/projects/:code', { preHandler: requireAdmin }, async (request, reply) => {
    const project = db.prepare('SELECT * FROM projects WHERE code = ?').get(request.params.code);
    if (!project) return reply.code(404).send({ error: 'Project not found' });

    db.prepare('DELETE FROM projects WHERE code = ?').run(request.params.code);
    return { ok: true };
  });
}
