# Session 1: 프로젝트 초기 설계 및 구현 (2026-04-18)

## 요약

Kratos 에이전트 대시보드 프로젝트를 설계부터 전체 구현까지 하루에 완료.
tmux 세션으로 실행되는 AI 에이전트(Claude, Codex 등)를 웹에서 모니터링하고, 터미널 접속/웹뷰 확인/파일 업로드가 가능한 대시보드를 구축했다.

---

## 1. 요구사항 정의

**파일**: `requirements/initialization.md`

Foxtrot(기존 웹 터미널 프로젝트)을 분석한 후, 차이점을 기반으로 요구사항을 정리했다.

### 핵심 설계 결정
- **Foxtrot vs Kratos**: Foxtrot은 node-pty로 shell을 직접 spawn → Kratos는 tmux 세션에 연결
- **에이전트 타입**: `unmanaged-agent` — Kratos가 생성/종료를 관리하지 않고, 외부에서 실행 중인 tmux 세션을 등록
- **에이전트 목록**: SQLite에 저장, tmux 실시간 상태와 합산
- **인증**: JWT 7일 만료, 최초 가입자 admin 자동 부여
- **Webview 이중 모드**: Local (프록시) + Shared Screen (Puppeteer + rrweb DOM 미러링)
- **사이드바 3-state 전이**: Menu → Agent List → Agent Switcher
- **DB 마이그레이션**: 순번 SQL 파일 기반 버저닝

### 여러 차례 요구사항 추가
- 사용자 역할 시스템 (admin/user), Settings에서 프로필/유저 관리
- 터미널 + 웹뷰 분할 뷰 (좌우/상하/터미널만, 드래그 리사이즈)
- 모바일 탭 전환 (Terminal / Webview)
- Webview 등록 API (에이전트가 curl로 호출)
- Webview Shared Screen (Puppeteer → rrweb → DOM 미러링)

---

## 2. 프레임워크 선정

| Layer | Choice |
|-------|--------|
| Frontend | React + Vite + Tailwind CSS + shadcn/ui |
| Backend | Fastify |
| Database | better-sqlite3 (WAL mode) |
| Auth | @fastify/jwt + bcryptjs |
| Terminal | xterm.js + node-pty → tmux attach |
| Shared Screen | Puppeteer + rrweb |
| WebSocket | @fastify/websocket |

초기에는 Express + Vanilla HTML로 시작했으나, 사용자 요청으로 Fastify + React + Vite로 변경.
이후 shadcn/ui + Tailwind로 UI 스타일 전환.

---

## 3. 구현 Phase별 상세

### Phase 1: 프로젝트 초기화 (`8ac8933`)

**TDD: 8 tests**

- Root/Server/Client 3개 패키지 구조 생성
- SQLite 마이그레이션 러너 구현 (`server/lib/db.js`)
  - `migrations/` 디렉토리의 순번 SQL 파일 자동 실행
  - `migrations` 테이블로 적용 이력 추적
  - 재시작 시 미적용 마이그레이션만 실행
- 마이그레이션 파일: `001_create_users.sql`, `002_create_agents.sql`
- Fastify 서버 기본 구조 (`server/index.js`)
  - `.env` 파일에서 JWT_SECRET, PORT 로드
  - `/api/config`, `/api/status` 엔드포인트

### Phase 2: 인증 API (`8ac8933`)

**TDD: 10 tests**

- `POST /api/register` — 첫 유저만 가입 가능, role='admin' 자동 부여
- `POST /api/login` — bcrypt 비밀번호 검증 → JWT 반환
- `GET /api/verify` — Bearer 토큰 검증 → { valid, username, role }
- JWT 만료: 7일, 페이로드에 username + role 포함

### Phase 3: 유저 관리 + 에이전트 CRUD (`8ac8933`)

**TDD: 15 tests**

- `PUT /api/me` — 자기 이름/비밀번호 변경, 비밀번호 변경 시 현재 비밀번호 확인 필수
- `GET/POST/DELETE /api/users` — admin 전용 유저 관리, 자기 삭제 방지
- `GET/POST/DELETE /api/agents` — 에이전트 등록/해제, tmux 상태 합산
- `GET /api/folders` — 디렉토리 브라우징 API (트리 구조용)
- `GET /api/tmux/sessions` — tmux 세션 목록 (등록 여부 표시)
- `POST /api/agents { folder }` — 폴더에서 tmux 세션 자동 생성 + 에이전트 등록

### Phase 4-5: React UI + 대시보드 레이아웃 (`8ac8933`)

- Login 페이지: 첫 접속 = 계정 생성, 이후 = 로그인, 자동 로그인
- AuthProvider 컨텍스트: 토큰 관리, 로그인/로그아웃/프로필 업데이트
- Dashboard: 3-state 네비게이션 (Welcome → AgentList → AgentDetail)
- Layout: Header + Sidebar + Viewport
- Sidebar: State A/B = 메뉴 버튼, State C = 에이전트 스위처 목록
- AgentList: 에이전트 카드 목록 + 추가/삭제
- Settings: My Profile (이름/비밀번호) + User Management (admin)
- 다크 테마 CSS

### Phase 6: shadcn/ui + 다이얼로그 (`8ac8933`)

- Tailwind CSS v3 + shadcn/ui 컴포넌트 셋업
- Button, Input, Dialog, Badge UI 컴포넌트
- **FolderPickerDialog**: 트리 형태 폴더 브라우저 (lazy load, 클릭=선택, 자동 확장)
- **TmuxPickerDialog**: 실행 중인 tmux 세션 목록 (이미 등록된 세션은 비활성)
- 컬러 톤 변경: 남색 → 순수 검은 다크 (`hsl(0 0% 7%)`)
- Primary 색: 빨간색 → 밝은 회색

### Phase 7-8: WebSocket tmux PTY bridge + Scrollback (`c0b7fe4`)

**TDD: 3 tests**

- `WS /ws/terminal?token=<JWT>` — JWT 쿼리 파라미터 인증
- 접속 시 `tmux capture-pane -p -e -S -`로 전체 스크롤백 전송
- `node-pty`로 `tmux attach -dt <session>` 실행, 실시간 출력 스트리밍
- 클라이언트 입력 → WebSocket → pty.write() → tmux → 프로세스
- 터미널 리사이즈 자동 동기화
- `TerminalPanel` 컴포넌트: xterm.js + WS 연결 + ResizeObserver
- **node-pty spawn-helper 권한 문제 해결**: `chmod +x` + postinstall 스크립트

### Phase 9: 웹뷰 등록 API (`6dec8cc`)

**TDD: 6 tests**

- `POST /api/agents/:id/webview { port, path }` — localhost only, JWT 불필요
- `DELETE /api/agents/:id/webview` — 웹뷰 해제
- 메모리에 웹뷰 상태 저장 (agentId → { port, path })
- WebSocket broadcast로 연결된 클라이언트에 실시간 알림
- 에이전트 목록 API에 webview 상태 포함

### Phase 10: 터미널 + 웹뷰 분할 뷰 (`61e98ca`)

- `SplitView` 컴포넌트: 좌우/상하/터미널만 3가지 모드
- 드래그로 분할 비율 조절, localStorage에 저장
- `WebviewPanel`: Local/Shared Screen 탭, 새로고침 버튼
- 모바일 (<768px): Terminal / Webview 탭 전환
- 데스크톱: 분할 모드 토글 버튼 (헤더)

### Phase 11: Webview Local 모드 프록시 (`b9676f7`)

**TDD: 6 tests**

- `GET /api/agents/:id/webview/proxy/*` — HTTP 프록시
- Kratos가 `localhost:<port><path>` 로 요청 중계
- JWT 인증 (Bearer 헤더 또는 `?token=` 쿼리 파라미터 — iframe 지원)
- 토큰은 타겟 서버로 전달되지 않음 (URL에서 제거)

### Phase 12: Webview Shared Screen (`38992cd`)

- Puppeteer headless로 에이전트 웹뷰 로드
- rrweb record 스크립트 주입 → DOM 스냅샷 + mutation 이벤트 캡처
- `WS /ws/agents/:id/shared` — rrweb 이벤트 실시간 스트리밍
- 클라이언트: rrweb-player로 DOM 재구성 (sandboxed iframe)
- 사용자 입력 (클릭) → WebSocket → Puppeteer에 주입 → DOM 변경 전파
- 30초 grace period 후 미사용 세션 자동 정리

### 추가: 에이전트용 Inspect API (`ff1d427`)

**TDD: 4 tests**

- `GET /api/agents/:id/webview/screenshot` — PNG base64 (Puppeteer), 1280x720
- `GET /api/agents/:id/webview/dom` — { title, url, text, html } (innerHTML 50KB 제한)
- 공유 Puppeteer 인스턴스 재사용
- localhost only (JWT 불필요) — Claude/Codex가 웹뷰를 "읽는" 용도

### 추가: API Guide 터미널 전송 (`4e2da71`, `4acdafb`)

- `TerminalPanel`에 `forwardRef` + `sendInput` 메서드 노출
- 에이전트 헤더에 "API Guide" 버튼 — 클릭 시 heredoc으로 가이드 전송
- 가이드에 에이전트 ID + backend 포트 자동 삽입
- `/api/config`에 `serverPort` 반환 추가 (Vite 포트 vs Fastify 포트 혼동 방지)

### 추가: 파일 업로드 (`d10acf9`, `056f993`)

**TDD: 3 tests**

- `POST /api/agents/:id/upload` — multipart 파일 업로드 (JWT 인증)
- `tmux display-message`로 에이전트의 현재 작업 디렉토리 감지
- `<작업폴더>/tmp/kratos/`에 파일 저장
- 에이전트 헤더에 "Upload" 버튼 (여러 파일 선택 가능)
- 업로드 완료 시 터미널에 경로 알림 echo

---

## 4. 버그 수정

| 커밋 | 문제 | 원인 | 해결 |
|------|------|------|------|
| `c0b7fe4` | node-pty spawn 실패 (posix_spawnp failed) | `spawn-helper` 바이너리에 실행 권한 없음 | `chmod +x` + postinstall 스크립트 |
| `4acdafb` | API Guide에서 webview 등록 시 404 | 가이드가 Vite 포트(15000)를 전송, 에이전트가 curl로 직접 호출하므로 Fastify 포트(15001) 필요 | `/api/config`에서 `serverPort` 반환 |
| `ff9c0a9` | iframe에서 webview 프록시 401 | iframe이 `Authorization` 헤더를 보낼 수 없음 | `?token=` 쿼리 파라미터 인증 지원 |
| `056f993` | Upload 버튼 클릭 불가 | Tailwind `hidden` 클래스가 일부 환경에서 `click()` 차단 | `style={{ display: 'none' }}` 사용 |
| `056f993` | Webview 등록 후 패널 미갱신 | WS push 누락 시 UI가 업데이트되지 않음 | 3초 폴링으로 에이전트 데이터 자동 갱신 |

---

## 5. 최종 프로젝트 구조

```
kratos/
├── .env                          # JWT_SECRET, PORT, CLIENT_PORT
├── .gitignore
├── CLAUDE.md                     # Claude Code 가이드
├── README.md                     # 프로젝트 문서 + Agent API 가이드
├── package.json
├── requirements/
│   └── initialization.md         # 전체 요구사항 + 설계 문서
├── history/
│   └── 1_setup.md                # 이 파일
│
├── server/                       # Fastify Backend
│   ├── package.json
│   ├── index.js                  # 서버 진입점
│   ├── migrations/
│   │   ├── 001_create_users.sql
│   │   └── 002_create_agents.sql
│   ├── lib/
│   │   ├── db.js                 # SQLite + 마이그레이션 러너
│   │   ├── tmux.js               # tmux 명령 래퍼
│   │   └── shared-screen.js      # Puppeteer + rrweb 세션 관리
│   └── routes/
│       ├── auth.js               # register, login, verify
│       ├── users.js              # /api/me, /api/users
│       ├── agents.js             # /api/agents CRUD
│       ├── folders.js            # /api/folders, /api/tmux/sessions
│       ├── ws.js                 # WS /ws/terminal (tmux PTY bridge)
│       ├── webview.js            # webview 등록/해제
│       ├── webview-proxy.js      # Local 모드 HTTP 프록시
│       ├── webview-shared.js     # Shared Screen WS (rrweb)
│       ├── webview-inspect.js    # screenshot, DOM 읽기
│       └── upload.js             # 파일 업로드
│
└── client/                       # React + Vite Frontend
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    └── src/
        ├── main.jsx
        ├── index.css             # shadcn 다크 테마
        ├── App.jsx
        ├── lib/
        │   ├── api.js            # fetch 래퍼 (JWT 자동 첨부)
        │   ├── auth.jsx          # AuthProvider 컨텍스트
        │   └── utils.js          # cn() 유틸리티
        ├── pages/
        │   ├── Login.jsx
        │   ├── Dashboard.jsx
        │   ├── AgentList.jsx
        │   ├── AgentDetail.jsx
        │   └── Settings.jsx
        └── components/
            ├── Layout.jsx
            ├── Header.jsx
            ├── Sidebar.jsx
            ├── TerminalPanel.jsx
            ├── WebviewPanel.jsx
            ├── SharedScreenView.jsx
            ├── SplitView.jsx
            ├── FolderPickerDialog.jsx
            ├── TmuxPickerDialog.jsx
            └── ui/
                ├── button.jsx
                ├── input.jsx
                ├── dialog.jsx
                └── badge.jsx
```

---

## 6. 테스트 현황

총 **62 tests**, 11 test files, 전부 GREEN.

| Test File | Tests | 영역 |
|-----------|-------|------|
| lib/db.test.js | 6 | 마이그레이션 러너 |
| index.test.js | 2 | 서버 기본 |
| routes/auth.test.js | 10 | 인증 |
| routes/users.test.js | 9 | 유저 관리 |
| routes/agents.test.js | 6 | 에이전트 CRUD |
| routes/folders.test.js | 7 | 폴더/tmux 목록 |
| routes/ws.test.js | 3 | WebSocket 터미널 |
| routes/webview.test.js | 6 | 웹뷰 등록 |
| routes/webview-proxy.test.js | 6 | 웹뷰 프록시 |
| routes/webview-inspect.test.js | 4 | 스크린샷/DOM |
| routes/upload.test.js | 3 | 파일 업로드 |

---

## 7. 커밋 히스토리

| Hash | Type | Description |
|------|------|-------------|
| `8ac8933` | feat | Initial kratos agent dashboard |
| `c0b7fe4` | feat | WebSocket tmux PTY bridge + xterm.js terminal view |
| `6dec8cc` | feat | Webview registration API + WebSocket push notification |
| `61e98ca` | feat | Terminal + webview split view with drag resize |
| `b9676f7` | feat | Webview local mode HTTP proxy |
| `38992cd` | feat | Webview shared screen mode (Puppeteer + rrweb DOM mirroring) |
| `ff1d427` | feat | Webview inspect API for agents + README |
| `4e2da71` | feat | Send API guide to terminal button |
| `4acdafb` | fix | API guide sends backend port instead of frontend port |
| `ff9c0a9` | fix | Webview proxy supports query param token for iframe auth |
| `d10acf9` | feat | File upload to agent working directory |
| `056f993` | fix | Upload button click and webview auto-refresh |

---

## 8. 실행 방법

```bash
# .env 설정
JWT_SECRET=<uuidgen>
PORT=15001
CLIENT_PORT=15000

# 서버
cd server && npm install && node index.js --auth

# 클라이언트
cd client && npm install && npm run dev

# 접속
http://localhost:15000
```

---

## 9. 남은 과제

- 모바일 사이드바 (현재 데스크톱만 표시)
- Shared Screen 입력 전파 (키보드 입력, 스크롤)
- WebSocket webview-update 이벤트를 통한 실시간 갱신 (현재 폴링)
- 에이전트 정렬/필터링
- Webview 프록시 POST/PUT 등 다른 HTTP 메서드 지원
- 프로덕션 배포 설정 (Vite build → Fastify static serve)
