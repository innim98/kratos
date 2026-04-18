import fs from 'fs';
import path from 'path';
import os from 'os';
import { getTmuxSessions } from '../lib/tmux.js';

export default async function folderRoutes(app) {
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

  app.get('/api/folders', { preHandler: authenticate }, async (request, reply) => {
    const targetPath = request.query.path || os.homedir();

    if (!fs.existsSync(targetPath)) {
      return reply.code(400).send({ error: 'Path does not exist' });
    }

    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      return reply.code(400).send({ error: 'Path is not a directory' });
    }

    const entries = [];
    for (const name of fs.readdirSync(targetPath)) {
      if (name.startsWith('.')) continue;
      const fullPath = path.join(targetPath, name);
      try {
        if (fs.statSync(fullPath).isDirectory()) {
          entries.push({ name, path: fullPath });
        }
      } catch {
        // permission denied etc
      }
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    return {
      path: targetPath,
      parent: path.dirname(targetPath),
      entries,
    };
  });

  app.get('/api/tmux/sessions', { preHandler: authenticate }, async () => {
    const live = getTmuxSessions();
    const { db } = app;
    const registered = new Set(
      db.prepare('SELECT tmux_session FROM agents').all().map(r => r.tmux_session)
    );

    return Array.from(live.values()).map(s => ({
      name: s.name,
      activity: s.activity,
      registered: registered.has(s.name),
    }));
  });
}
