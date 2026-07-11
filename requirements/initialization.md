# Kratos - Agent Dashboard

## Overview

JWT 인증 기반의 에이전트 관리 대시보드. tmux 세션으로 실행중인 에이전트들을 웹에서 모니터링하고 조작한다. Foxtrot의 인증 구조를 차용하되, node-pty 직접 관리 대신 tmux를 중간 레이어로 사용한다.

## Foxtrot vs Kratos 비교

| | Foxtrot | Kratos |
|---|---|---|
| 프로세스 관리 | `node-pty`로 shell 직접 spawn | tmux 세션에 연결 |
| Scrollback | 서버 메모리 (100KB/탭) | tmux buffer (`capture-pane`) |
| 세션 수명 | 서버 프로세스에 종속 | tmux가 독립 관리, 서버 재시작해도 유지 |
| 멀티탭 | 자체 탭 관리 (sessions Map) | tmux session/window 구조 그대로 사용 |
| UI | 터미널 전용 (xterm.js 풀스크린) | 대시보드 + 터미널 뷰 |

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | React + Vite | SPA, 컴포넌트 기반 UI |
| Backend | Fastify | 고성능, 스키마 기반 validation |
| Database | better-sqlite3 (WAL) | 인증 + 에이전트 메타데이터 저장 |
| Auth | @fastify/jwt + bcryptjs | JWT 인증 |
| WebSocket | @fastify/websocket | 터미널 실시간 스트리밍 |
| Terminal | xterm.js + node-pty → `tmux attach` | 터미널 렌더링 + tmux 연결 |
| Shared Screen | puppeteer + rrweb (record/replay) | 서버 렌더링 + DOM 미러링 |

---

## 아키텍처

### tmux 연동 방식

```
┌─────────────┐  WebSocket  ┌──────────────┐  node-pty  ┌───────────────────┐
│    Client    │◄──────────►│    Server     │◄─────────►│ tmux attach -t X  │
│ React+xterm │             │   (Fastify)   │            └───────┬───────────┘
└─────────────┘             └──────────────┘                    │
       │                         │                      ┌───────▼───────────┐
       │  REST API               │  better-sqlite3      │   tmux server     │
       │◄───────────────────────►│◄────────────────►    │  ┌─────────────┐  │
                                 │  kratos.db            │  │ session: a1 │  │
                                                        │  │ session: a2 │  │
                                                        │  └─────────────┘  │
                                                        └───────────────────┘
```

### 에이전트 타입: unmanaged-agent

"Unmanaged"는 Kratos가 생성/종료를 관리하지 않는다는 의미. 외부에서 이미 실행 중인 tmux 세션을 Kratos에 등록하여 웹에서 모니터링/조작한다.

- 에이전트 메타데이터는 **SQLite `agents` 테이블**에 저장
- 실시간 상태(online/offline)는 tmux에서 조회
- **모든 로그인 유저가 모든 unmanaged-agent를 볼 수 있음** (per-user 필터링 없음)

### 데이터 모델

DB 스키마는 **마이그레이션 기반 버저닝**으로 관리한다.

#### 마이그레이션 시스템

```sql
-- 마이그레이션 추적 테이블 (자동 생성)
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

마이그레이션 파일은 `migrations/` 디렉토리에 순번으로 관리:

```
migrations/
├── 001_create_users.sql
├── 002_create_agents.sql
└── ...
```

서버 시작 시 아직 적용되지 않은 마이그레이션을 순서대로 실행한다.

#### 001_create_users.sql
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user'  -- 'admin' (최초 가입자) | 'user'
);
```

#### 002_create_agents.sql
```sql
CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,          -- 표시 이름 (예: "code-reviewer")
  tmux_session TEXT UNIQUE NOT NULL,  -- tmux 세션 이름 (예: "agent-cr-01")
  type TEXT NOT NULL DEFAULT 'unmanaged', -- 에이전트 타입
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Webview 연동 메커니즘

에이전트(Claude, Codex 등)가 tmux 안에서 로컬 웹 서버를 띄우면,
Kratos API로 웹뷰를 등록하여 대시보드에서 볼 수 있다.

웹뷰 패널에는 **두 가지 모드**가 있다:

| 모드 | 설명 | 상태 공유 |
|------|------|-----------|
| **Local** | 프록시를 통해 각 브라우저가 독립적으로 접속 | 없음 (각자 별도 DOM) |
| **Shared Screen** | Kratos가 Puppeteer로 렌더링, rrweb로 DOM 공유 | 있음 (모든 사용자 동일 화면) |

#### 에이전트 → Kratos 등록

```bash
# 웹뷰 등록
curl -X POST http://localhost:17000/api/agents/1/webview \
  -H "Content-Type: application/json" \
  -d '{"port": 5173, "path": "/"}'

# 웹뷰 해제
curl -X DELETE http://localhost:17000/api/agents/1/webview
```

- localhost에서만 접근 가능 (JWT 불필요)
- 등록/해제 시 WebSocket으로 클라이언트에 알림

#### Mode 1: Local (프록시)

각 브라우저가 Kratos 프록시를 통해 에이전트의 로컬 서버에 **독립적으로** 접속.
사용자마다 별도의 DOM 상태를 가진다.

```
브라우저 A ─┐                              ┌─► localhost:5173 (각각 독립 요청)
브라우저 B ─┼─ /api/agents/1/webview/proxy/ ─┤
브라우저 C ─┘                              └─► 각 브라우저가 별도 DOM
```

- iframe `src="/api/agents/:id/webview/proxy/"`
- HTML, JS, CSS, 이미지 등 모든 리소스 프록시
- WebSocket 업그레이드도 프록시 (HMR 등)
- 경로 매핑: `/proxy/foo/bar` → `localhost:<port><path>/foo/bar`

용도: 개발 중 자기만의 인터랙션이 필요할 때 (폼 입력, 디버깅 등)

#### Mode 2: Shared Screen (rrweb DOM 미러링)

Kratos 서버가 **유일한 브라우저**(Puppeteer)로 페이지를 로드하고,
rrweb로 DOM 변경을 캡처하여 모든 클라이언트에 스트리밍한다.

```
                          Kratos 서버
                    ┌─────────────────────────┐
                    │  Puppeteer (headless)    │
                    │  └─ localhost:5173 로드   │
                    │  └─ rrweb record 주입    │
                    │     │                    │
                    │     ▼                    │
                    │  DOM snapshot (초기)      │
                    │  + mutation events (실시간)│
                    └────────┬────────────────┘
                             │ WebSocket
                    ┌────────┼────────┐
                    ▼        ▼        ▼
                 Browser A  Browser B  Browser C
                 (rrweb     (rrweb     (rrweb
                  replay)    replay)    replay)
```

**서버 측 (Puppeteer + rrweb record):**
1. 웹뷰 등록 시 Puppeteer로 `localhost:<port><path>` 로드
2. rrweb record 스크립트 주입 → DOM 스냅샷 + mutation 이벤트 캡처
3. 이벤트를 메모리에 버퍼링 (최근 스냅샷 + 이후 mutations)

**클라이언트 접속 시:**
1. 최근 full snapshot 전송 → rrweb replay가 DOM 재구성
2. 이후 incremental mutation만 실시간 스트리밍 (수 KB/초)

**사용자 입력 (역방향):**
1. 클라이언트에서 클릭/키 입력 이벤트 캡처
2. WebSocket → Kratos 서버
3. Puppeteer에 이벤트 주입 (`page.mouse.click()`, `page.keyboard.type()`)
4. DOM 변경 발생 → rrweb가 mutation 캡처 → 모든 클라이언트에 전파

```
사용자 A가 input에 "hello" 입력
  → WS { type: "shared-input", event: { type: "keypress", key: "h", ... } }
  → Kratos → Puppeteer page.keyboard.type("h")
  → DOM 변경 → rrweb mutation event
  → 모든 클라이언트 (A, B, C) 에서 input에 "h" 표시
```

용도: 팀 전체가 동일한 화면을 모니터링할 때, 프레젠테이션, 페어 리뷰

#### 실시간 알림

```json
{ "type": "webview-update", "agentId": 1, "webview": { "port": 5173, "path": "/" } }
{ "type": "webview-update", "agentId": 1, "webview": null }
```

### 핵심 흐름

#### 1. 에이전트 목록 조회 (REST)

SQLite에서 등록된 에이전트 목록을 읽고, tmux 상태를 합쳐서 응답:

```javascript
// 1. DB에서 등록된 에이전트 목록
const agents = db.prepare('SELECT * FROM agents').all();

// 2. tmux에서 현재 살아있는 세션 목록
// tmux list-sessions -F '#{session_name}\t#{session_activity}'
const liveSessions = getTmuxSessions(); // Set<string>

// 3. 합치기
agents.map(a => ({
  ...a,
  status: liveSessions.has(a.tmux_session) ? 'online' : 'offline',
  lastActivity: liveSessions.get(a.tmux_session)?.activity || null,
}));
```

→ JSON 응답:
```json
[
  { "id": 1, "name": "code-reviewer", "tmux_session": "agent-cr-01", "type": "unmanaged", "status": "online", "lastActivity": 1713410000 },
  { "id": 2, "name": "deploy-bot", "tmux_session": "agent-deploy", "type": "unmanaged", "status": "offline", "lastActivity": null }
]
```

#### 2. 에이전트 터미널 접속 (WebSocket)

**Step 1 — Scrollback 전송**

```bash
# tmux의 전체 스크롤 히스토리를 ANSI escape 코드 포함하여 캡처
tmux capture-pane -t <session>:<window>.<pane> -p -e -S -
```

- `-p`: stdout으로 출력
- `-e`: ANSI escape 시퀀스 유지
- `-S -`: 스크롤백 버퍼 처음부터 전부

이 출력을 `{ type: 'scrollback', data }` 메시지로 클라이언트에 전송.
xterm.js가 렌더링하면 스크롤 올려서 과거 내용 볼 수 있음.

**Step 2 — Live 연결**

```javascript
// 서버에서 node-pty로 tmux attach 실행
import pty from 'node-pty';
const ptyProcess = pty.spawn('tmux', ['attach', '-t', target], {
  name: 'xterm-256color',
  cols: 80,
  rows: 24,
});
```

- tmux attach가 현재 화면을 다시 그림 (커서 위치 포함 full redraw)
- 이후 실시간 출력은 계속 스트리밍
- Scrollback 데이터 위에 현재 화면이 그려지므로, 자연스럽게 이어짐

**Step 3 — 입력 전달**

```
Client keypress → WebSocket { type: 'input', data } → server → pty.write(data) → tmux → 실제 프로세스
```

#### 3. Scrollback이 "잘 보이는" 이유

```
xterm.js 버퍼 상태:

    ┌─ capture-pane 출력 (과거 히스토리) ─┐
    │ $ npm install                       │  ← 스크롤 올리면 보임
    │ added 150 packages                  │
    │ $ npm run build                     │
    │ Building...                         │
    │ ... (수백 줄)                         │
    ├─ tmux attach가 다시 그린 현재 화면 ──┤
    │ $ _                                 │  ← 현재 보이는 영역
    │                                     │
    └─────────────────────────────────────┘
```

Foxtrot은 서버가 100KB만 저장하므로 오래된 내용 유실.
Kratos는 tmux의 `history-limit` (기본 2000줄, 설정 가능)만큼 보존.

---

## 요구사항

### 1. 인증 (Authentication)

#### 1.1 JWT 토큰
- `JWT_SECRET` 환경변수
- 만료: **7일**
- 저장: `localStorage` (`kratos_token`)
- 페이로드: `{ username, role }` — role을 포함하여 클라이언트에서 admin 여부 판단
- 자동 로그인: 페이지 로드 시 `/api/verify` → 유효하면 대시보드 진입

#### 1.2 사용자 역할
| Role | 설명 |
|------|------|
| `admin` | 최초 가입자. 사용자 추가/삭제 가능 |
| `user` | admin이 추가한 일반 사용자 |

- 최초 가입자는 인증 없이 계정 생성 (유저 0명일 때) → 자동으로 `role='admin'`
- 이후 사용자는 admin이 설정 화면에서 추가

#### 1.3 로그인 화면
- 아이디/비밀번호 입력
- 첫 접속 (유저 없음): 계정 생성 모드 (admin 자동 부여)
- 이후: 로그인 모드

#### 1.4 인증 API
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/config` | 인증 설정 상태 |
| GET | `/api/status` | 유저 존재 여부 |
| POST | `/api/register` | 최초 유저 생성 (유저 0명일 때만, role=admin) |
| POST | `/api/login` | 로그인 → JWT 반환 |
| GET | `/api/verify` | 토큰 검증 → `{ valid, username, role }` |

### 1.5 설정 — 내 프로필

모든 로그인 유저가 자신의 이름/비밀번호를 변경할 수 있다.

| Method | Path | Description |
|--------|------|-------------|
| PUT | `/api/me` | 내 정보 수정 `{ username?, password? }` |

- username 변경 시 새 JWT 발급 (페이로드에 username 포함하므로)
- password 변경 시 현재 비밀번호 확인 필수 `{ currentPassword, newPassword }`

### 1.6 설정 — 사용자 관리 (admin 전용)

admin만 다른 사용자를 추가/삭제할 수 있다.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users` | 전체 유저 목록 (admin 전용) |
| POST | `/api/users` | 유저 추가 `{ username, password }` (admin 전용) |
| DELETE | `/api/users/:id` | 유저 삭제 (admin 전용, 자기 자신은 삭제 불가) |

### 2. 에이전트 API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/agents` | JWT | 등록된 에이전트 목록 + tmux 상태 + webview 상태 (`is_manager`, `nickname` 포함) |
| POST | `/api/agents` | JWT | 에이전트 등록 `{ name, tmux_session }` |
| PUT | `/api/agents/:id` | JWT | 부분 업데이트 `{ name?, issue_project?, is_manager? }` |
| DELETE | `/api/agents/:id` | JWT | 에이전트 등록 해제 (tmux 세션은 건드리지 않음) |
| PUT | `/api/agents/:id/nickname` | agent token (매니저) | 닉네임 지정/해제 `{ nickname }` (≤10자) |
| PUT | `/api/agents/:id/session-uuid` | agent token (매니저) | Claude Code 세션 uuid 지정/해제 `{ session_uuid }` (빈값→해제, 중복→409) |
| POST | `/api/agents/spawn` | agent token (매니저) | 폴더에 새 에이전트 생성 `{ folder, name, nickname?, session_uuid? }` → 201 또는 409 `too many agent for the folder` |
| POST | `/api/agents/:id/webview` | localhost only | 웹뷰 등록 `{ port, path }` |
| DELETE | `/api/agents/:id/webview` | localhost only | 웹뷰 해제 |
| GET | `/api/agents/:id/webview/proxy/*` | JWT | Local 모드 — 프록시 |
| WS | `/ws/agents/:id/shared` | JWT | Shared Screen 모드 — rrweb 스트림 |

- 관리 API (GET/POST/DELETE agents): JWT 인증 필수
- 웹뷰 등록 API: localhost에서만 접근 가능 (에이전트 프로세스가 호출)
- 웹뷰 프록시 (Local): JWT 인증, 브라우저 iframe에서 호출
- Shared Screen WS: JWT 인증, rrweb 이벤트 양방향 (서버→클라이언트: DOM, 클라이언트→서버: 입력)
- 모든 로그인 유저가 동일한 에이전트 목록을 본다

#### 2.1 매니저 에이전트 (phase-11 / phase-12)

- **매니저 지정**: 대시보드 사용자가 Agents 목록의 "M" 버튼으로 토글(`is_manager`). 사람만 지정 가능.
- **닉네임**: 매니저 에이전트가 `PUT /api/agents/:id/nickname`(자기 토큰)로 임의 에이전트에 최대 10자
  라벨 부여. UI에서 agent name 우측에 약한 색으로 표시. 빈 문자열→해제. 11자↑ → 400.
- **에이전트 생성**: 매니저는 `POST /api/agents/spawn`으로 폴더 경로·이름·별명을 주면 tmux 세션을
  즉시 생성하고 토큰까지 반환. 폴더당 상한(전역 설정 `max_agents_per_folder`, 기본 4)을 넘으면
  409 `too many agent for the folder`. 상한은 그 폴더에 등록된 전체 에이전트(죽은 세션 포함)를 센다.
- **권한 경계**: 매니저는 **생성만 가능, 삭제 불가**. `DELETE /api/agents/:id`는 JWT 전용이라
  agent token으로는 호출 불가.
- `GET /api/agents/me` 응답에 `is_manager` 포함(에이전트가 매니저 여부 자체 확인).
- **세션 uuid로 메시지 보내기 (phase-13)**: 매니저가 에이전트에 Claude Code 세션 uuid를 붙여두면,
  발신 에이전트가 `POST /api/messages`에 `{ to_session, body }`로 수신 대상을 지정할 수 있다
  (기존 `{ to, body }`의 대안). uuid가 매칭되는 에이전트가 없거나 그 tmux 세션이 죽어있으면
  409 `no active session`. **이 `session_uuid` 값은 매니저 에이전트만 지정/제거하며, Kratos는
  그 값의 신뢰성(실제 Claude Code 세션과의 대응 여부)을 보장하지 않는다** — 단순 조회 키로만 취급.

### 2.5 설정 API (app_settings)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/settings` | JWT | 전역 설정 조회 `{ max_agents_per_folder }` |
| PUT | `/api/settings` | JWT(admin) | 전역 설정 변경 `{ max_agents_per_folder }` (≥1 정수) |

- `max_agents_per_folder`: 매니저가 폴더당 생성 가능한 에이전트 상한. 기본 4. Settings 화면(admin)에서 변경.

### 2.6 Phase API (phases / phase-documents)

프로젝트별 Phase와 그에 딸린 문서(에이전트가 산출한 계획/기획 문서)를 관리한다.
모든 엔드포인트는 `authenticateAny` — **JWT 또는 agent token** 모두 허용.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/phases` | JWT / agent token | Phase 목록 (`?project_code=` 필터). 각 phase에 `documents` 포함 |
| POST | `/api/phases` | JWT / agent token | Phase 생성 `{ project_code, name, status? }` |
| PUT | `/api/phases/:id` | JWT / agent token | Phase 수정 `{ name?, status?, sort_order? }` |
| DELETE | `/api/phases/:id` | JWT / agent token | Phase 삭제 |
| GET | `/api/phases/:id/documents` | JWT / agent token | Phase 문서 목록 |
| POST | `/api/phases/:id/documents` | JWT / agent token | 문서 등록 `{ title, doc_path, status?, agent_id? }` |
| PUT | `/api/phase-documents/:id` | JWT / agent token | 문서 수정 `{ title?, doc_path?, status? }` |
| DELETE | `/api/phase-documents/:id` | JWT / agent token | 문서 삭제 |

- `status`: `active` | `draft` | `done` | `deprecated` (기본 `draft`, 범위 밖 400)
- 문서 등록 시 `agent_id`를 생략하면 agent token일 경우 그 토큰의 에이전트로 자동 지정
  (JWT 호출이면 `agent_id` 필수, 없으면 400)
- 같은 phase에 동일 문서 중복 등록 시 409

### 3. WebSocket 프로토콜

#### Client → Server
```json
{ "type": "attach", "session": "agent-1" }
{ "type": "input", "data": "ls -la\r" }
{ "type": "resize", "cols": 120, "rows": 40 }
{ "type": "detach" }
```

#### Server → Client (터미널 WS)
```json
{ "type": "scrollback", "data": "..." }
{ "type": "output", "data": "..." }
{ "type": "agent-list", "agents": [...] }
{ "type": "session-ended", "session": "agent-1" }
{ "type": "webview-update", "agentId": 1, "webview": { "port": 5173, "path": "/" } }
{ "type": "webview-update", "agentId": 1, "webview": null }
```

#### Shared Screen WS (`/ws/agents/:id/shared`)

Server → Client:
```json
{ "type": "rrweb-snapshot", "data": { ... } }
{ "type": "rrweb-mutation", "data": { ... } }
```

Client → Server (입력 이벤트 → Puppeteer에 주입):
```json
{ "type": "shared-input", "event": { "type": "click", "x": 120, "y": 340 } }
{ "type": "shared-input", "event": { "type": "keypress", "key": "h" } }
```

### 4. 대시보드 레이아웃 & 네비게이션

#### 4.1 Header
- 좌측: "Kratos"
- 우측: 유저명 + 로그아웃

#### 4.2 네비게이션 상태 전이

UI는 **3가지 상태**를 가지며, 사이드바와 뷰포트의 역할이 상태에 따라 바뀐다.

```
[State A: 메뉴]  ──Agents 클릭──▶  [State B: 에이전트 목록]  ──에이전트 클릭──▶  [State C: 에이전트 상세]
                                         ◀──뒤로/Agents──                          ◀──다른 에이전트 클릭──
                  ──Settings 클릭──▶  [Settings 뷰]
```

#### 4.3 데스크톱 (≥768px) — 사이드바 + 뷰포트

**State A — 메뉴 (초기 상태)**

사이드바에 네비게이션 버튼만 표시. 뷰포트는 빈 상태 또는 환영 화면.

```
+--------+-----------------------------------------+
| Kratos                        user ▾  [Logout]   |
+--------+-----------------------------------------+
|        |                                         |
|  ◉     |                                         |
| Agents |         Welcome to Kratos               |
|        |                                         |
|        |                                         |
|  ⚙     |                                         |
| Settings                                         |
+--------+-----------------------------------------+
```

**State B — 에이전트 목록**

Agents 클릭 → 뷰포트에 에이전트 목록 표시. 사이드바는 그대로 메뉴 상태.

```
+--------+-----------------------------------------+
| Kratos                        user ▾  [Logout]   |
+--------+-----------------------------------------+
|        |  Agents                    [+ Add]       |
| [◉]    |                                         |
| Agents |  ┌──────────────────────────────────┐   |
|        |  │ code-reviewer  ● online   2m ago │   |
|        |  │ deploy-bot     ● online   15m ago│   |
|        |  │ test-runner    ○ offline  2h ago  │   |
|  ⚙     |  └──────────────────────────────────┘   |
| Settings|                                         |
+--------+-----------------------------------------+
```

**State C — 에이전트 상세 (핵심 전환)**

에이전트 클릭 → **사이드바가 에이전트 목록으로 변신**. 뷰포트는 선택된 에이전트의 터미널+웹뷰.

```
+------------------+-------------------+-------------------+
| Kratos                                user ▾  [Logout]   |
+------------------+-------------------+-------------------+
| ← Agents         | code-reviewer      [◫ ⬒ ⬜] split    |
|                  |                                        |
| [●] code-reviewer| ┌────────────────┐ ┌────────────────┐ |
|  ●  deploy-bot   | │  Terminal       │ │  Webview       │ |
|  ○  test-runner  | │                 │ │                │ |
|                  | │ $ claude...     │ │  (iframe)      │ |
|                  | │ $ _             │ │                │ |
|  ⚙ Settings      | └────────────────┘ └────────────────┘ |
+------------------+----------------------------------------+
```

사이드바 동작:
- 상단에 **"← Agents"** 뒤로가기 링크 → State B로 복귀
- 등록된 에이전트 목록이 세로로 나열
- 현재 선택된 에이전트 하이라이트 (`[●]`)
- 다른 에이전트 클릭 → 뷰포트만 해당 에이전트로 전환 (State C 유지)
- 하단에 Settings 링크 유지

#### 4.4 모바일 (<768px) — 전체 화면 전환

모바일에서는 사이드바 없이 전체 화면이 상태별로 전환된다.

**State A — 메뉴**
```
+------------------------------------------+
| Kratos                    user ▾ [Logout] |
+------------------------------------------+
|                                          |
|  [ ◉ Agents                         → ] |
|                                          |
|  [ ⚙ Settings                       → ] |
|                                          |
+------------------------------------------+
```

**State B — 에이전트 목록**
```
+------------------------------------------+
| ← Back   Agents              [+ Add]     |
+------------------------------------------+
|                                          |
|  code-reviewer   ● online     2m ago     |
|  deploy-bot      ● online     15m ago    |
|  test-runner     ○ offline    2h ago     |
|                                          |
+------------------------------------------+
```

**State C — 에이전트 상세 (탭)**
```
+------------------------------------------+
| ← Back   code-reviewer                   |
+------------------------------------------+
| [Terminal]  [Webview]      ← 탭 전환      |
+------------------------------------------+
|                                          |
|  $ claude -p "fix the bug"               |
|  I'll analyze the codebase...            |
|  $ _                                     |
|                                          |
+------------------------------------------+
```

- "← Back" → State B (에이전트 목록)으로 복귀
- 탭 전환 시 터미널/웹뷰 상태 유지

#### 4.5 에이전트 상세 — 터미널 + 웹뷰 분할

**분할 모드 (데스크톱):**
| 모드 | 아이콘 | 설명 |
|------|--------|------|
| 좌우 분할 | ◫ | 터미널(좌) + 웹뷰(우), 기본값 |
| 상하 분할 | ⬒ | 터미널(상) + 웹뷰(하) |
| 터미널만 | ⬜ | 웹뷰 숨김, 터미널 전체 |

- 드래그로 분할 비율 조절
- 분할 모드/비율 설정은 `localStorage`에 저장

**탭 모드 (모바일):**
- Terminal / Webview 탭으로 전환
- 탭 전환 시 각 패널 상태 유지

**Webview 패널:**
- 상단에 모드 전환 탭: **[Local]** | **[Shared Screen]**
- 웹뷰 미등록 시: placeholder ("No webview available")
- WebSocket `webview-update` 메시지 수신 시 자동 갱신

| 모드 | 렌더링 | 입력 |
|------|--------|------|
| Local | iframe → Kratos 프록시 → 에이전트 로컬 서버 | 각자 독립 |
| Shared Screen | rrweb replay (DOM 미러링) | Kratos → Puppeteer에 주입 → 전체 전파 |

#### 4.6 Settings 뷰

어떤 상태에서든 Settings 클릭 시 뷰포트에 설정 화면 표시.
사이드바는 메뉴 상태(State A 형태)로 돌아간다.

```
+--------+-----------------------------------------+
|        |  Settings                                |
|  ◉     | ┌───────────────────────────────────┐   |
| Agents | │  My Profile                        │   |
|        | │  Username: [sunnycat    ] [Save]   │   |
|        | │                                    │   |
|        | │  Change Password                   │   |
|        | │  Current:  [••••••••   ]           │   |
| [⚙]    | │  New:      [••••••••   ]           │   |
| Settings│ │  Confirm:  [••••••••   ] [Change] │   |
|        | └───────────────────────────────────┘   |
|        |                                         |
|        | ┌───────────────────────────────────┐   |  ← admin만 보임
|        | │  User Management                   │   |
|        | │                                    │   |
|        | │  sunnycat   admin   (you)          │   |
|        | │  alice      user    [Remove]       │   |
|        | │  bob        user    [Remove]       │   |
|        | │                                    │   |
|        | │  [+ Add User]                      │   |
|        | └───────────────────────────────────┘   |
+--------+-----------------------------------------+
```

- **My Profile**: 모든 유저. 이름 변경, 비밀번호 변경
- **User Management**: admin만 표시. 유저 목록, 추가, 삭제
  - 자기 자신은 삭제 불가 (Remove 버튼 없음)
  - Add User: username + 임시 password 입력 → 생성

### 5. UI/UX

#### 5.1 테마
- 다크 테마
- 배경: `#1a1a2e`
- 텍스트: `#e0e0e0`
- 사이드바: `#0f3460`
- 헤더: `#16213e`

#### 5.2 데스크톱 우선
- 모바일 대응은 이후 단계

### 6. 서버 설정

#### CLI
```
node server.js [options]
--port <number>    포트 (기본: 17000)
--auth             인증 활성화
```

#### 환경변수
```
JWT_SECRET=<key>   JWT 서명 키 (--auth 시 필수)
```

---

## 파일 구조

```
kratos/
├── package.json
├── .env                     # JWT_SECRET
├── .gitignore
├── requirements/
│   └── initialization.md
│
├── server/                  # Backend (Fastify)
│   ├── package.json
│   ├── index.js             # Fastify 서버 진입점
│   ├── migrations/          # DB 마이그레이션 (순번 관리)
│   │   ├── 001_create_users.sql
│   │   └── 002_create_agents.sql
│   ├── routes/
│   │   ├── auth.js          # /api/register, /api/login, /api/verify
│   │   ├── users.js         # /api/me, /api/users (admin)
│   │   ├── agents.js        # /api/agents CRUD + webview 등록
│   │   ├── webview-proxy.js # /api/agents/:id/webview/proxy/* (Local 모드)
│   │   ├── webview-shared.js # /ws/agents/:id/shared (Shared Screen WS)
│   │   └── ws.js            # WebSocket (tmux bridge)
│   └── lib/
│       ├── db.js            # SQLite + 마이그레이션 러너
│       ├── tmux.js          # tmux 명령 래퍼
│       └── shared-screen.js # Puppeteer + rrweb 관리 (세션당 1개 인스턴스)
│
└── client/                  # Frontend (React + Vite)
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx              # 라우팅 (Login / Dashboard)
        ├── pages/
        │   ├── Login.jsx        # 로그인 / 최초 가입
        │   ├── AgentList.jsx    # State B: 에이전트 목록 (뷰포트)
        │   ├── AgentDetail.jsx  # State C: 터미널 + 웹뷰 (뷰포트)
        │   └── Settings.jsx     # 프로필 + 유저 관리
        ├── components/
        │   ├── Layout.jsx       # Header + Sidebar + Viewport
        │   ├── Header.jsx
        │   ├── Sidebar.jsx      # 상태별 사이드바 (메뉴 / 에이전트 목록)
        │   ├── TerminalPanel.jsx     # xterm.js 래퍼
        │   ├── WebviewPanel.jsx      # Local (iframe) / Shared Screen (rrweb) 전환
        │   ├── SharedScreenView.jsx  # rrweb replay + 입력 캡처
        │   └── SplitView.jsx         # 분할 뷰 (좌우/상하/탭)
        └── lib/
            └── api.js           # fetch 래퍼 (JWT 자동 첨부)
```

## 구현 순서

1. **Phase 1**: Fastify 서버 + SQLite + 마이그레이션 러너 + Vite 프로젝트 초기화
2. **Phase 2**: 인증 API (register, login, verify) + JWT 7일
3. **Phase 3**: 유저 관리 API (`/api/me`, `/api/users`) + 에이전트 CRUD API
4. **Phase 4**: React 로그인 UI + 자동 로그인
5. **Phase 5**: 대시보드 레이아웃 (Header + Sidebar + 네비게이션 상태 전이)
6. **Phase 6**: Settings 페이지 (프로필 수정 + admin 유저 관리)
7. **Phase 7**: WebSocket + tmux attach PTY bridge + xterm.js 터미널 뷰
8. **Phase 8**: Scrollback 로딩 (`capture-pane`)
9. **Phase 9**: 웹뷰 등록 API + WebSocket 알림
10. **Phase 10**: 터미널 + 웹뷰 분할 뷰 (데스크톱 분할, 모바일 탭)
11. **Phase 11**: Webview Local 모드 (프록시 + iframe)
12. **Phase 12**: Webview Shared Screen 모드 (Puppeteer + rrweb DOM 미러링)
