# Phase 11: Manager Agent + Agent Nickname

## Overview

두 개의 연결된 기능:

1. **Manager agent 지정/해제** — 대시보드 사용자가 Agents 목록에서 특정 에이전트를
   "매니저"로 지정한다. 매니저는 별도 권한(닉네임 지정)을 가진 에이전트.
2. **Agent nickname** — 매니저 에이전트가 API로 임의의 agent-id에 **닉네임(최대 10자)** 을
   붙여, 사용자에게 "이 에이전트는 xxx 하는 에이전트"임을 알려준다. 닉네임은 Agent name
   우측에 약한 색으로 표시된다.

관계: 매니저 지정은 **사람(대시보드 JWT)** 이 하고, 닉네임 지정은 **매니저 에이전트
(agent-token)** 가 한다. 닉네임은 매니저가 자기 팀을 사용자에게 설명하는 라벨.

## 데이터 모델 (migration 017)

```sql
-- 매니저 플래그 (사람이 토글)
ALTER TABLE agents ADD COLUMN is_manager INTEGER NOT NULL DEFAULT 0;
-- 닉네임 (매니저 에이전트가 부여, 최대 10자, NULL = 없음)
ALTER TABLE agents ADD COLUMN nickname TEXT DEFAULT NULL;
```

- 두 컬럼 모두 `agents`에 추가. `GET /api/agents`가 `...a`로 전체 컬럼을 반환하므로
  프런트엔드에 별도 쿼리 없이 `is_manager` / `nickname`이 그대로 흘러들어간다.
- 닉네임 길이 제한(10자)은 **API 계층에서 강제** (SQLite는 CHECK 없이 관대). 저장 전
  `trim()` 후 `.slice(0, 10)`가 아니라 **초과 시 400 거부**로 처리(잘림 은닉 방지).

## API

### 1. 매니저 지정/해제 — 사람(JWT)

기존 `PUT /api/agents/:id` (대시보드 JWT `authenticate`) 를 확장한다. 현재 `name`,
`issue_project`를 받는 핸들러에 `is_manager` 처리를 추가:

```
PUT /api/agents/:id          Auth: 대시보드 JWT
  Body: { "is_manager": true | false }   # 다른 필드와 함께 부분 업데이트 가능
  → 갱신된 agent row
```

- `'is_manager' in body` 일 때만 `UPDATE agents SET is_manager = ?` (0/1 정규화).
- 전용 엔드포인트 대신 기존 PUT 확장 — 토글 하나를 위한 라우트 신설 회피, 목록 리로드로
  즉시 반영.

### 2. 닉네임 지정 — 매니저 에이전트(agent-token)

신규 엔드포인트. `messages.js`의 `authAgent(request)` 패턴 재사용(토큰→agent row).

```
PUT /api/agents/:id/nickname   Auth: agent token (호출자가 is_manager=1 이어야 함)
  Body: { "nickname": "reviewer" }     # 최대 10자, 빈 문자열/null → 닉네임 제거
  → { "ok": true, "id": <id>, "nickname": "<저장값 or null>" }
```

검증/권한:
- 401: 유효한 agent token 아님.
- 403: 토큰 주인의 `is_manager != 1` (매니저만 닉네임 지정 가능).
- 404: 대상 `:id` 에이전트 없음.
- 400: `nickname`이 문자열 아님 / `trim()` 길이 > 10.
- 빈 문자열 또는 `null` → `nickname = NULL` (제거). 그 외 → `trim()` 값 저장.
- 매니저는 **자신 포함 임의의 agent-id**에 닉네임 지정 가능(팀 라벨링 목적).

### 3. self 조회에 매니저 여부 노출

기존 `GET /api/agents/me` 응답에 `is_manager` 추가 → 에이전트가 자신이 매니저인지(=
닉네임 API 사용 가능한지) 토큰만으로 확인 가능.

```
GET /api/agents/me    Auth: agent token
  → { "id", "name", "is_manager": 0|1 }   # nickname은 팀 라벨이라 굳이 self 노출 불필요
```

## UI (client/src/pages/AgentList.jsx)

### 매니저 토글 버튼 ("M")

리스트뷰 행 우측 메타 영역(현재 `Badge` + `timeAgo` + 삭제버튼)에서 **`timeAgo` 값
왼쪽**에 토글 버튼 추가:

- 라벨: 매니저면 `"M"`(강조색), 아니면 공백/약한 테두리(비매니저). `size="icon" h-6 w-6`
  정도의 작은 버튼, `variant`로 상태 구분.
- 클릭: `e.stopPropagation()` (행 클릭=상세이동과 충돌 방지) 후
  `PUT /api/agents/:id { is_manager: !a.is_manager }` → 성공 시 `loadAgents()`.
- title: "Set as manager" / "Unset manager".

### 닉네임 표시

리스트뷰 이름 영역(현재 `{a.name}` + `tmux_session`)에서 **name 우측에 `ml-2`** 로
닉네임을 약한 색으로:

```jsx
<span className="font-medium">{a.name}</span>
{a.nickname && (
  <span className="text-xs text-muted-foreground/70 ml-2">{a.nickname}</span>
)}
<span className="text-xs text-muted-foreground ml-2 font-mono">{a.tmux_session}</span>
```

- 색은 `tmux_session`(text-muted-foreground)보다 한 단계 더 약하게(`/70`)해서
  "부가 라벨" 느낌. 요구사항의 "좀더 약한색".
- 그리드뷰: 공간 협소 → 닉네임은 리스트뷰 우선. 매니저 "M" 배지는 그리드뷰 이름 옆에
  작게 넣을지 후속 결정(현재 범위: 리스트뷰 필수, 그리드는 선택).

## 가이드 (guide.js) — 산출물

`GET /api/agents/:id/guide` plain-text 응답에 **"AGENT NICKNAME (매니저 전용)"**
섹션 추가. 매니저 에이전트가 API Guide만 보면 닉네임 부여법을 알 수 있어야 함.

```bash
# ═══════════════════════════════════════════
# AGENT NICKNAME (매니저 전용)
# ═══════════════════════════════════════════
# 매니저로 지정된 에이전트만 사용할 수 있습니다. 내가 매니저인지 확인:
curl -s http://localhost:${port}/api/agents/me ${authHeader} | jq .is_manager   # 1 이면 매니저

# 다른 에이전트에 닉네임 부여 (최대 10자). 팀원 역할을 사용자에게 설명하는 라벨입니다.
curl -s -X PUT http://localhost:${port}/api/agents/<TARGET_ID>/nickname ${authHeader} \
  -H "Content-Type: application/json" \
  -d '{"nickname": "reviewer"}'
#   → { "ok": true, "id": <TARGET_ID>, "nickname": "reviewer" }

# 닉네임 제거 (빈 문자열):
curl -s -X PUT http://localhost:${port}/api/agents/<TARGET_ID>/nickname ${authHeader} \
  -H "Content-Type: application/json" -d '{"nickname": ""}'
```

주의 명시:
- 매니저가 아니면 403. 매니저 지정은 **대시보드 사용자**가 Agents 목록의 "M" 버튼으로만 가능.
- 10자 초과 시 400(잘리지 않음). 닉네임은 UI에서 agent name 우측에 표시됨.

## 구현 순서

1. migration 017 (`is_manager`, `nickname`)
2. `routes/agents.js`
   - `PUT /api/agents/:id` 에 `is_manager` 부분 업데이트 추가
   - `PUT /api/agents/:id/nickname` 신설 (agent-token + is_manager 권한 + 10자 검증)
3. `routes/messages.js` — `GET /api/agents/me` 응답에 `is_manager` 추가
4. `routes/guide.js` — "AGENT NICKNAME" 섹션 추가
5. `client/src/pages/AgentList.jsx` — 리스트뷰 "M" 토글 버튼 + 닉네임 `ml-2` 표시
6. 검증 (E2E)

## 검증 (E2E)

- [ ] 마이그레이션 적용 후 `is_manager`/`nickname` 컬럼 존재, 기본값 0/NULL
- [ ] 대시보드 JWT `PUT /api/agents/:id {is_manager:true}` → 목록에서 M 표시
- [ ] 비매니저 토큰으로 nickname PUT → **403**
- [ ] 매니저 토큰으로 nickname PUT → 저장, `/api/agents` 목록에 반영
- [ ] 11자 닉네임 → **400**, 빈 문자열 → NULL 제거
- [ ] `GET /api/agents/me` 가 `is_manager` 반환
- [ ] UI: M 버튼 클릭이 행 클릭(상세 이동)과 충돌 안 함(stopPropagation), 닉네임이
      name 우측 약한색 `ml-2` 로 표시
- [ ] 가이드 응답에 AGENT NICKNAME 섹션 포함
- [ ] 기존 서버 테스트 무회귀

## Status: PLANNED
