import bcrypt from 'bcryptjs';

export default async function authRoutes(app) {
  const { db } = app;

  app.post('/api/register', async (request, reply) => {
    const { username, password } = request.body || {};

    if (!username || !password) {
      return reply.code(400).send({ error: 'Username and password required.' });
    }
    if (password.length < 4) {
      return reply.code(400).send({ error: 'Password must be at least 4 characters.' });
    }

    const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    if (count > 0) {
      return reply.code(403).send({ error: 'Registration closed. Use admin to add users.' });
    }

    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(
      username, hash, 'admin'
    );

    const token = app.jwt.sign({ username, role: 'admin' });
    return { token };
  });

  app.post('/api/login', async (request, reply) => {
    const { username, password } = request.body || {};

    if (!username || !password) {
      return reply.code(400).send({ error: 'Username and password required.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return reply.code(401).send({ error: 'Invalid credentials.' });
    }

    const token = app.jwt.sign({ username: user.username, role: user.role });
    return { token };
  });

  app.get('/api/verify', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ valid: false });
    }

    try {
      const decoded = app.jwt.verify(authHeader.slice(7));
      return { valid: true, username: decoded.username, role: decoded.role };
    } catch {
      return reply.code(401).send({ valid: false });
    }
  });
}
