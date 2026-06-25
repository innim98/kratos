export default async function guideRoutes(app) {
  const { db } = app;

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

# 상태 보고 (working / idle)
# idle 전환 시 Kratos가 자동으로 작업완료 알림 발생
curl -X POST http://localhost:${port}/api/agents/status \\
  ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"status": "idle"}'

# ── 설정 방법 (2단계) ──
#
# 1단계: 터미널에서 환경변수 설정 (같은 폴더에서 여러 에이전트가 공존해도 충돌 없음)
export KRATOS_TOKEN="${token}"
export KRATOS_PORT="${port}"
#
# 2단계: Claude Code hook 설정 (.claude/settings.local.json)
# 환경변수 $KRATOS_TOKEN을 참조하므로 같은 파일을 공유해도 안전합니다.
# {
#   "hooks": {
#     "Stop": [{"matcher":"","hooks":[{"type":"command",
#       "command":"curl -s -X POST http://localhost:$KRATOS_PORT/api/agents/status -H \\"Authorization: Bearer $KRATOS_TOKEN\\" -H \\"Content-Type: application/json\\" -d '{\\"status\\":\\"idle\\"}'"}]}],
#     "PreToolUse": [{"matcher":"","hooks":[{"type":"command",
#       "command":"curl -s -X POST http://localhost:$KRATOS_PORT/api/agents/status -H \\"Authorization: Bearer $KRATOS_TOKEN\\" -H \\"Content-Type: application/json\\" -d '{\\"status\\":\\"working\\"}'"}]}]
#   }
# }
`;

    reply.header('content-type', 'text/plain');
    return reply.send(guide);
  });
}
