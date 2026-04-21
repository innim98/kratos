import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { authenticateAny } from '../lib/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = path.join(__dirname, '..', '..', 'projects');

export default async function attachmentRoutes(app) {
  const { db } = app;
  const auth = authenticateAny(app);

  // Upload attachment to issue
  app.post('/api/issues/:key/attachments', { preHandler: auth }, async (request, reply) => {
    const [code, numStr] = request.params.key.split('-');
    const num = parseInt(numStr, 10);
    const issue = db.prepare('SELECT * FROM issues WHERE project_code = ? AND issue_number = ?').get(code?.toUpperCase(), num);
    if (!issue) return reply.code(404).send({ error: 'Issue not found' });

    const issueKey = `${issue.project_code}-${issue.issue_number}`;
    const attachDir = path.join(PROJECTS_DIR, issue.project_code.toLowerCase(), 'attachments', issueKey);
    fs.mkdirSync(attachDir, { recursive: true });

    const uploaded = [];
    const parts = request.parts();

    for await (const part of parts) {
      if (part.type === 'file') {
        const safeName = `${Date.now()}-${path.basename(part.filename).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const dest = path.join(attachDir, safeName);
        await pipeline(part.file, fs.createWriteStream(dest));
        uploaded.push({
          name: safeName,
          original: part.filename,
          url: `/api/issues/${issueKey}/attachments/${safeName}`,
          size: fs.statSync(dest).size,
        });
      }
    }

    return { files: uploaded };
  });

  // Serve attachment
  app.get('/api/issues/:key/attachments/:filename', async (request, reply) => {
    const [code, numStr] = request.params.key.split('-');
    const num = parseInt(numStr, 10);
    if (!code || isNaN(num)) return reply.code(400).send({ error: 'Invalid issue key' });

    const issueKey = `${code.toUpperCase()}-${num}`;
    const filename = path.basename(request.params.filename);
    const filePath = path.join(PROJECTS_DIR, code.toLowerCase(), 'attachments', issueKey, filename);

    if (!fs.existsSync(filePath)) return reply.code(404).send({ error: 'File not found' });

    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
    };

    reply.header('content-type', mimeTypes[ext] || 'application/octet-stream');
    reply.header('cache-control', 'public, max-age=86400');
    return reply.send(fs.createReadStream(filePath));
  });

  // List attachments for an issue
  app.get('/api/issues/:key/attachments', { preHandler: auth }, async (request, reply) => {
    const [code, numStr] = request.params.key.split('-');
    const num = parseInt(numStr, 10);
    if (!code || isNaN(num)) return reply.code(400).send({ error: 'Invalid issue key' });

    const issueKey = `${code.toUpperCase()}-${num}`;
    const attachDir = path.join(PROJECTS_DIR, code.toLowerCase(), 'attachments', issueKey);

    if (!fs.existsSync(attachDir)) return [];

    return fs.readdirSync(attachDir).map(name => ({
      name,
      url: `/api/issues/${issueKey}/attachments/${name}`,
      size: fs.statSync(path.join(attachDir, name)).size,
    }));
  });
}
