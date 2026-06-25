import pty from 'node-pty';
import { execSync } from 'child_process';
import fs from 'fs';

// Track all active PTY PIDs and master FDs
const activePtys = new Set();
const activeMasterFds = new Set();

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

export function getPtyStats() {
  const serverPid = process.pid;
  let ptmxCount = 0;
  try {
    const output = execSync(`lsof -p ${serverPid} 2>/dev/null | grep ptmx | wc -l`, { encoding: 'utf8', timeout: 5000 });
    ptmxCount = parseInt(output.trim()) || 0;
  } catch {}

  let totalPtys = 0;
  try {
    const output = execSync('ls /dev/ttys[0-9][0-9][0-9] 2>/dev/null | wc -l', { encoding: 'utf8', timeout: 5000 });
    totalPtys = parseInt(output.trim()) || 0;
  } catch {}

  let ptmxMax = 0;
  try {
    const output = execSync('sysctl -n kern.tty.ptmx_max', { encoding: 'utf8', timeout: 3000 });
    ptmxMax = parseInt(output.trim()) || 0;
  } catch {}

  return { serverPid, activePtys: activePtys.size, serverPtmxFds: ptmxCount, totalPtys, ptmxMax };
}

export function releaseOrphanPtys() {
  const serverPid = process.pid;
  let closed = 0;
  let skipped = 0;
  try {
    const output = execSync(`lsof -p ${serverPid} -Fn 2>/dev/null | grep -B1 ptmx`, { encoding: 'utf8', timeout: 5000 });
    const fds = [];
    for (const line of output.split('\n')) {
      if (line.startsWith('f') && /^\d+$/.test(line.slice(1))) {
        fds.push(parseInt(line.slice(1)));
      }
    }
    for (const fd of fds) {
      if (activeMasterFds.has(fd)) {
        skipped++;
        continue;
      }
      try { fs.closeSync(fd); closed++; } catch {}
    }
  } catch {}
  return { closed, skipped };
}

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
    let masterFd = null;
    let attached = false;
    let dataDisposable = null;
    let exitDisposable = null;

    function closeMasterFd() {
      if (masterFd != null) {
        const fd = masterFd;
        masterFd = null;
        activeMasterFds.delete(fd);
        try {
          fs.closeSync(fd);
          app.log.info({ fd }, 'closeMasterFd: closed OK');
        } catch (e) {
          app.log.warn({ fd, err: e.message }, 'closeMasterFd: close failed');
        }
      }
    }

    function cleanupPty(reason) {
      const pid = ptyPid;
      const fd = masterFd;
      const hadProcess = !!ptyProcess;
      app.log.info({ reason, pid, fd, hadProcess, activePtys: activePtys.size }, 'cleanupPty called');

      if (dataDisposable) { try { dataDisposable.dispose(); } catch {} dataDisposable = null; }
      if (exitDisposable) { try { exitDisposable.dispose(); } catch {} exitDisposable = null; }
      ptyPid = null;
      if (pid) activePtys.delete(pid);
      if (ptyProcess) {
        const p = ptyProcess;
        ptyProcess = null;
        try { p.kill(); } catch {}
        try { p.destroy(); } catch {}
      }
      closeMasterFd();
      if (pid) {
        setTimeout(() => {
          try { process.kill(pid, 'SIGKILL'); } catch {}
        }, 1000);
      }
      attached = false;
    }

    socket.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'attach') {
        // Kill previous PTY if re-attaching
        cleanupPty('re-attach');

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

        // Spawn tmux attach via PTY.
        // If the session is gone (e.g. tmux server died on reboot), recreate it
        // in the agent's original folder — not the server's HOME — so the
        // terminal starts where it was configured.
        try {
          const shell = process.env.SHELL || '/bin/zsh';
          const startDir = agent.folder || process.env.HOME;
          ptyProcess = pty.spawn(shell, ['-c', `tmux attach -dt ${agent.tmux_session} || tmux new-session -As ${agent.tmux_session} -c ${startDir}`], {
            name: 'xterm-256color',
            cols: msg.cols || 80,
            rows: msg.rows || 24,
            cwd: startDir,
            env: { ...process.env, TERM: 'xterm-256color', PORT: '', CLIENT_PORT: '' },
          });
        } catch (e) {
          app.log.error({ err: e }, 'Failed to spawn PTY for tmux attach');
          socket.send(JSON.stringify({ type: 'error', message: `Failed to attach: ${e.message}` }));
          attached = false;
          return;
        }

        ptyPid = ptyProcess.pid;
        masterFd = ptyProcess._fd;
        app.log.info({ pid: ptyPid, _fd: masterFd, masterProp: ptyProcess.master?.fd, keys: Object.keys(ptyProcess).join(',') }, 'PTY spawned');
        if (ptyPid) activePtys.add(ptyPid);
        if (masterFd != null) activeMasterFds.add(masterFd);
        attached = true;

        dataDisposable = ptyProcess.onData((data) => {
          if (socket.readyState === 1) {
            try { socket.send(JSON.stringify({ type: 'output', data })); } catch {}
          }
        });

        exitDisposable = ptyProcess.onExit(() => {
          app.log.info({ pid: ptyPid, fd: masterFd, activePtys: activePtys.size }, 'pty onExit fired');
          attached = false;
          if (ptyPid) { activePtys.delete(ptyPid); ptyPid = null; }
          ptyProcess = null;
          dataDisposable = null;
          exitDisposable = null;
          closeMasterFd();
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
        cleanupPty('detach');
        return;
      }
    });

    socket.on('close', () => { cleanupPty('ws-close'); });
    socket.on('error', () => { cleanupPty('ws-error'); });
  });
}
