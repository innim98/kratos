import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { pipeline } from 'stream/promises';

function getTmuxCwd(sessionName) {
  try {
    return execSync(
      `tmux display-message -t ${sessionName} -p '#{pane_current_path}'`,
      { encoding: 'utf8', timeout: 5000 }
    ).trim();
  } catch {
    return null;
  }
}

export default async function uploadRoutes(app) {
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

  app.post('/api/agents/:id/upload', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params;
    const { db } = app;

    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' });
    }

    const cwd = getTmuxCwd(agent.tmux_session);
    if (!cwd) {
      return reply.code(400).send({ error: 'Cannot determine agent working directory' });
    }

    const uploadDir = path.join(cwd, 'tmp', 'kratos');
    fs.mkdirSync(uploadDir, { recursive: true });

    const uploaded = [];
    const parts = request.parts();

    for await (const part of parts) {
      if (part.type === 'file') {
        const safeName = path.basename(part.filename);
        const dest = path.join(uploadDir, safeName);
        await pipeline(part.file, fs.createWriteStream(dest));
        uploaded.push({ name: safeName, path: dest, size: fs.statSync(dest).size });
      }
    }

    return { files: uploaded, uploadDir };
  });
}
