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

## 후속 변경 (2026-06-25)

초기 구현 이후 실제 동작에 맞춰 확장됨:

- **상태 3종**: working / asking_permission(표시명 `ask`, 보라색) / idle
- **훅 4종** (`PreToolUse`→working 대신):
  - `UserPromptSubmit` → working
  - `PermissionRequest` → asking_permission
  - `PostToolUse` → working (승인 후 도구 실행 시 asking_permission 해제)
  - `PermissionDenied` → working (기각 시 해제)
  - `Stop` → idle
- **토큰/포트 전달**: 서버가 등록/기동 시 `tmux set-environment`로 세션에 주입.
  훅은 `$(tmux show-environment KRATOS_TOKEN|cut -d= -f2-)`로 런타임에 읽음
  (env 상속 불필요, 같은 폴더 다중 에이전트 충돌 없음).
- **WS 실시간 푸시**: `/api/agents/status`가 모든 상태 변경마다 `agent-status`
  WS 이벤트 브로드캐스트. Sidebar가 구독해 해당 에이전트만 즉시 갱신 (폴링 제거).
  idle 전환 시 `agent-done`도 별도 발생 (알림용).

## 알려진 한계 (다음 페이즈 후보)

- 브라우저당 WS 연결 3개 (Dashboard / Sidebar / 터미널). agents 상태를
  상위로 끌어올려 단일 WS로 통합하는 리팩터 여지 있음.
- offline 전환은 실시간 푸시 없음 (목록 재조회 시에만 반영).

## Status: DONE (2026-06-25)
