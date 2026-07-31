import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MSG_SCRIPT_PATH = join(__dirname, '..', 'templates', 'kratos-msg.sh');
const MCP_INDEX_PATH = join(__dirname, '..', '..', 'mcp', 'index.js');

export default async function guideRoutes(app) {
  const { db } = app;

  // Serve the agent-talk helper script (verbatim bash, no secrets — reads
  // token/port from tmux env). Agents save it and allowlist it to avoid
  // per-call approval prompts.
  app.get('/api/agents/msg-script', async (request, reply) => {
    try {
      reply.header('content-type', 'text/plain');
      return reply.send(readFileSync(MSG_SCRIPT_PATH, 'utf8'));
    } catch {
      return reply.code(500).send({ error: 'script unavailable' });
    }
  });

  // Serve API guide as plain text — agent token required or localhost
  app.get('/api/agents/:id/guide', async (request, reply) => {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(request.params.id);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });

    const port = app.server?.address()?.port || process.env.PORT || 15001;
    const token = agent.token || '<no token>';
    const id = agent.id;
    const authHeader = `-H "Authorization: Bearer ${token}"`;

    const guide = `# Kratos API Guide — Agent #${id} (${agent.name})
# Server: http://localhost:${port}
# Token: ${token}

# ═══════════════════════════════════════════
# MCP (권장: curl 대신 네이티브 툴로 호출)
# ═══════════════════════════════════════════
# Kratos API를 MCP 툴로 노출합니다. 등록하면 아래 curl들 대신 kratos_* 툴을 씁니다.
# 토큰/포트는 tmux 세션 env(KRATOS_TOKEN/KRATOS_PORT)에서 자동으로 읽으므로 설정에 비밀정보가 없습니다.
#
#   claude mcp add kratos -- node ${MCP_INDEX_PATH}
#
# 또는 프로젝트 .mcp.json 에:
#   { "mcpServers": { "kratos": { "command": "node", "args": ["${MCP_INDEX_PATH}"] } } }
#
# 주요 툴: kratos_whoami, kratos_directory, kratos_report_status,
#   kratos_send_message(to 또는 to_session)/list_messages/mark_read/subscribe,
#   kratos_list_todos/create_todo/complete_todo, kratos_register_port,
#   kratos_list_phases/create_phase/add_phase_document,
#   (매니저) kratos_set_nickname/set_session_uuid/spawn_agent
# 최초 1회: cd ${dirname(MCP_INDEX_PATH)} && npm install

# ═══════════════════════════════════════════
# PORT REGISTRATION (register ALL ports)
# ═══════════════════════════════════════════

curl -X POST http://localhost:${port}/api/agents/${id}/ports \\
  ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"port": 5173, "label": "Vite dev server", "type": "service"}'

curl -X POST http://localhost:${port}/api/agents/${id}/ports \\
  ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"port": 5432, "label": "PostgreSQL", "type": "service"}'

# ═══════════════════════════════════════════
# TODOS
# ═══════════════════════════════════════════

# Create a todo
curl -X POST http://localhost:${port}/api/todos \\
  ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"title": "Task description", "priority": 3}'

# List todos
curl -s http://localhost:${port}/api/todos ${authHeader}

# Complete a todo (agents can only complete their own)
curl -X PUT http://localhost:${port}/api/todos/<TODO_ID> \\
  ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"status": "completed"}'

# ═══════════════════════════════════════════
# ISSUES
# ═══════════════════════════════════════════

# Create an issue
curl -X POST http://localhost:${port}/api/issues \\
  ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"project_code": "<CODE>", "title": "Issue title", "description": "Details", "priority": 3}'

# Add comment
curl -X POST http://localhost:${port}/api/issues/<CODE>-<NUM>/comments \\
  ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"body": "Comment text"}'

# Attach image
curl -X POST http://localhost:${port}/api/issues/<CODE>-<NUM>/attachments \\
  ${authHeader} \\
  -F "files=@/path/to/screenshot.png"

# Update status (pending/todo/inprogress/verification/completed)
curl -X PUT http://localhost:${port}/api/issues/<CODE>-<NUM> \\
  ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"status": "inprogress"}'

# ═══════════════════════════════════════════
# FILE UPLOAD (to agent working directory)
# ═══════════════════════════════════════════

curl -X POST http://localhost:${port}/api/agents/${id}/upload \\
  ${authHeader} \\
  -F "files=@/path/to/file"

# ═══════════════════════════════════════════
# VOICE (text-to-speech reply to user)
# ═══════════════════════════════════════════

# Send voice reply (plays on user's browser via TTS)
curl -X POST http://localhost:${port}/api/agents/${id}/voice/speak \\
  ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"text": "작업 완료했습니다"}'

# ═══════════════════════════════════════════
# PHASES (project phase documents)
# ═══════════════════════════════════════════

# List phases
curl -s "http://localhost:${port}/api/phases?project_code=<CODE>" ${authHeader} | jq

# Create a phase (status: active/draft/done/deprecated, default draft)
curl -X POST http://localhost:${port}/api/phases \\
  ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"project_code": "<CODE>", "name": "Phase 1: Auth", "status": "draft"}'
#   → 생성된 phase (id 포함). 이 id 로 아래 문서 등록.

# Register a document to a phase (status: active/draft/done/deprecated)
curl -X POST http://localhost:${port}/api/phases/<PHASE_ID>/documents \\
  ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"title": "Implementation Log", "doc_path": "docs/phase-1.md", "status": "active"}'

# Update document status or path
curl -X PUT http://localhost:${port}/api/phase-documents/<DOC_ID> \\
  ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"status": "done"}'

# ═══════════════════════════════════════════
# STATUS HOOK (자동 알림)
# ═══════════════════════════════════════════

# 상태 보고 (working / asking_permission / idle)
# working→idle 전환 시 Kratos가 자동으로 작업완료 알림 발생
curl -X POST http://localhost:${port}/api/agents/status \\
  ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"status": "idle"}'

# ── 설정 방법 ──
# .claude/settings.local.json 에 아래 hooks 를 추가하세요.
# 토큰/포트는 tmux에서 자동으로 읽으므로 별도 설정 불필요합니다.
# {
#   "hooks": {
#     "UserPromptSubmit": [{"matcher":"","hooks":[{"type":"command",
#       "command":"curl -s -X POST http://localhost:$(tmux show-environment KRATOS_PORT 2>/dev/null | cut -d= -f2-)/api/agents/status -H \\"Authorization: Bearer $(tmux show-environment KRATOS_TOKEN 2>/dev/null | cut -d= -f2-)\\" -H \\"Content-Type: application/json\\" -d '{\\"status\\":\\"working\\"}'"}]}],
#     "PermissionRequest": [{"matcher":"","hooks":[{"type":"command",
#       "command":"curl -s -X POST http://localhost:$(tmux show-environment KRATOS_PORT 2>/dev/null | cut -d= -f2-)/api/agents/status -H \\"Authorization: Bearer $(tmux show-environment KRATOS_TOKEN 2>/dev/null | cut -d= -f2-)\\" -H \\"Content-Type: application/json\\" -d '{\\"status\\":\\"asking_permission\\"}'"}]}],
#     "PostToolUse": [{"matcher":"","hooks":[{"type":"command",
#       "command":"curl -s -X POST http://localhost:$(tmux show-environment KRATOS_PORT 2>/dev/null | cut -d= -f2-)/api/agents/status -H \\"Authorization: Bearer $(tmux show-environment KRATOS_TOKEN 2>/dev/null | cut -d= -f2-)\\" -H \\"Content-Type: application/json\\" -d '{\\"status\\":\\"working\\"}'"}]}],
#     "PermissionDenied": [{"matcher":"","hooks":[{"type":"command",
#       "command":"curl -s -X POST http://localhost:$(tmux show-environment KRATOS_PORT 2>/dev/null | cut -d= -f2-)/api/agents/status -H \\"Authorization: Bearer $(tmux show-environment KRATOS_TOKEN 2>/dev/null | cut -d= -f2-)\\" -H \\"Content-Type: application/json\\" -d '{\\"status\\":\\"working\\"}'"}]}],
#     "Stop": [{"matcher":"","hooks":[{"type":"command",
#       "command":"curl -s -X POST http://localhost:$(tmux show-environment KRATOS_PORT 2>/dev/null | cut -d= -f2-)/api/agents/status -H \\"Authorization: Bearer $(tmux show-environment KRATOS_TOKEN 2>/dev/null | cut -d= -f2-)\\" -H \\"Content-Type: application/json\\" -d '{\\"status\\":\\"idle\\"}'"}]}]
#   }
# }

# ═══════════════════════════════════════════
# STATUS SUBSCRIPTION (Kratos agents orchestrator 용)
# ═══════════════════════════════════════════

# 오케스트레이터 에이전트가, 다른 에이전트가 특정 상태로 바뀌는 것을 구독합니다.
# 아래 예시: "다른 에이전트가 asking_permission(승인 대기)에 빠지면 알려줘" 구독.
# - exclude_agents 에 자기 자신(${id})을 넣어 본인 이벤트는 제외합니다.
# - 구독은 영속적이라 매번 발동합니다 (해제 전까지).
# - 전달 조건: 구독자(나)가 idle 이고 tmux 에서 claude/codex 가 실행 중일 때.
#   내가 작업 중이면 보류했다가, idle 이 되는 순간 tmux 로 아래 메시지를 받습니다:
#     "(From Kratos) agent status updated"
#   (보류 중 여러 건이 쌓여도 한 번만 전달)

curl -X POST http://localhost:${port}/api/agents/subscribe-status \\
  ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"status": "asking_permission", "exclude_agents": [${id}]}'

# 구독 해제 (status 생략 시 내 모든 구독 해제)
curl -X DELETE http://localhost:${port}/api/agents/subscribe-status \\
  ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"status": "asking_permission"}'

# ═══════════════════════════════════════════
# AGENT TALK (에이전트 간 메시지)
# ═══════════════════════════════════════════

# 메시지를 받으려면 두 가지가 필요합니다:
#   ① 상태 hook 등록 (위 STATUS HOOK 섹션) — online/offline 상태면 수신 불가
#   ② 아래 옵트인 호출
curl -X POST http://localhost:${port}/api/messages/subscribe ${authHeader}

# ═══ 추천: 헬퍼 스크립트 (매번 승인 안 받게) ═══
# curl POST 는 호출마다 승인이 필요해 번거롭습니다. 아래 스크립트를 한 번 설치하고
# .claude/settings.local.json 에 allowlist 하면 승인 없이 송수신할 수 있습니다.
mkdir -p scripts && curl -s http://localhost:${port}/api/agents/msg-script -o scripts/kratos-msg.sh && chmod +x scripts/kratos-msg.sh
# .claude/settings.local.json 에 추가:
#   { "permissions": { "allow": ["Bash(bash scripts/kratos-msg.sh:*)"] } }
# 사용:
#   bash scripts/kratos-msg.sh whoami                 # 내 id/name
#   bash scripts/kratos-msg.sh send <to-id> "본문"     # 전송
#   bash scripts/kratos-msg.sh read <from-id>         # 미읽음 출력 + 읽음 처리

# ── 상대 찾기 (전체 에이전트 id/name/session_uuid) ──
#   각 항목은 { id, name, session_uuid } — id로 보내려면 to, session uuid로 보내려면 to_session 사용.
curl -s http://localhost:${port}/api/agents/directory ${authHeader} | jq

# ── 직접 호출 (스크립트 없이) ──
# 보내기 — 본문에 따옴표/줄바꿈이 있으면 jq 로 만들어야 안전합니다:
curl -s -X POST http://localhost:${port}/api/messages ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d "$(jq -n --arg to <RECEIVER_ID> --arg b "리뷰 부탁해요" '{to:(\$to|tonumber), body:\$b}')"
#   → { "ok": true, "message_id": "<uuid>" }

# 수신: 내가 idle 일 때 tmux 로 아래 알림이 도착합니다 (쌓여도 한 번만):
#   (From Kratos : Kratos sent this at <unix>) message from <sender-id> is received — oldest unread <message-id> @ <unix>
# 알림을 받으면 대화 목록 조회 (to 생략 시 '나'로 간주, all=전체 / unread=신규):
# 긴 대화는 unread=1(안읽은 것만) 또는 limit=N(최근 N개)으로 줄이세요.
# 응답: { total, unread_count, returned, all, unread }
curl -s "http://localhost:${port}/api/messages?from=<SENDER_ID>&unread=1&limit=20" ${authHeader} | jq

# 읽음 처리 (read 단방향):
curl -s -X PUT http://localhost:${port}/api/messages/read ${authHeader} \\
  -H "Content-Type: application/json" -d '{"from": <SENDER_ID>}'

# 수신 옵트인 해제:
curl -X DELETE http://localhost:${port}/api/messages/subscribe ${authHeader}

# ── 세션 UUID로 보내기 (agent-id 대신 Claude Code 세션 uuid로 목적지 지정) ──
curl -s -X POST http://localhost:${port}/api/messages ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d "$(jq -n --arg s "<SESSION_UUID>" --arg b "리뷰 부탁해요" '{to_session:\$s, body:\$b}')"
#   성공 → { "ok": true, "message_id": "<uuid>" }
#   해당 uuid의 활성(=tmux 세션 살아있는) 에이전트가 없으면 → 409 { "error": "no active session" }
#   ※ 세션 uuid는 매니저 에이전트만 지정/제거하며, Kratos는 그 값의 신뢰성(실제 세션 대응 여부)을
#     보장하지 않습니다. 단순 조회 키로만 취급합니다.

# ═══════════════════════════════════════════
# AGENT NICKNAME (매니저 전용)
# ═══════════════════════════════════════════
# 매니저로 지정된 에이전트만 사용할 수 있습니다. 내가 매니저인지 확인:
curl -s http://localhost:${port}/api/agents/me ${authHeader} | jq .is_manager   # 1 이면 매니저

# 다른 에이전트에 닉네임 부여 (최대 10자). 팀원 역할을 사용자에게 설명하는 라벨입니다.
curl -s -X PUT http://localhost:${port}/api/agents/<TARGET_ID>/nickname ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"nickname": "reviewer"}'
#   → { "ok": true, "id": <TARGET_ID>, "nickname": "reviewer" }

# 닉네임 제거 (빈 문자열):
curl -s -X PUT http://localhost:${port}/api/agents/<TARGET_ID>/nickname ${authHeader} \\
  -H "Content-Type: application/json" -d '{"nickname": ""}'
#
# 주의: 매니저가 아니면 403. 매니저 지정은 대시보드 사용자가 Agents 목록의 "M" 버튼으로만 가능.
#       10자 초과 시 400(잘리지 않음). 닉네임은 UI에서 agent name 우측에 표시됩니다.

# 세션 UUID 지정/해제 — 에이전트에 Claude Code 세션 uuid를 붙여 'to_session'으로 수신 대상 지정 가능.
curl -s -X PUT http://localhost:${port}/api/agents/<TARGET_ID>/session-uuid ${authHeader} \\
  -H "Content-Type: application/json" -d '{"session_uuid": "<uuid>"}'
#   해제: -d '{"session_uuid": ""}'   /   중복 uuid → 409
#   ※ 이 값은 매니저 에이전트만 수정하며, Kratos는 그 값의 신뢰성(실제 세션과의 대응)을 보장하지 않습니다.

# ═══════════════════════════════════════════
# AGENT SPAWN (매니저 전용)
# ═══════════════════════════════════════════
# 매니저만 사용할 수 있습니다(내가 매니저인지: GET /api/agents/me 의 is_manager).
# 폴더 경로·이름·별명을 주면 새 에이전트 세션을 즉시 만들어 토큰까지 돌려줍니다.
curl -s -X POST http://localhost:${port}/api/agents/spawn ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"folder": "/abs/path/to/repo", "name": "worker-1", "nickname": "reviewer"}'
#   성공 → 201 { "id":.., "name":"worker-1", "tmux_session":"kratos-..", "token":"..", .. }
#   초과 → 409 { "error": "too many agent for the folder" }   (폴더당 상한 도달)
#
# 주의: 생성만 가능하고 삭제는 불가합니다(삭제는 대시보드 사용자만).
#       폴더당 상한은 전체 설정에서 조정(기본 4). 상한은 그 폴더의 죽은 세션도 포함해 셉니다.
`;

    reply.header('content-type', 'text/plain');
    return reply.send(guide);
  });
}
