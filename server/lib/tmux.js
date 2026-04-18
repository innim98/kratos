import { execSync } from 'child_process';

export function getTmuxSessions() {
  const sessions = new Map();

  try {
    const output = execSync(
      "tmux list-sessions -F '#{session_name}\t#{session_activity}'",
      { encoding: 'utf8', timeout: 5000 }
    ).trim();

    if (!output) return sessions;

    for (const line of output.split('\n')) {
      const [name, activity] = line.split('\t');
      if (name) {
        sessions.set(name, {
          name,
          activity: activity ? parseInt(activity, 10) : null,
        });
      }
    }
  } catch {
    // tmux not running or not installed
  }

  return sessions;
}
