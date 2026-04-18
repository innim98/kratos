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

    socket.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'attach') {
        if (attached) return;

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

        // Spawn tmux attach via PTY (-d detaches other clients first)
        try {
          const shell = process.env.SHELL || '/bin/zsh';
          ptyProcess = pty.spawn(shell, ['-c', `tmux attach -dt ${agent.tmux_session} || tmux new-session -As ${agent.tmux_session}`], {
            name: 'xterm-256color',
            cols: msg.cols || 80,
            rows: msg.rows || 24,
            cwd: process.env.HOME,
            env: { ...process.env, TERM: 'xterm-256color' },
          });
        } catch (e) {
          app.log.error({ err: e }, 'Failed to spawn PTY for tmux attach');
          socket.send(JSON.stringify({ type: 'error', message: `Failed to attach: ${e.message}` }));
          return;
        }

        attached = true;

        ptyProcess.onData((data) => {
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({ type: 'output', data }));
          }
        });

        ptyProcess.onExit(({ exitCode }) => {
          attached = false;
          ptyProcess = null;
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({ type: 'session-ended' }));
          }
        });

        socket.send(JSON.stringify({ type: 'attached', agentId: agent.id }));
        return;
      }

      if (msg.type === 'input' && ptyProcess) {
        ptyProcess.write(msg.data);
        return;
      }

      if (msg.type === 'resize' && ptyProcess) {
        ptyProcess.resize(msg.cols, msg.rows);
        return;
      }

      if (msg.type === 'detach') {
        if (ptyProcess) {
          ptyProcess.kill();
          ptyProcess = null;
        }
        attached = false;
        return;
      }
    });

    socket.on('close', () => {
      if (ptyProcess) {
        ptyProcess.kill();
        ptyProcess = null;
      }
    });
  });
}
