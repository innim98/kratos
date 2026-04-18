import bcrypt from 'bcryptjs';

export default async function userRoutes(app) {
  const { db } = app;

  // Auth hook for all routes in this plugin
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

  // --- Profile ---

  app.put('/api/me', { preHandler: authenticate }, async (request, reply) => {
    const { username, currentPassword, newPassword } = request.body || {};
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(request.user.username);

    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    if (newPassword) {
      if (!currentPassword) {
        return reply.code(400).send({ error: 'Current password required to change password' });
      }
      if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
        return reply.code(401).send({ error: 'Current password is incorrect' });
      }
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
        bcrypt.hashSync(newPassword, 10), user.id
      );
    }

    const finalUsername = username || user.username;
    if (username && username !== user.username) {
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, user.id);
    }

    const token = app.jwt.sign({ username: finalUsername, role: user.role });
    return { ok: true, token };
  });

  // --- Admin user management ---

  app.get('/api/users', { preHandler: requireAdmin }, async () => {
    return db.prepare('SELECT id, username, role FROM users ORDER BY id').all();
  });

  app.post('/api/users', { preHandler: requireAdmin }, async (request, reply) => {
    const { username, password } = request.body || {};
    if (!username || !password) {
      return reply.code(400).send({ error: 'Username and password required' });
    }

    const hash = bcrypt.hashSync(password, 10);
    try {
      const result = db.prepare(
        'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)'
      ).run(username, hash, 'user');
      return { id: result.lastInsertRowid, username, role: 'user' };
    } catch {
      return reply.code(409).send({ error: 'Username already exists' });
    }
  });

  app.delete('/api/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params;
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

    if (!target) {
      return reply.code(404).send({ error: 'User not found' });
    }
    if (target.username === request.user.username) {
      return reply.code(400).send({ error: 'Cannot delete yourself' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return { ok: true };
  });
}
