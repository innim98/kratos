import { execSync } from 'child_process';
import { getTmuxSessions } from './tmux.js';

// Track agent activity states
// States: 'idle' | 'active' | 'done'
const agentStates = new Map();

const ACTIVE_THRESHOLD = 30;  // seconds of activity before "done" can trigger
const IDLE_THRESHOLD = 10;    // seconds of idle after activity to trigger "done"
const POLL_INTERVAL = 3000;   // ms

// Patterns indicating the agent is waiting for input (idle/done)
const PROMPT_PATTERNS = [
  /^❯\s*$/,         // Claude Code idle prompt
  /^>\s*$/,         // Generic prompt
  /^\$\s*$/,        // Shell prompt
  /^%\s*$/,         // Zsh prompt
];

// Patterns indicating the agent is still working
const BUSY_PATTERNS = [
  /[✻⏳] .*(Thinking|Actualizing|Sketching|Churning|Working|Planning|Reading|Searching|Running)/i,
  /↓.*tokens/,      // Downloading tokens
];

function isPaneAtPrompt(sessionName) {
  try {
    const output = execSync(
      `tmux capture-pane -t ${sessionName} -p -S -5`,
      { encoding: 'utf8', timeout: 3000 }
    );
    const lines = output.split('\n').filter(l => l.trim());
    if (lines.length === 0) return false;

    // Check last few non-empty lines for busy indicators
    const tail = lines.slice(-5).join('\n');
    for (const pat of BUSY_PATTERNS) {
      if (pat.test(tail)) return false;
    }

    // Check if prompt character is present in last few lines
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
      for (const pat of PROMPT_PATTERNS) {
        if (pat.test(lines[i].trim())) return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export function startActivityMonitor(db, broadcast) {
  setInterval(() => {
    const agents = db.prepare('SELECT * FROM agents').all();
    const live = getTmuxSessions();
    const now = Math.floor(Date.now() / 1000);

    for (const agent of agents) {
      const session = live.get(agent.tmux_session);
      if (!session) continue;

      const lastActivity = session.activity;
      const idleSeconds = now - lastActivity;
      const atPrompt = isPaneAtPrompt(agent.tmux_session);

      let state = agentStates.get(agent.id);
      if (!state) {
        state = { status: 'idle', activeStart: null, lastActivity: lastActivity, notified: false };
        agentStates.set(agent.id, state);
      }

      if (atPrompt) {
        // Agent is at prompt — if was active, it's now done
        if (state.status === 'active' && !state.notified) {
          const activeDuration = now - (state.activeStart || now);
          if (activeDuration >= ACTIVE_THRESHOLD) {
            state.status = 'done';
            state.notified = true;
            broadcast({
              type: 'agent-done',
              agentId: agent.id,
              agentName: agent.name,
              activeDuration,
            });
          }
        }
        if (state.status !== 'done') {
          state.status = 'idle';
        }
      } else if (idleSeconds < 3) {
        // Terminal has recent output and not at prompt — active
        if (state.status === 'idle' || state.status === 'done') {
          state.activeStart = now;
          state.notified = false;
        }
        state.status = 'active';
        state.lastActivity = lastActivity;
      } else if (state.status === 'active') {
        // No recent output but not at prompt either — still working (e.g., Thinking...)
        // Only fall back to old idle-based detection with longer threshold
        const activeDuration = now - (state.activeStart || now);
        if (activeDuration >= ACTIVE_THRESHOLD && idleSeconds >= IDLE_THRESHOLD * 6 && !state.notified) {
          state.status = 'done';
          state.notified = true;
          broadcast({
            type: 'agent-done',
            agentId: agent.id,
            agentName: agent.name,
            activeDuration,
          });
        }
      }
    }
  }, POLL_INTERVAL);
}

export function getAgentState(agentId) {
  return agentStates.get(agentId)?.status || 'idle';
}

export function clearAgentDone(agentId) {
  const state = agentStates.get(agentId);
  if (state) {
    state.status = 'idle';
  }
}
