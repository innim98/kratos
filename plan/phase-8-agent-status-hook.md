# Phase 8: Agent Status Hook

## Overview

에이전트가 Claude Code의 Stop hook을 통해 자신의 상태(working/idle)를 Kratos에 직접 보고. 기존 tmux activity-monitor 기반 감지를 대체.

## 핵심 흐름

```
[Claude Code]              [Kratos Server]              [Browser]
     |                          |                           |
  (작업 시작)                    |                           |
     |-- POST /api/agents/      |                           |
     |   status { status:       |                           |
     |   "working" } ---------> |                           |
     |                          |-- DB update               |
     |                          |                           |
  (작업 완료 - Stop hook)       |                           |
     |-- POST /api/agents/      |                           |
     |   status { status:       |                           |
     |   "idle" } ------------> |                           |
     |                          |-- DB update               |
     |                          |-- WS: agent-done -------->|
     |                          |                           |
     |                          |             [알림음 + 브라우저 알림]
```

## API

```
POST /api/agents/status
  Auth: agent token
  Body: { status: "working" | "idle" }
  → 200: { ok: true }
  
  - agent token으로 에이전트 식별
  - status를 DB에 저장 (agent_reported_status, last_status_at)
  - working → idle 전환 시 agent-done WS 이벤트 발생
  - 한번이라도 호출한 에이전트는 activity-monitor에서 제외
```

## DB

```sql
-- migration 013
ALTER TABLE agents ADD COLUMN reported_status TEXT DEFAULT NULL;
ALTER TABLE agents ADD COLUMN last_status_at TEXT DEFAULT NULL;
```

- `reported_status`: NULL이면 activity-monitor 사용, 값이 있으면 hook 기반
- `last_status_at`: 마지막 상태 변경 시각

## Activity Monitor 변경

- `startActivityMonitor`에서 `reported_status IS NOT NULL`인 에이전트 건너뛰기
- 기존 로직은 hook 미설정 에이전트를 위해 유지

## Claude Code Hook 설정 가이드

에이전트의 `~/.claude/settings.json` 또는 프로젝트 `.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "curl -s -X POST http://localhost:15001/api/agents/status -H 'Authorization: Bearer $KRATOS_TOKEN' -H 'Content-Type: application/json' -d '{\"status\":\"idle\"}'"
      }]
    }],
    "PreToolUse": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "curl -s -X POST http://localhost:15001/api/agents/status -H 'Authorization: Bearer $KRATOS_TOKEN' -H 'Content-Type: application/json' -d '{\"status\":\"working\"}'"
      }]
    }]
  }
}
```

- `Stop`: 턴 완료 시 → idle
- `PreToolUse`: 도구 사용 시작 시 → working (반복 호출되지만 이미 working이면 무시)

## 알림 설정 UI

Header의 기존 Focus 스위치를 3-option으로 변경:

- **All**: 모든 에이전트 알림
- **Focus**: 열려있는 에이전트만
- **Off**: 알림 끄기

localStorage에 저장: `kratos_notify_mode` = `all` | `focus` | `off`

## Implementation Order

1. DB migration 013: reported_status, last_status_at
2. POST /api/agents/status 엔드포인트
3. activity-monitor에서 reported_status 에이전트 제외
4. guide 페이지에 hook 설정 가이드 추가
5. Header 알림 3-option UI 변경

## Status: DONE (2026-06-25)
