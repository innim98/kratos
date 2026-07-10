# Phase 12: Manager Agent Spawns Agents (folder-scoped, capped)

## Overview

매니저 에이전트가 **API 하나로 새 에이전트 세션을 즉시 생성**할 수 있게 한다. 매니저는
폴더 경로·이름·별명을 주면, Kratos가 그 폴더에서 tmux 세션을 만들고 에이전트로 등록해
정보(토큰 포함)를 돌려준다. 단, **폴더당 에이전트 수 상한**을 넘으면 생성하지 않고
`too many agent for the folder` 를 반환해 매니저가 스스로 판단할 수 있게 한다.

phase-11에서 매니저 지정/닉네임을 도입했고, 이번에는 매니저에게 "팀 확장" 권한을 준다.

**권한 경계 (핵심):** 매니저 에이전트는 **생성만 가능, 삭제 불가.**
- 생성: 신규 `POST /api/agents/spawn` (agent token + `is_manager=1`).
- 삭제: 기존 `DELETE /api/agents/:id` 는 대시보드 JWT(`authenticate`) 전용이라 agent
  token으로는 애초에 호출 불가 → **추가 차단 코드 불필요**(현 구조가 이미 막음).

## 상한 설정 (전역 설정)

폴더당 에이전트 상한은 **전역 설정값 1개** (`max_agents_per_folder`, 기본 **4**).
모든 폴더에 동일 적용. 설정 화면(관리자)에서 변경.

### 저장: app_settings 키-값 테이블 (migration 018)

현재 앱 전역 설정을 담을 곳이 없다(projects는 별개). 범용 키-값 테이블 신설:

```sql
CREATE TABLE app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
INSERT INTO app_settings (key, value) VALUES ('max_agents_per_folder', '4');
```

- 값은 TEXT로 저장, 읽는 쪽에서 정수 파싱(`parseInt`, 실패/누락 시 기본 4로 폴백).
- 향후 다른 전역 설정도 같은 테이블 재사용.

## API

### 1. 설정 조회/변경 — 사람(JWT)

`server/routes/settings.js` 신설. projects 라우트의 `authenticateAny` / `requireAdmin`
패턴 재사용.

```
GET /api/settings                 Auth: 대시보드 JWT (any)
  → { "max_agents_per_folder": 4 }

PUT /api/settings                 Auth: 대시보드 JWT (admin)
  Body: { "max_agents_per_folder": 6 }
  → { "max_agents_per_folder": 6 }
```

- PUT 검증: `max_agents_per_folder` 는 1 이상 정수만 허용(범위 밖 400).
- 화이트리스트 키만 처리(임의 키 저장 차단).

### 2. 에이전트 생성 — 매니저 에이전트(agent-token)

```
POST /api/agents/spawn            Auth: agent token (호출자 is_manager=1)
  Body: { "folder": "/abs/path", "name": "worker-1", "nickname": "reviewer" }
  → 201 { id, name, tmux_session, folder, nickname, token, type }
  → 409 { "error": "too many agent for the folder" }   # 상한 초과
```

동작/검증 순서:
1. **인증**: 토큰→agent. 없으면 401.
2. **권한**: 호출자 `is_manager=1` 아니면 403 (`Manager agents only`).
3. **입력 검증**:
   - `folder`: 문자열, `path.resolve`로 정규화. 존재하는 디렉터리 아니면 400
     (`folder must be an existing directory`). 정규화값을 등록/카운트에 일관 사용.
   - `name`: 필수(비어있으면 400). `agents.name`은 UNIQUE라 중복 시 409
     (`name already exists`).
   - `nickname`: 선택. phase-11과 동일 규칙 — 문자열, `trim()` 후 10자 초과 400,
     빈값/누락 → NULL.
4. **상한 체크**: `SELECT COUNT(*) FROM agents WHERE folder = ?` (정규화 폴더).
   `>= max_agents_per_folder` 면 **409 `too many agent for the folder`** (세션 생성 안 함).
   - 카운트 대상은 그 폴더에 **등록된 전체 에이전트**(온/오프라인 무관). 죽은 세션도
     등록돼 있으면 자리 차지 — 매니저가 정리(삭제)는 못 하므로 사람이 정리해야 함(문서화).
5. **생성**: 기존 `POST /api/agents`의 folder 생성 로직 재사용 —
   `tmux new-session -d -s kratos-<ts> -c <folder>` → `agents` INSERT
   (name, tmux_session, token=uuid, sort_order=max+1, folder=정규화값, nickname) →
   `tmux set-environment` 로 `KRATOS_TOKEN`/`KRATOS_PORT` 주입.
   - `is_manager`는 항상 0으로 생성(매니저가 매니저를 양산하지 않음).
6. **응답**: 생성된 agent row + token. (매니저가 이 토큰을 새 세션에 전달할 수 있게.)

공통 생성 로직은 `POST /api/agents` 핸들러와 겹치므로 `lib/agents.js`(신규) 또는
agents.js 내부 헬퍼 `createAgentInFolder({ name, folder, nickname })`로 추출해 두 곳에서
호출(중복 제거).

### 3. self 조회 (기존, 변경 없음)

매니저는 `GET /api/agents/me`(phase-11)로 `is_manager` 확인 후 spawn 사용.

## 설정 UI (client/src/pages/Settings.jsx)

기존 섹션들("My Profile", "User Management", "Projects", "PTY Resources") 옆에
**"Agent Limits"** 섹션 추가:

- `max_agents_per_folder` 숫자 입력 + Save 버튼.
- 마운트 시 `GET /api/settings`로 로드, Save 시 `PUT /api/settings`.
- 관리자만 수정 가능(비관리자는 읽기 표시 또는 입력 비활성). 저장 성공/실패 메시지.
- 설명 문구: "Maximum agents a manager can spawn per folder (default 4)."

## 가이드 (guide.js) — 산출물

`GET /api/agents/:id/guide` plain-text에 **"AGENT SPAWN (매니저 전용)"** 섹션 추가:

```bash
# ═══════════════════════════════════════════
# AGENT SPAWN (매니저 전용)
# ═══════════════════════════════════════════
# 매니저만 사용할 수 있습니다(내가 매니저인지: GET /api/agents/me 의 is_manager).
# 폴더 경로·이름·별명을 주면 새 에이전트 세션을 즉시 만들어 토큰까지 돌려줍니다.
curl -s -X POST http://localhost:${port}/api/agents/spawn ${authHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"folder": "/abs/path/to/repo", "name": "worker-1", "nickname": "reviewer"}'
#   성공 → { "id":.., "name":"worker-1", "tmux_session":"kratos-..", "token":"..", .. }
#   초과 → { "error": "too many agent for the folder" }   (폴더당 상한 도달)
#
# 주의: 생성만 가능하고 삭제는 불가합니다(삭제는 대시보드 사용자만).
#       폴더당 상한은 전체 설정에서 조정(기본 4). 상한은 그 폴더의 죽은 세션도 포함해 셉니다.
```

## 구현 순서

1. migration 018 (`app_settings` + `max_agents_per_folder=4`)
2. `lib/settings.js` (또는 헬퍼) — `getSetting(db, key, fallback)` 정수 파싱 폴백
3. `routes/settings.js` — GET/PUT (admin), 화이트리스트+범위 검증. index.js 등록
4. `routes/agents.js`
   - 공통 `createAgentInFolder(...)` 헬퍼로 생성 로직 추출(기존 POST와 공유)
   - `POST /api/agents/spawn` (agent token + is_manager + 상한 체크 + 생성)
5. `routes/guide.js` — "AGENT SPAWN" 섹션
6. `client/src/pages/Settings.jsx` — "Agent Limits" 섹션
7. 검증 (E2E)

## 검증 (E2E)

- [ ] migration 018 적용, `GET /api/settings` → `{max_agents_per_folder:4}`
- [ ] 비관리자 JWT `PUT /api/settings` → 403 / 관리자 → 반영, 0·음수 → 400
- [ ] 비매니저 토큰 `POST /api/agents/spawn` → 403
- [ ] 매니저 토큰 spawn(유효 폴더) → 201, tmux 세션 생성 확인, 응답에 token/nickname
- [ ] 존재하지 않는 폴더 → 400 / 중복 name → 409 / 11자 nickname → 400
- [ ] 같은 폴더 4개까지 생성 후 5번째 → **409 `too many agent for the folder`**
      (설정 상향 후엔 추가 생성 성공)
- [ ] 매니저 토큰으로 `DELETE /api/agents/:id` → 인증 실패(삭제 불가) 확인
- [ ] 가이드에 AGENT SPAWN 섹션 포함
- [ ] 생성한 테스트 세션/에이전트 정리, 기존 서버 테스트 무회귀

## Status: PLANNED
