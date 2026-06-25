# Phase 3: Agent Group Chat

> **상태: 폐기됨 (Phase 7에서 제거)**

## Overview

Kratos 내 그룹 채팅. 사용자와 에이전트가 동시 참여. 사용자는 WS 실시간, 에이전트는 tmux 알림 → API 폴링 방식.

## 핵심 흐름

```
[User A]                  [Kratos Server]              [Agent B (tmux)]
   |                            |                            |
   |-- WS: send message ------>|                            |
   |                            |-- store in DB              |
   |                            |-- WS broadcast to users -->|
   |                            |                            |
   |                            |-- tmux send-keys --------->|
   |                            |   "check message on        |
   |                            |    kratos agent chat #42"  |
   |                            |                            |
   |                            |       [Agent sees terminal notification]
   |                            |                            |
   |                            |<-- GET /api/chats/42/msgs -|
   |                            |-- return messages -------->|
   |                            |                            |
   |                            |<-- POST /api/chats/42/msgs |
   |                            |    { body: "답변입니다" }   |
   |                            |                            |
   |<-- WS: new message -------|-- store + broadcast         |
```

## Data Model

### DB Tables

```sql
-- Chat rooms
CREATE TABLE chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_by_type TEXT NOT NULL,  -- 'user' | 'agent'
  created_by_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Chat participants
CREATE TABLE chat_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  participant_type TEXT NOT NULL,  -- 'user' | 'agent'
  participant_id INTEGER NOT NULL,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(chat_id, participant_type, participant_id)
);

-- Messages
CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL,  -- 'user' | 'agent'
  sender_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## API

### Chat Management

```
POST /api/chats
  Body: { name, agent_ids: [1, 2, 3] }
  → 채팅방 생성 + 에이전트 자동 참여 + 생성자 자동 참여
  → 200: { id, name, participants }

GET /api/chats
  → 내가 참여 중인 채팅 목록
  → 200: [{ id, name, participants, lastMessage, unreadCount }]

GET /api/chats/:id
  → 채팅방 상세 (참여자 목록 포함)
  → 200: { id, name, participants }

DELETE /api/chats/:id
  → 채팅방 삭제 (생성자 또는 admin만)
```

### Messages

```
GET /api/chats/:id/messages
  Query: ?after=<message_id>&limit=50
  → 200: [{ id, sender_type, sender_id, sender_name, body, created_at }]

POST /api/chats/:id/messages
  Body: { body }
  → 메시지 저장 + WS broadcast + 에이전트 tmux 알림
  → 200: { id, sender_type, sender_id, body, created_at }
```

### Agent Notification

```
POST /api/chats/:id/notify
  (내부 호출 - 메시지 POST 시 자동)
  → 채팅방의 에이전트 참여자들에게 tmux send-keys 실행
```

## Agent Terminal Notification

메시지가 도착하면 해당 채팅방의 에이전트에게 tmux로 알림:

```javascript
// server/lib/chat-notify.js
import { execSync } from 'child_process';

function notifyAgent(tmuxSession, chatId, senderName) {
  const msg = `\n# 💬 New message on Kratos chat #${chatId} from ${senderName}\n# curl -s -H "Authorization: Bearer $KRATOS_TOKEN" http://localhost:15001/api/chats/${chatId}/messages?after=0 | jq\n`;
  try {
    // Escape for tmux
    execSync(`tmux send-keys -t ${tmuxSession} ${JSON.stringify(msg)} Enter`, {
      timeout: 3000,
    });
  } catch {}
}
```

에이전트가 Claude Code라면 이 터미널 메시지를 보고 API를 호출하여 메시지를 읽고 응답.

## WebSocket

기존 `/ws/terminal` WS에 chat 이벤트를 추가:

```json
// Server → Client (new message in any joined chat)
{
  "type": "chat-message",
  "chatId": 42,
  "message": {
    "id": 100,
    "sender_type": "agent",
    "sender_id": 3,
    "sender_name": "hotel-agent",
    "body": "작업 완료했습니다",
    "created_at": "2026-06-05T10:30:00Z"
  }
}
```

## UI

### 진입점

- Sidebar 메뉴에 `Chat` 버튼 추가
- 또는 Agent Detail 패널의 탭에 `Chat` 추가

### Chat List

```
┌─────────────────────────────────────┐
│ Chats                     [+ New]   │
├─────────────────────────────────────┤
│ #42 Frontend Bug Fix        (3) ●  │
│   hotel-agent: 수정했습니다   2m    │
│ #41 Deploy Plan             (2)    │
│   admin: 배포 시작하겠습니다  1h    │
└─────────────────────────────────────┘
```

### Chat Room

```
┌─────────────────────────────────────┐
│ ← #42 Frontend Bug Fix             │
│ Participants: admin, hotel, juliet  │
├─────────────────────────────────────┤
│ [admin] 14:20                       │
│ 로그인 버그 좀 봐줘                  │
│                                     │
│ [hotel-agent] 14:22                 │
│ 확인 중입니다. auth.js 수정 필요     │
│                                     │
│ [juliet-agent] 14:23                │
│ 저도 같은 이슈 발견했습니다          │
├─────────────────────────────────────┤
│ [input......................] [▶]   │
└─────────────────────────────────────┘
```

### New Chat Dialog

```
┌─────────────────────────────────────┐
│ New Chat                            │
│                                     │
│ Name: [Frontend Bug Fix        ]    │
│                                     │
│ Agents:                             │
│ ☑ hotel-agent                       │
│ ☑ juliet-agent                      │
│ ☐ bravo-agent                       │
│                                     │
│                    [Cancel] [Create] │
└─────────────────────────────────────┘
```

## Implementation Order

1. **DB migration 008**: chats, chat_participants, chat_messages 테이블
2. **Chat API**: CRUD + messages
3. **Agent notification**: tmux send-keys
4. **WS broadcast**: chat-message 이벤트
5. **Chat UI**: 목록 + 채팅방 + 생성 다이얼로그
6. **Sidebar 진입점**: Chat 버튼 추가

## Design Decisions

### 진입점
- Agent Detail의 탭에 `Chat` 추가 (todo, issues와 동일 패턴)
- 탭 클릭 → 해당 에이전트가 참여 중인 채팅 목록 표시
- 새 채팅 생성 시 에이전트 멀티 선택

### 채팅 생성 플로우
1. 사용자가 Chat 탭에서 `+ New` 클릭
2. 참여할 에이전트 선택 (멀티셀렉트)
3. 생성 → 각 에이전트의 tmux 세션에 초대 메시지 전송:
   ```
   # 💬 Kratos Chat #42 에 초대되었습니다
   # 참여하려면: curl -s -H "Authorization: Bearer $TOKEN" \
   #   http://localhost:15001/api/chats/42/messages | jq
   ```
4. 초대 메시지 다시 보내기 버튼 제공 (에이전트가 못 받았을 때)

### @멘션 알림
- `@agent-name` → 해당 에이전트의 tmux 세션에 알림 전송
- `@all` → 채팅방의 모든 에이전트 참여자에게 알림 전송
- 멘션이 없는 일반 메시지는 알림 없음
- 파싱: `@`로 시작하는 단어를 추출 → 참여자 이름 또는 `all`과 매칭

### 채팅방 이름
- 사용자가 직접 입력

### 에이전트 인증
- 에이전트는 기존 agent token (`Bearer $KRATOS_TOKEN`)으로 채팅 API 인증
- guide 페이지(`/api/agents/:id/guide`)에 채팅 읽기/쓰기 가이드 추가

### tmux 알림 메시지 포맷
```
# 💬 @hotel-agent: New message on Kratos chat #42 from admin
# Read: curl -s -H "Authorization: Bearer $TOKEN" http://localhost:15001/api/chats/42/messages?after=<last_id> | jq
```
