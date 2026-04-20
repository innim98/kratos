// Shared auth helpers

export function authenticateJwt(app) {
  return async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    try {
      request.user = app.jwt.verify(authHeader.slice(7));
      request.authType = 'user';
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  };
}

// Accepts JWT (user) OR agent token
export function authenticateAny(app) {
  return async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const token = authHeader.slice(7);

    // Try JWT first
    try {
      request.user = app.jwt.verify(token);
      request.authType = 'user';
      return;
    } catch {}

    // Try agent token
    const { db } = app;
    const agent = db.prepare('SELECT * FROM agents WHERE token = ?').get(token);
    if (agent) {
      request.agent = agent;
      request.authType = 'agent';
      return;
    }

    return reply.code(401).send({ error: 'Unauthorized' });
  };
}
