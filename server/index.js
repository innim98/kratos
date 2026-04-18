import fs from 'fs';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyWebsocket from '@fastify/websocket';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDb } from './lib/db.js';

// Load .env from project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import agentRoutes from './routes/agents.js';
import folderRoutes from './routes/folders.js';
import wsRoutes from './routes/ws.js';
import webviewRoutes from './routes/webview.js';
import webviewProxyRoutes from './routes/webview-proxy.js';
import webviewSharedRoutes from './routes/webview-shared.js';
import webviewInspectRoutes from './routes/webview-inspect.js';

function getArg(flags) {
  for (const flag of flags) {
    const idx = process.argv.indexOf(flag);
    if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  }
  return null;
}
const hasFlag = (flags) => flags.some(f => process.argv.includes(f));

export async function buildServer(opts = {}) {
  const testing = opts.testing || false;
  const port = parseInt(getArg(['--port']) || process.env.PORT || '17000', 10);
  const useAuth = hasFlag(['--auth']);

  const app = Fastify({ logger: !testing });

  const dbPath = testing
    ? ':memory:'
    : path.join(__dirname, 'kratos.db');
  const migrationsDir = path.join(__dirname, 'migrations');

  const db = createDb(dbPath, migrationsDir);
  app.decorate('db', db);

  const jwtSecret = process.env.JWT_SECRET || (testing ? 'test-secret' : undefined);
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  await app.register(fastifyJwt, {
    secret: jwtSecret,
    sign: { expiresIn: '7d' },
  });

  app.addHook('onClose', () => {
    db.close();
  });

  await app.register(fastifyWebsocket);
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(agentRoutes);
  await app.register(folderRoutes);
  await app.register(wsRoutes);
  await app.register(webviewRoutes);
  await app.register(webviewProxyRoutes);
  await app.register(webviewSharedRoutes);
  await app.register(webviewInspectRoutes);

  app.get('/api/config', async () => {
    return { auth: useAuth, serverPort: port };
  });

  app.get('/api/status', async () => {
    const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    return { hasUsers: count > 0 };
  });

  if (!testing) {
    await app.listen({ port, host: '0.0.0.0' });
  }

  return app;
}

// Run directly
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  buildServer();
}
