import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

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

export default async function filesRoutes(app) {
  const { db } = app;

  const authenticate = async (request, reply) => {
    let token;
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (request.query.token) {
      token = request.query.token;
    }
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });
    try {
      request.user = app.jwt.verify(token);
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  };

  function resolveAgentPath(agent, relPath) {
    const cwd = getTmuxCwd(agent.tmux_session);
    if (!cwd) return null;

    const resolved = relPath ? path.resolve(cwd, relPath) : cwd;

    // Prevent path traversal outside agent cwd
    if (!resolved.startsWith(cwd)) return null;

    return { cwd, resolved };
  }

  app.get('/api/agents/:id/files', { preHandler: authenticate }, async (request, reply) => {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(request.params.id);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });

    const relPath = request.query.path || '';
    const result = resolveAgentPath(agent, relPath);
    if (!result) return reply.code(400).send({ error: 'Invalid path' });

    const { cwd, resolved } = result;

    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      return reply.code(400).send({ error: 'Not a directory' });
    }

    const entries = [];
    for (const name of fs.readdirSync(resolved)) {
      if (name.startsWith('.')) continue;
      const fullPath = path.join(resolved, name);
      try {
        const stat = fs.statSync(fullPath);
        entries.push({
          name,
          type: stat.isDirectory() ? 'directory' : 'file',
          size: stat.size,
          modified: stat.mtimeMs,
        });
      } catch {}
    }

    // Sort: directories first, then alphabetical
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return {
      path: resolved,
      relativePath: relPath || '',
      root: cwd,
      entries,
    };
  });

  app.get('/api/agents/:id/files/read', { preHandler: authenticate }, async (request, reply) => {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(request.params.id);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });

    const relPath = request.query.path || '';
    if (!relPath) return reply.code(400).send({ error: 'path is required' });

    const result = resolveAgentPath(agent, relPath);
    if (!result) return reply.code(400).send({ error: 'Invalid path' });

    const { resolved } = result;

    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return reply.code(404).send({ error: 'File not found' });
    }

    const stat = fs.statSync(resolved);
    // Limit to 1MB for plain text viewing
    if (stat.size > 1024 * 1024) {
      return reply.code(400).send({ error: 'File too large (>1MB)' });
    }

    const content = fs.readFileSync(resolved, 'utf8');
    return {
      name: path.basename(resolved),
      path: relPath,
      size: stat.size,
      content,
    };
  });

  // Download / serve raw file (for images, binary files, etc.)
  app.get('/api/agents/:id/files/raw', { preHandler: authenticate }, async (request, reply) => {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(request.params.id);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });

    const relPath = request.query.path || '';
    if (!relPath) return reply.code(400).send({ error: 'path is required' });

    const result = resolveAgentPath(agent, relPath);
    if (!result) return reply.code(400).send({ error: 'Invalid path' });

    const { resolved } = result;

    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return reply.code(404).send({ error: 'File not found' });
    }

    const ext = path.extname(resolved).toLowerCase();
    const mimeTypes = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon', '.bmp': 'image/bmp',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
      '.json': 'application/json',
      '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
    };

    const download = request.query.download === '1';
    reply.header('content-type', mimeTypes[ext] || 'application/octet-stream');
    if (download) {
      reply.header('content-disposition', `attachment; filename="${path.basename(resolved)}"`);
    }
    return reply.send(fs.createReadStream(resolved));
  });
}
