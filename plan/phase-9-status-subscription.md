# Phase 9: Agent Status Subscription (Orchestrator)

## Overview

Kratos agents orchestrator를 위한 상태 구독. 오케스트레이터 에이전트가 "다른
에이전트가 특정 상태(예: `asking_permission`)로 바뀌면 알려달라"고 구독하면,
조건이 맞을 때 구독자의 tmux로 알림 메시지를 직접 보낸다.

핵심: 구독자가 **작업 중이면 방해하지 않고**, **idle이 될 때까지 미뤘다가** 전달한다.

## 핵심 흐름

```
[Agent B (orchestrator)]      [Kratos Server]            [Agent A]
   subscribe-status                  |                       |
   status=asking_permission          |                       |
   exclude=[B] ----------------->  DB 저장                    |
                                     |                        |
                                     |      (A가 승인 대기) ---|
                                     |  POST status            |
                                     |  asking_permission <----|
                                     |                         |
                                  트리거: B 구독 매치           |
                                     |                         |
                          B가 idle + claude/codex 실행?         |
                            ├ 예 → tmux send-keys 즉시 전달      |
                            └ 아니오 → pending=1 (보류)          |
                                     |                         |
                          (B가 나중에 idle 보고)                 |
                                  flush → 보류분 1회 전달        |
```

## API

```
POST /api/agents/subscribe-status      (auth: agent token)
  Body: { status: "working"|"idle"|"asking_permission",
          exclude_agents: [<agent id>, ...] }
  → { ok: true, subscriber, watch_status, exclude_agents }
  - 호출자 = 구독자 (토큰으로 식별)
  - (subscriber, watch_status) 유니크 → 재호출 시 exclude_agents 갱신(upsert)
  - 영속적: 해제 전까지 매번 발동

DELETE /api/agents/subscribe-status     (auth: agent token)
  Body: { status? }  // 생략 시 호출자의 모든 구독 해제
  → { ok: true }
```

## 전달 조건 (모두 충족해야 전송)

1. **다른** 에이전트가 `watch_status`로 전환 (exclude_agents·자기자신 제외)
2. 구독자의 `reported_status === 'idle'`
3. 구독자 tmux pane에서 **claude/codex 프로세스 실행 중**
   - 감지: pane foreground command + pane 프로세스 트리(자식) 스캔 (`/claude|codex/i`)
   - claude가 `node` 자식으로 뜨거나 `claude.exe`로 떠도 잡힘

2·3이 안 되면 `pending=1`로 보류. 구독자가 idle을 보고하는 순간 flush.

## 전송 방식

```bash
tmux send-keys -l -t <session> "(From Kratos) agent status updated"   # 리터럴 텍스트
tmux send-keys -t <session> Enter                                     # 별도 Enter
```

## 합치기(coalescing)

- 보류 상태는 0/1 플래그. 바쁜 동안 여러 건이 와도 **한 번만** 전달.
- 구독자가 idle·여유 상태면 이벤트마다 즉시 전달(실시간).

## DB

```sql
-- migration 014
CREATE TABLE agent_status_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_agent_id INTEGER NOT NULL,
  watch_status TEXT NOT NULL,
  exclude_agents TEXT NOT NULL DEFAULT '[]',  -- JSON array
  pending INTEGER NOT NULL DEFAULT 0,
  created_at TEXT, updated_at TEXT,
  UNIQUE(subscriber_agent_id, watch_status)
);
```

## 구현 파일

- `server/migrations/014_status_subscriptions.sql` — 테이블 + 인덱스
- `server/lib/status-subscriptions.js`
  - `isAgentCliRunning(session)` — claude/codex 프로세스 트리 스캔
  - `processStatusChange(db, agent, newStatus)` — 트리거 + idle flush
- `server/routes/agents.js`
  - `POST/DELETE /api/agents/subscribe-status`
  - `/api/agents/status`에서 `processStatusChange` 호출
- `server/routes/guide.js` — STATUS SUBSCRIPTION 가이드 섹션

## 검증 (E2E, 2026-06-25)

가짜 claude tmux 세션 + 임시 에이전트로 확인:
- ✅ claude/codex 감지 (claude 세션 true, 일반 세션 false)
- ✅ idle 구독자에게 즉시 전달
- ✅ 바쁜 동안 3회 트리거 → 메시지 0건, pending=1
- ✅ idle 전환 시 flush → 정확히 1건 전달, pending=0

## Status: DONE (2026-06-25)
