import { authenticateAny } from '../lib/auth.js';
import { getIntSetting, setSetting, DEFAULT_MAX_AGENTS_PER_FOLDER } from '../lib/settings.js';

export default async function settingsRoutes(app) {
  const { db } = app;
  const auth = authenticateAny(app);

  const requireAdmin = async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    try {
      request.user = app.jwt.verify(authHeader.slice(7));
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    if (request.user.role !== 'admin') {
      return reply.code(403).send({ error: 'Admin required' });
    }
  };

  const readSettings = () => ({
    max_agents_per_folder: getIntSetting(db, 'max_agents_per_folder', DEFAULT_MAX_AGENTS_PER_FOLDER),
  });

  app.get('/api/settings', { preHandler: auth }, async () => readSettings());

  app.put('/api/settings', { preHandler: requireAdmin }, async (request, reply) => {
    const body = request.body || {};
    if ('max_agents_per_folder' in body) {
      const n = parseInt(body.max_agents_per_folder, 10);
      if (!Number.isInteger(n) || n < 1) {
        return reply.code(400).send({ error: 'max_agents_per_folder must be an integer >= 1' });
      }
      setSetting(db, 'max_agents_per_folder', n);
    }
    return readSettings();
  });
}
