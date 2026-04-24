import pty from 'node-pty';
import { execSync } from 'child_process';

export default async function wsRoutes(app) {
  app.get('/ws/terminal', { websocket: true, preHandler: async (request, reply) => {
    const token = request.query.token;
    if (!token) {
      return reply.code(401).send({ error: 'Token required' });
    }
    try {
      request.user = app.jwt.verify(token);
    } catch {
      return reply.code(401).send({ error: 'Invalid token' });
    }
  }}, (socket, request) => {
    let ptyProcess = null;
    let attached = false;

    function cleanupPty() {
      if (ptyProcess) {
        try { ptyProcess.kill(); } catch {}
        ptyProcess = null;
      }
      attached = false;
    }

    socket.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'attach') {
        // Kill previous PTY if re-attaching
        cleanupPty();

        const { db } = app;
        const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(msg.agentId);
        if (!agent) {
          socket.send(JSON.stringify({ type: 'error', message: 'Agent not found' }));
          return;
        }

        // Send scrollback first
        try {
          const scrollback = execSync(
            `tmux capture-pane -t ${agent.tmux_session} -p -e -S -`,
            { encoding: 'utf8', timeout: 5000 }
          );
          if (scrollback) {
            socket.send(JSON.stringify({ type: 'scrollback', data: scrollback }));
          }
        } catch {
          // tmux session might not exist
        }

        // Spawn tmux attach via PTY
        try {
          const shell = process.env.SHELL || '/bin/zsh';
          ptyProcess = pty.spawn(shell, ['-c', `tmux attach -dt ${agent.tmux_session} || tmux new-session -As ${agent.tmux_session}`], {
            name: 'xterm-256color',
            cols: msg.cols || 80,
            rows: msg.rows || 24,
            cwd: process.env.HOME,
            env: { ...process.env, TERM: 'xterm-256color', PORT: '', CLIENT_PORT: '' },
          });
        } catch (e) {
          app.log.error({ err: e }, 'Failed to spawn PTY for tmux attach');
          socket.send(JSON.stringify({ type: 'error', message: `Failed to attach: ${e.message}` }));
          attached = false;
          return;
        }

        attached = true;

        ptyProcess.onData((data) => {
          if (socket.readyState === 1) {
            try { socket.send(JSON.stringify({ type: 'output', data })); } catch {}
          }
        });

        ptyProcess.onExit(() => {
          attached = false;
          ptyProcess = null;
          if (socket.readyState === 1) {
            try { socket.send(JSON.stringify({ type: 'session-ended' })); } catch {}
          }
        });

        socket.send(JSON.stringify({ type: 'attached', agentId: agent.id }));
        return;
      }

      if (msg.type === 'input' && ptyProcess) {
        try { ptyProcess.write(msg.data); } catch {}
        return;
      }

      if (msg.type === 'resize' && ptyProcess) {
        try { ptyProcess.resize(msg.cols, msg.rows); } catch {}
        return;
      }

      if (msg.type === 'detach') {
        cleanupPty();
        return;
      }
    });

    socket.on('close', () => { cleanupPty(); });
    socket.on('error', () => { cleanupPty(); });
  });
}
