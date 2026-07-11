# Phase 13: Message an Agent by Claude-Code Session UUID

## Overview

기존 agent chat(phase-10)은 수신자를 **agent-id**로 특정한다. 이 phase는 **목적지 특정
방식만** 하나 더 추가한다 — 에이전트에 저장해 둔 **Claude Code 세션 UUID**로 수신자를
지정해 메시지를 보낼 수 있게 한다. 전송·저장·수신(idle 알림·합치기)·읽음 처리는 phase-10과
**완전히 동일**하고, "누구에게"를 푸는 방법만 `to`(id) → `to_session`(uuid) 갈래가 늘어난다.

세션 UUID는 **매니저 에이전트**가 지정/해제한다(에이전트 등록 시 함께 입력도 가능). 등록된
UUID가 없거나 그 에이전트의 **활성 세션이 없으면** 전송이 거부되고 `no active session`을
돌려줘 발신 에이전트가 상황을 인지한다.

## 결정 (기본값 — 미확답 시 채택)

- **활성 판정**: 대상 에이전트의 **tmux 세션이 살아있으면 활성**(`getTmuxSessions()`에 존재).
  간단·직관적. (더 엄격한 "CLI 실행 중"도 가능하나, CLI 재시작 순간 오탐 우려로 제외.)
- **지정 권한**: 등록 시 입력 + 매니저 사후 지정/해제 둘 다.
- **UUID 유일성**: `session_uuid`는 **UNIQUE** — 하나가 정확히 한 에이전트에 매핑.
- **신뢰 경계**: `session_uuid`는 **매니저 에이전트만 지정/제거**하며, Kratos는 그 값이 실제
  Claude Code 세션과 대응하는지 **신뢰성을 보장하지 않는다**(caller-asserted, 단순 조회 키).

## 데이터 모델 (migration 019)

```sql
ALTER TABLE agents ADD COLUMN session_uuid TEXT DEFAULT NULL;
CREATE UNIQUE INDEX idx_agents_session_uuid ON agents(session_uuid) WHERE session_uuid IS NOT NULL;
```

- nullable + partial UNIQUE: NULL은 여러 개 허용, 값이 있으면 전역 유일.
- SQLite는 부분 인덱스로 "NULL 다수 + 비NULL 유일"을 지원.

## API

### 1. 세션 UUID 지정/해제 — 매니저(agent-token)

phase-11 nickname 엔드포인트와 동일 패턴(매니저 토큰 → is_manager 검증).

```
PUT /api/agents/:id/session-uuid   Auth: agent token (호출자 is_manager=1)
  Body: { "session_uuid": "<uuid>" }   # 빈 문자열/null → 해제(NULL)
  → { "ok": true, "id": <id>, "session_uuid": "<값 or null>" }
```

검증:
- 401: 유효 토큰 아님 / 403: 호출자 `is_manager != 1` / 404: 대상 없음.
- 400: `session_uuid`가 문자열 아님.
- 409: 이미 다른 에이전트가 그 uuid 사용(UNIQUE 충돌) → `session_uuid already assigned`.
- 빈값/null → NULL(해제). trim 후 저장.

### 2. 등록 시 입력 (선택)

`POST /api/agents`, `POST /api/agents/spawn` body에 `session_uuid?` 옵션 허용.
- spawn은 매니저 전용이라 그대로 OK. 일반 등록(JWT)도 초기값 지정 가능.
- 여기서도 UNIQUE 충돌 시 409.

### 3. 메시지 전송 확장 — `to_session`

```
POST /api/messages          Auth: sender token
  Body: { "to": <id>, "body": ... }              # 기존 (id 지정)
     또는 { "to_session": "<uuid>", "body": ... }  # 신규 (세션 uuid 지정)
  → 성공: { "ok": true, "message_id": "<uuid>" }
  → 활성 세션 없음: 409 { "error": "no active session" }
```

수신자 해석 순서:
1. `to`가 있으면 기존대로 id로 조회(변경 없음).
2. `to`가 없고 `to_session`이 있으면:
   - `SELECT * FROM agents WHERE session_uuid = ?`
   - **없으면** → 409 `no active session` (미지정/오타/해제된 uuid 포함).
   - 있으면 tmux 라이브 체크(`getTmuxSessions().has(receiver.tmux_session)`).
     **죽었으면** → 409 `no active session`.
   - 살아있으면 → 그 에이전트를 수신자로 하여 **기존 저장·전달 로직 그대로**.
3. 둘 다 없으면 400 `to or to_session is required`.

> `no active session`은 "uuid에 매칭되는 활성 에이전트가 지금 없음"을 의미(미매칭+죽은세션
> 통합). 발신 에이전트는 이 응답으로 목적지 부재를 인지.

### 4. 조회 편의 (선택)

`GET /api/agents/directory` / `GET /api/agents/me` 응답에 `session_uuid` 포함해
매니저가 현재 매핑을 확인 가능(민감정보 아님, 피어 신뢰 전제 — phase-10과 동일).

## 가이드 (guide.js) — 산출물

AGENT TALK 섹션에 추가:

```bash
# ── 세션 UUID로 보내기 (id 대신 Claude Code 세션 uuid로 목적지 지정) ──
curl -s -X POST http://localhost:${port}/api/messages ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d "$(jq -n --arg s "<SESSION_UUID>" --arg b "리뷰 부탁해요" '{to_session:$s, body:$b}')"
#   성공 → { "ok": true, "message_id": "<uuid>" }
#   대상 활성 세션 없음 → 409 { "error": "no active session" }

# ── (매니저 전용) 에이전트에 세션 uuid 지정/해제 ──
curl -s -X PUT http://localhost:${port}/api/agents/<TARGET_ID>/session-uuid ${authHeader} \\
  -H "Content-Type: application/json" -d '{"session_uuid": "<uuid>"}'
#   해제: -d '{"session_uuid": ""}'
```

## 구현 순서

1. migration 019 (`session_uuid` + partial UNIQUE index)
2. `routes/agents.js`
   - `createAgentInFolder`/POST에 `session_uuid` 옵션(UNIQUE 충돌 409)
   - `PUT /api/agents/:id/session-uuid` (매니저 + 유일성 검증)
3. `routes/messages.js` — `POST /api/messages`에 `to_session` 갈래 + 활성 체크(`no active session`)
   - `getTmuxSessions` import 추가
4. (선택) directory/me 응답에 `session_uuid`
5. `routes/guide.js` — AGENT TALK에 세션 uuid 전송 + 매니저 지정법
6. `requirements/initialization.md` — 에이전트 API 표에 session-uuid 행, 메시지 전송에 to_session
7. 검증 (E2E)

## 검증 (E2E)

- [ ] migration 019 적용, uuid UNIQUE 강제(중복 지정 409)
- [ ] 비매니저 `PUT .../session-uuid` → 403 / 매니저 → 저장, 빈값 → NULL
- [ ] `to_session`으로 전송: 활성 에이전트 → 저장+전달(기존과 동일 동작)
- [ ] 미등록 uuid → **409 `no active session`**
- [ ] 등록됐지만 tmux 죽은 에이전트 → **409 `no active session`**
- [ ] `to`(id) 경로 무회귀 — 기존 전송/수신/읽음 그대로
- [ ] 가이드에 세션 uuid 전송/지정 섹션 포함
- [ ] 서버 테스트 무회귀

## Status: PLANNED (구현 전 사용자 확인 대기)
