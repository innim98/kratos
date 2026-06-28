#!/usr/bin/env bash
# Kratos agent-talk helper. Token/port are read from the tmux session env
# (KRATOS_TOKEN / KRATOS_PORT), so this script takes no secrets.
#
# Install once, then allowlist it in .claude/settings.local.json so sending
# never needs per-call approval:
#   "permissions": { "allow": ["Bash(bash scripts/kratos-msg.sh:*)"] }
#
# Usage:
#   bash scripts/kratos-msg.sh send <to-id> "<body>"   # send a message
#   bash scripts/kratos-msg.sh read <from-id>          # print unread from X, then mark read
#   bash scripts/kratos-msg.sh whoami                  # my own {id, name}
set -euo pipefail
T=$(tmux show-environment KRATOS_TOKEN 2>/dev/null | cut -d= -f2-)
P=$(tmux show-environment KRATOS_PORT 2>/dev/null | cut -d= -f2-); P=${P:-15001}
[ -n "${T:-}" ] || { echo "ERR: no KRATOS_TOKEN in tmux env (start agent from a Kratos-registered session)" >&2; exit 1; }
AUTH="Authorization: Bearer $T"
BASE="http://localhost:$P"

case "${1:-}" in
  send)
    [ $# -ge 3 ] || { echo "usage: kratos-msg.sh send <to-id> <body>" >&2; exit 2; }
    curl -s -X POST "$BASE/api/messages" -H "$AUTH" -H "Content-Type: application/json" \
      -d "$(jq -n --arg to "$2" --arg b "$3" '{to:($to|tonumber), body:$b}')"; echo ;;
  read)
    [ $# -ge 2 ] || { echo "usage: kratos-msg.sh read <from-id>" >&2; exit 2; }
    curl -s "$BASE/api/messages?from=$2" -H "$AUTH" | jq -r '.unread[]? | "[\(.timestamp)] \(.body)"'
    curl -s -X PUT "$BASE/api/messages/read" -H "$AUTH" -H "Content-Type: application/json" \
      -d "$(jq -n --arg f "$2" '{from:($f|tonumber)}')" >/dev/null
    echo "(read marked)" ;;
  whoami)
    curl -s "$BASE/api/agents/me" -H "$AUTH" | jq ;;
  *)
    echo "usage: kratos-msg.sh send <to-id> <body> | read <from-id> | whoami" >&2; exit 2 ;;
esac
