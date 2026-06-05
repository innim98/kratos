# Phase 1: Agent Management

## Overview

에이전트 목록 관리 및 동시 접속 제어 기능.

## Features

### 1. Agent Rename (기존 기능 개선)

이미 `PUT /api/agents/:id` + AgentDetail 헤더에서 이름 변경 가능. 추가 작업 없음.

### 2. Agent Ordering

에이전트 목록에서 순서를 변경. 위로/아래로 버튼으로 조작.

#### DB

```sql
-- migration 007
ALTER TABLE agents ADD COLUMN sort_order INTEGER DEFAULT 0;
```

#### API

```
PUT /api/agents/:id/order  { direction: 'up' | 'down' }
```

- `up`: 바로 위 에이전트와 sort_order 교환
- `down`: 바로 아래 에이전트와 sort_order 교환
- 기존 에이전트들의 초기 sort_order = id (migration에서 설정)

#### UI

- Sidebar 에이전트 목록: `ORDER BY sort_order ASC, id ASC`
- 각 에이전트 옆에 ▲/▼ 버튼 (호버 시 표시, **admin만** 표시)
- AgentList 페이지에서도 동일 (admin만)
- 일반 사용자는 정렬된 순서로만 봄

### 3. Agent Lock

동시에 같은 에이전트를 여러 브라우저/기기에서 조작하면 충돌 가능. Lock으로 배타적 접근 제어.

#### 핵심 흐름

```
[Browser A]                    [Server]                     [Browser B]
    |                              |                              |
    |-- open agent #2 ----------->|                              |
    |   lock(agent=2,             |                              |
    |     user=alice,             |                              |
    |     clientId=abc123)        |                              |
    |<-- lock acquired ---------- |                              |
    |                              |                              |
    |   (30초마다 renew) -------->|                              |
    |                              |                              |
    |                              |<-- open agent #2 ---------- |
    |                              |    lock(agent=2,             |
    |                              |      user=bob,              |
    |                              |      clientId=xyz789)       |
    |                              |-- 409: locked by            |
    |                              |   alice:abc123 ------------>|
    |                              |                              |
    |                              |              [팝업: 강제로 열까요?]
    |                              |                              |
    |                              |<-- force-lock ------------- |
    |                              |    (agent=2, clientId=xyz789)|
    |                              |                              |
    |<-- WS: lock-stolen -------- |-- lock acquired ----------->|
    |   by bob:xyz789             |                              |
    |                              |                              |
    | [팝업: 접속 끊김]            |                              |
    | → 에이전트 목록으로          |                              |
```

#### Client ID

- 브라우저 탭별로 `crypto.randomUUID()` 생성
- `sessionStorage`에 저장 (탭 닫으면 사라짐)
- 같은 사용자가 여러 탭을 열면 각각 다른 clientId

#### DB

```sql
-- migration 007 (sort_order와 함께)
CREATE TABLE agent_locks (
  agent_id INTEGER PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  client_id TEXT NOT NULL,
  acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
```

#### API

```
POST /api/agents/:id/lock
  Body: { clientId }
  → 200: { locked: true, username, clientId, expiresAt }
  → 409: { locked: false, holder: { username, clientId } }

POST /api/agents/:id/lock/force
  Body: { clientId }
  → 200: { locked: true, username, clientId, expiresAt }
  (기존 lock holder에게 WS로 lock-stolen 이벤트 전송)

POST /api/agents/:id/lock/renew
  Body: { clientId }
  → 200: { expiresAt }
  → 409: { error: 'not lock holder' }

DELETE /api/agents/:id/lock
  Body: { clientId }
  → 200: { released: true }
```

- Lock 유효기간: 60초
- 클라이언트 renew 주기: 30초
- 만료된 lock은 다음 lock 요청 시 자동 정리

#### WS Events

```json
{ "type": "lock-stolen", "agentId": 2, "by": "bob:xyz789" }
```

- 기존 WS 연결(`/ws/terminal`)로 전송
- Dashboard에서 수신하여 팝업 표시 + 에이전트 목록으로 이동

#### Client Flow

**에이전트 진입 시:**
1. `POST /api/agents/:id/lock { clientId }`
2. 성공 → 터미널 attach, 30초 interval로 renew 시작
3. 409 → 팝업: `{username}:{clientId}가 사용 중. 강제로 열까요?`
4. 강제 열기 → `POST /api/agents/:id/lock/force { clientId }`

**에이전트 이탈 시:**
1. `DELETE /api/agents/:id/lock { clientId }`
2. renew interval 정리

**lock-stolen 수신 시:**
1. 팝업: `{by}로 인해 접속이 끊어졌습니다`
2. 확인 → 에이전트 목록으로 이동

## Implementation Order

1. **DB migration 007**: `sort_order` + `agent_locks` 테이블
2. **Agent ordering API + UI**: 간단한 swap 로직
3. **Lock API**: lock/force/renew/release 엔드포인트
4. **Lock client**: clientId 생성, lock 획득/갱신, force 팝업
5. **WS lock-stolen**: 서버→클라이언트 이벤트
6. **Lock UI**: Sidebar에 lock 상태 표시 (잠금 아이콘 + holder 이름)

## Design Decisions

- **Lock 표시**: Sidebar에서 잠긴 에이전트 클릭 가능. 클릭 시 holder 정보 팝업 + 강제 열기 옵션 제공
- **순서 변경 권한**: admin만 가능. 일반 사용자는 정렬된 순서로만 봄

## Status: COMPLETED (2026-06-03)
