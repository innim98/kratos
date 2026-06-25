#!/usr/bin/env bash
#
# Restart Kratos server + client, then confirm both are actually serving.
# Exits 0 only once both ports respond. Detaches both so they survive this shell.
#
# Usage: ./restart.sh            # restart both
#        ./restart.sh server     # restart only the server
#        ./restart.sh client     # restart only the client
#        ./restart.sh ensure     # start only whatever is currently DOWN (cheap; safe to always run)
#
set -uo pipefail
set +m  # silence job-control PID echo for backgrounded processes

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# --- load ports from .env (fallback to defaults) ---
PORT="$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')"
CLIENT_PORT="$(grep -E '^CLIENT_PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')"
PORT="${PORT:-15001}"
CLIENT_PORT="${CLIENT_PORT:-15000}"

SERVER_LOG="/tmp/kratos-server.log"
CLIENT_LOG="/tmp/kratos-vite.log"

TARGET="${1:-both}"

kill_port() {
  local p="$1"
  local pids
  # IMPORTANT: -sTCP:LISTEN so we only kill the process LISTENING on this port.
  # A plain `lsof -ti:$p` also returns processes merely CONNECTED to it (e.g. the
  # vite dev server proxying to the backend) — killing those took the frontend
  # down every time the backend was restarted.
  pids="$(lsof -ti:"$p" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "  killing listener on :$p -> $pids"
    kill $pids 2>/dev/null || true
    sleep 1
    pids="$(lsof -ti:"$p" -sTCP:LISTEN 2>/dev/null || true)"
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  fi
}

start_server() {
  echo "starting server on :$PORT ..."
  kill_port "$PORT"
  nohup bash -c "cd '$ROOT/server' && exec node index.js --auth" > "$SERVER_LOG" 2>&1 &
  disown
}

start_client() {
  echo "starting client on :$CLIENT_PORT ..."
  kill_port "$CLIENT_PORT"
  nohup bash -c "cd '$ROOT/client' && exec npx vite --host 0.0.0.0 --port '$CLIENT_PORT'" > "$CLIENT_LOG" 2>&1 &
  disown
}

# wait until an HTTP request to the port returns any status code (proof it serves)
wait_up() {
  local p="$1" name="$2" log="$3"
  local deadline=$(( SECONDS + 20 ))
  while [ "$SECONDS" -lt "$deadline" ]; do
    local code
    code="$(curl -s -o /dev/null -m 2 -w '%{http_code}' "http://localhost:$p/" 2>/dev/null || echo 000)"
    if [ "$code" != "000" ]; then
      echo "  ✅ $name up on :$p (HTTP $code)"
      return 0
    fi
    sleep 0.5
  done
  echo "  ❌ $name FAILED to come up on :$p"
  echo "  --- last lines of $log ---"
  tail -15 "$log" 2>/dev/null | sed 's/^/  | /'
  return 1
}

is_up() { [ -n "$(lsof -ti:"$1" -sTCP:LISTEN 2>/dev/null)" ]; }

rc=0
case "$TARGET" in
  server) start_server ;;
  client) start_client ;;
  both)   start_server; start_client ;;
  ensure)
    is_up "$PORT"        && echo "server already up on :$PORT"        || start_server
    is_up "$CLIENT_PORT" && echo "client already up on :$CLIENT_PORT" || start_client
    ;;
  *) echo "unknown target: $TARGET (use: server | client | both | ensure)"; exit 2 ;;
esac

# give them a moment, then confirm. ensure/both verify BOTH services.
sleep 2
[ "$TARGET" = "client" ] || wait_up "$PORT" "server" "$SERVER_LOG" || rc=1
[ "$TARGET" = "server" ] || wait_up "$CLIENT_PORT" "client" "$CLIENT_LOG" || rc=1

if [ "$rc" -eq 0 ]; then
  [ "$TARGET" != "client" ] && echo "  server=http://localhost:$PORT"
  [ "$TARGET" != "server" ] && echo "  client=http://localhost:$CLIENT_PORT"
  echo "done ($TARGET)."
else
  echo "one or more services failed to start."
fi
exit "$rc"
