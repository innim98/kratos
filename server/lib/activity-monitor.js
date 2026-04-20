import { getTmuxSessions } from './tmux.js';

// Track agent activity states
// States: 'idle' | 'active' | 'done'
const agentStates = new Map();

const ACTIVE_THRESHOLD = 30;  // seconds of activity before "done" can trigger
const IDLE_THRESHOLD = 10;    // seconds of idle after activity to trigger "done"
const POLL_INTERVAL = 3000;   // ms

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

      let state = agentStates.get(agent.id);
      if (!state) {
        state = { status: 'idle', activeStart: null, lastActivity: lastActivity, notified: false };
        agentStates.set(agent.id, state);
      }

      if (idleSeconds < 3) {
        // Currently active
        if (state.status === 'idle' || state.status === 'done') {
          state.activeStart = now;
          state.notified = false;
        }
        state.status = 'active';
        state.lastActivity = lastActivity;
      } else if (state.status === 'active') {
        // Was active, now idle
        const activeDuration = now - (state.activeStart || now);

        if (activeDuration >= ACTIVE_THRESHOLD && idleSeconds >= IDLE_THRESHOLD && !state.notified) {
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
