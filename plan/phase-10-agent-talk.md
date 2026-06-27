# Phase 10: Agent Talk (agent-to-agent messaging)

## Overview

에이전트끼리 메시지를 주고받는 기능. Kratos가 메시지의 **단일 진실원천(DB)** 이자
중개자 역할을 한다. 발신 에이전트는 메시지 전문을 Kratos에 보내고, Kratos가 저장 후
수신 에이전트가 **idle**이 되는 순간 tmux로 도착 알림을 전달한다. (phase-9 status
subscription의 deferred 전달 패턴을 재사용·확장)

phase-9와의 차이: phase-9는 "다른 에이전트가 특정 상태가 됨"을 알림. phase-10은
"특정 에이전트가 나에게 메시지를 보냄"을 알림 + 메시지 본문 저장/조회/읽음관리.

## 저장 방식: DB (결정)

원래 구상의 `agent-talk/{sender}_to_{receiver}.md` 파일 대신 **DB 테이블**에 저장한다.
- read/unread 상태, 신규/전체 분류, 메시지 목록 조회가 전부 네이티브 쿼리로 해결
- Kratos가 쓰기를 중개하므로 파일은 중복 (파일 권한도 같은 OS 유저라 어차피 강제 불가)
- 정리(retention)도 DELETE 쿼리로 단순
- (사람이 읽을 `.md` 미러가 필요하면 후속으로 `tmp/agent-talks/`에 추가 — 현재 범위 외)

## 데이터 모델 (migration 016)

```sql
CREATE TABLE agent_messages (
  id          TEXT PRIMARY KEY,            -- message-id (uuid, Kratos 생성)
  sender_id   INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  receiver_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  read_at     TEXT DEFAULT NULL,           -- NULL = unread
  notified_at TEXT DEFAULT NULL            -- NULL = tmux 알림 아직 안 보냄
);
CREATE INDEX idx_msg_pair  ON agent_messages(sender_id, receiver_id);
CREATE INDEX idx_msg_inbox ON agent_messages(receiver_id, read_at);

-- 수신 옵트인 플래그
ALTER TABLE agents ADD COLUMN wants_message_notify INTEGER NOT NULL DEFAULT 0;
```

- `ON DELETE CASCADE`: 에이전트 삭제 시 그 메시지도 제거 (삭제 차단 안 함 — phase 015 취지 유지).
  재생성 시 새 id라 이전 대화 수신 불가 — 요구사항상 허용됨(#7).
- 메시지 상태: `unread+un-notified` → (idle 알림) `unread+notified` → (read API) `read`.

## API (전부 agent-token 인증)

### 1. 에이전트 디렉터리
```
GET /api/agents/directory
  → [{ "id": 12, "name": "mike-art-director" }, ...]
```
모든 에이전트의 `{agent-id, agent-name}` 목록. agent-id는 `agents.id`(DB 영속,
재부팅·Kratos 재시작에 불변).

### 2. 메시지 전송 (Kratos가 대행 write)
```
POST /api/messages          Auth: sender token
  Body: { "to": <receiver-id>, "body": "<message text>" }
  → { "ok": true, "message_id": "<uuid>" }
```
- Kratos가 message-id 생성, DB 저장(sender=토큰 주인).
- 저장 직후 전달 시도: 수신자가 지금 전달 가능하면 즉시 알림, 아니면 보류(다음 idle).

### 3. 메시지 목록 (신규/전체 분류)
```
GET /api/messages?from=<id>&to=<id>      Auth: 둘 중 한쪽 token
  → {
      "all":    [{ "message_id", "timestamp", "body", "read": bool }, ...],
      "unread": [ ...read=false 부분집합... ]
    }
```
- `from→to` 방향 대화. 호출자는 from 또는 to 여야 함.

### 4. 읽음 처리 (read만 가능, unread 복귀 불가)
```
PUT /api/messages/read       Auth: receiver token
  Body: { "from": <sender-id> }          # 또는 { "message_ids": [...] }
  → { "ok": true, "marked": <count> }
```

### 5. 수신 옵트인
```
POST   /api/messages/subscribe    Auth: agent token   # wants_message_notify=1
DELETE /api/messages/subscribe    Auth: agent token   # =0
```

## 전달(알림) 로직

phase-9의 `processStatusChange`와 동일 지점(`POST /api/agents/status`)에서 동작.

**전달 자격 (모두 충족):**
1. 수신자 `wants_message_notify = 1` (옵트인)
2. 수신자가 **online/offline이 아님** = `reported_status`가 설정됨(상태 hook 등록) 이고,
   전달 시점에 `reported_status == 'idle'`
3. 수신자 tmux 세션 살아있음 + claude/codex 실행 중 (phase-9 `isAgentCliRunning` 재사용)
4. `read_at IS NULL AND notified_at IS NULL` 인 메시지가 존재

**트리거:**
- **신규 메시지(POST /api/messages)**: 수신자가 지금 자격 충족 → 즉시 전달, 아니면 대기.
- **수신자 idle 보고**: un-notified unread 있으면 전달.

**합치기(#4):** idle 전환 시 미알림 미읽음 메시지가 여러 개여도 **알림은 1회**.
전달하면서 그 시점의 unread 전부 `notified_at` 마킹 → 같은 메시지로 재알림 안 함.
(읽지 않은 채 새 메시지가 또 오면 그건 un-notified라 다음 idle에 다시 1회 알림)

**알림 문구(#3):** 가장 오래된 unread의 message-id·timestamp 동봉, 발송 시점 명시:
```
(From Kratos : Kratos sent this at <now_unix>) message from <sender-id> is received — oldest unread <message-id> @ <created_unix>
```
`tmux send-keys -l` 로 텍스트 + 별도 `Enter` (phase-9와 동일).

## 가이드 (guide.js) — 산출물

Kratos UI의 **"API Guide" 버튼**(AgentDetail)을 누르면 터미널로
`curl -s http://localhost:<port>/api/agents/<id>/guide` 가 실행되고, 그 응답
(`server/routes/guide.js`의 `GET /api/agents/:id/guide` plain-text)이 에이전트에게
바로 보인다. **이 응답에 "AGENT TALK (에이전트 간 메시지)" 섹션을 추가**해서, 에이전트가
API Guide만 보면 메시지 송수신법을 즉시 알 수 있게 한다.

phase-8/9 가이드와 동일하게 토큰/포트는 `tmux show-environment`로 읽는다.
아래 내용이 그대로 가이드에 들어가야 한다(구현 시 `${port}`/`${id}`/`${authHeader}` 치환):

```bash
# ── 0. 수신 준비 (메시지 받으려면 필수) ──
#   ① phase-8 상태 hook이 등록돼 있어야 함(online/offline 상태면 수신 불가)
#   ② 아래 옵트인 호출
curl -X POST http://localhost:${port}/api/messages/subscribe ${authHeader}

# ── 1. 상대 찾기 (전체 에이전트 id/name) ──
curl -s http://localhost:${port}/api/agents/directory ${authHeader} | jq

# ── 2. 메시지 보내기 (Kratos가 대신 저장) ──
curl -X POST http://localhost:${port}/api/messages ${authHeader} \
  -H "Content-Type: application/json" \
  -d '{"to": <RECEIVER_ID>, "body": "리뷰 부탁해요"}'
#   → { "ok": true, "message_id": "<uuid>" }

# ── 3. 메시지 받기 흐름 ──
#   tmux로 다음과 같은 알림이 옴(내가 idle일 때):
#   (From Kratos : Kratos sent this at <unix>) message from <sender-id> is received — oldest unread <message-id> @ <unix>
#   → 받으면 아래로 목록 조회:
curl -s "http://localhost:${port}/api/messages?from=<SENDER_ID>&to=${id}" ${authHeader} | jq
#   응답: { "all": [...], "unread": [...] }

# ── 4. 읽음 처리 ──
curl -X PUT http://localhost:${port}/api/messages/read ${authHeader} \
  -H "Content-Type: application/json" \
  -d '{"from": <SENDER_ID>}'

# ── 옵트인 해제 ──
curl -X DELETE http://localhost:${port}/api/messages/subscribe ${authHeader}
```

가이드에는 다음 주의도 명시한다:
- 메시지를 받으려면 **① 상태 hook 등록(phase-8) + ② `/api/messages/subscribe`** 둘 다 필요.
- 알림은 내가 **idle일 때만** 도착하며, 안 읽은 메시지가 쌓여도 **한 번만** 옴.
- 본문은 Kratos가 내 token 명의로만 저장하므로 발신자 위조 불가.

## 위험 / 한계 (명시)

- **권한 강제 없음(#2/#9)**: 같은 OS 유저라 파일 권한 무의미 → Kratos가 쓰기를 전담해
  강제. sender는 자기 token으로만 자기 명의 메시지 생성 가능(위조 불가). receiver_id 등
  입력은 정수 검증.
- **stuck(#5)**: 수신자가 영영 idle이 안 되면 알림 안 감(허용됨). 단 메시지는 DB에 남아
  목록 API로 언제든 조회 가능.
- **재생성(#7)**: 에이전트 삭제→재생성 시 새 id, 이전 메시지 CASCADE 삭제. 허용됨.
- **증식(#8)**: DB라 무한 증식 위험 낮음. retention 정책(예: read 후 N일 경과분 정리)은
  후속 결정 — 기본은 전체 보존.
- **디렉터리 노출(#9)**: 모든 에이전트가 전체 로스터(id+name) 열람 가능 — 피어 신뢰 전제.

## 구현 순서

1. migration 016 (agent_messages + wants_message_notify)
2. `lib/agent-talk.js` — 전달 자격 판정 + 알림 전송 + 합치기 (phase-9 헬퍼 재사용)
3. routes: directory / messages(POST·GET) / messages/read / messages/subscribe
4. `POST /api/agents/status` idle flush에 메시지 전달 연결
5. **guide.js — "AGENT TALK" 섹션 추가** (위 '가이드' 산출물 전체: 수신 준비/디렉터리/
   송신/조회/읽음/옵트인 + 주의사항). 이 가이드가 있어야 에이전트가 사용법을 알 수 있으므로
   phase 완료의 필수 산출물.
6. E2E 검증 (가짜 claude 세션으로 phase-9 방식): 송신→idle 알림 1회→목록 조회→읽음 처리,
   옵트인 안 한 수신자/ online·offline 수신자에는 알림 안 감 확인

## 검증 (E2E, 2026-06-28)

가짜 claude tmux 세션 + 임시 송수신 에이전트로 확인:
- ✅ `GET /api/agents/directory` — 전체 {id, name} 반환
- ✅ 송신(POST /api/messages) → 수신자 idle → 즉시 1회 알림, 포맷 일치
- ✅ `GET /api/messages?from=&to=` — all/unread 분류 반환
- ✅ `PUT /api/messages/read` → unread 0
- ✅ 보류: 수신자 working 중 2건 → 알림 0
- ✅ 합치기: idle 전환 → 정확히 1회
- ✅ 자격: opt-out 수신자 알림 X / online(reported_status=null) 수신자 알림 X
- ✅ 기존 서버 테스트 85개 무회귀

구현 파일:
- `server/migrations/016_agent_messages.sql`
- `server/lib/agent-talk.js` — 전달 자격 판정 + 합치기
- `server/routes/messages.js` — directory / messages(POST·GET) / read / subscribe
- `server/routes/agents.js` — status idle flush 연결
- `server/routes/guide.js` — "AGENT TALK" 가이드 섹션 (API Guide 버튼 노출)
- `server/index.js` — 라우트 등록

## Status: DONE (2026-06-28)
