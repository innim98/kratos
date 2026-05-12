import pty from 'node-pty';
import { execSync } from 'child_process';

// Track all active PTY PIDs for leak detection
const activePtys = new Set();

// Periodic cleanup: kill PTY processes that are no longer tracked
setInterval(() => {
  try {
    const output = execSync("pgrep -f 'tmux attach\\|tmux new-session' || true", { encoding: 'utf8', timeout: 3000 }).trim();
    if (!output) return;
    const pids = output.split('\n').map(Number).filter(Boolean);
    for (const pid of pids) {
      if (!activePtys.has(pid)) {
        // Orphan tmux attach process — check if parent is our server
        try {
          const ppid = execSync(`ps -o ppid= -p ${pid}`, { encoding: 'utf8', timeout: 1000 }).trim();
          if (parseInt(ppid) === process.pid) {
            process.kill(pid, 'SIGKILL');
          }
        } catch {}
      }
    }
  } catch {}
}, 30000);

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
    let ptyPid = null;
    let attached = false;
    let dataDisposable = null;
    let exitDisposable = null;

    function cleanupPty() {
      if (dataDisposable) { try { dataDisposable.dispose(); } catch {} dataDisposable = null; }
      if (exitDisposable) { try { exitDisposable.dispose(); } catch {} exitDisposable = null; }
      if (ptyProcess) {
        const p = ptyProcess;
        const pid = ptyPid;
        ptyProcess = null;
        ptyPid = null;
        if (pid) activePtys.delete(pid);
        // destroy() closes the master FD socket AND sends SIGHUP
        try { p.destroy(); } catch {}
        // Force kill process after timeout as fallback
        setTimeout(() => {
          if (pid) { try { process.kill(pid, 'SIGKILL'); } catch {} }
        }, 1000);
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

        ptyPid = ptyProcess.pid;
        if (ptyPid) activePtys.add(ptyPid);
        attached = true;

        dataDisposable = ptyProcess.onData((data) => {
          if (socket.readyState === 1) {
            try { socket.send(JSON.stringify({ type: 'output', data })); } catch {}
          }
        });

        exitDisposable = ptyProcess.onExit(() => {
          attached = false;
          if (ptyPid) { activePtys.delete(ptyPid); ptyPid = null; }
          ptyProcess = null;
          dataDisposable = null;
          exitDisposable = null;
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
