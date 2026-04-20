import { execSync } from 'child_process';

const SYSTEM_COMMANDS = new Set([
  'launchd', 'httpd', 'rapportd', 'sharingd', 'AirPlayXPCHelper',
  'ControlCenter', 'SystemUIServer', 'loginwindow', 'UserEventAgent',
  'WiFiAgent', 'bluetoothd', 'identityservicesd', 'mDNSResponder',
  'com.docker.backend', 'com.docker.vpnkit', 'vpnkit-bridge',
  'com.apple', 'AMPDeviceDiscoveryAgent', 'remoted',
]);

const SYSTEM_PREFIXES = ['com.apple', 'com.docker', 'Adobe'];

function isSystemProcess(command) {
  if (SYSTEM_COMMANDS.has(command)) return true;
  return SYSTEM_PREFIXES.some(p => command.startsWith(p));
}

export function scanPorts() {
  let output;
  try {
    output = execSync('lsof -iTCP -sTCP:LISTEN -nP -F pcn', {
      encoding: 'utf8',
      timeout: 10000,
    });
  } catch {
    return [];
  }

  const ports = [];
  let current = {};

  for (const line of output.split('\n')) {
    if (!line) continue;
    const type = line[0];
    const value = line.slice(1);

    if (type === 'p') {
      current = { pid: parseInt(value, 10) };
    } else if (type === 'c') {
      current.command = value;
    } else if (type === 'n') {
      // Format: *:PORT or 127.0.0.1:PORT or [::1]:PORT
      const match = value.match(/:(\d+)$/);
      if (match) {
        const port = parseInt(match[1], 10);
        // Deduplicate by port
        if (!ports.some(p => p.port === port)) {
          ports.push({
            port,
            pid: current.pid,
            command: current.command || '',
            system: isSystemProcess(current.command || ''),
          });
        }
      }
    }
  }

  // Enrich with cwd
  const pids = [...new Set(ports.filter(p => !p.system).map(p => p.pid))];
  const cwds = getCwds(pids);
  for (const p of ports) {
    p.cwd = cwds[p.pid] || null;
  }

  return ports.sort((a, b) => a.port - b.port);
}

function getCwds(pids) {
  if (pids.length === 0) return {};
  const result = {};
  try {
    const output = execSync(
      `lsof -a -d cwd -p ${pids.join(',')} -F pn`,
      { encoding: 'utf8', timeout: 5000 }
    );
    let currentPid = null;
    for (const line of output.split('\n')) {
      if (line.startsWith('p')) currentPid = parseInt(line.slice(1), 10);
      else if (line.startsWith('n') && currentPid) result[currentPid] = line.slice(1);
    }
  } catch {}
  return result;
}
