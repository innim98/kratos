import { execSync } from 'child_process';

export default async function terminalTextRoutes(app) {
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

  app.get('/api/agents/:id/terminal/text', { preHandler: authenticate }, async (request, reply) => {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(request.params.id);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });

    try {
      // -p: stdout, -S -: full scrollback, NO -e flag = no ANSI codes
      const text = execSync(
        `tmux capture-pane -t ${agent.tmux_session} -p -S -`,
        { encoding: 'utf8', timeout: 5000 }
      );
      return { text };
    } catch {
      return reply.code(400).send({ error: 'Cannot capture terminal text' });
    }
  });
}
