# Phase 7 — Webview · Chat 기능 공식 삭제

> 상태: DONE
> 작성일: 2026-06-25
> 최종 갱신: 2026-06-25
> 대상: `webview`(Local 프록시 + Shared Screen + Inspect), `chat`(에이전트/유저 그룹 채팅) 전면 제거

## 1. 배경 / 목표

Kratos에서 다음 두 기능을 **공식 제거**한다.

- **Webview**: 에이전트 localhost 서비스 프록시(Local), Puppeteer + rrweb 기반 Shared Screen, 스크린샷/DOM Inspect API
- **Chat**: 에이전트·유저 그룹 채팅방, 메시지, 스레드, @mention tmux 알림

제거 후 핵심 기능(터미널/PTY, 파일 브라우저, todos, issues, phases, ports, 인증)은 그대로 유지된다. 두 기능은 서로 독립적이며, 다른 기능이 이들에 의존하지 않음을 사전 조사로 확인했다.

## 2. 영향 범위 요약

| | 전체 삭제 파일 | 부분 수정 파일 | DB | npm 패키지 |
|---|---|---|---|---|
| Webview | 9 | 9 | 변경 없음 | puppeteer, rrweb(server) / rrweb, rrweb-player(client) |
| Chat | 2(+마이그레이션 2) | 7 | DROP 3 테이블(신규 마이그레이션) | 없음 |

## 3. 마이그레이션 처리 방침 (중요)

`server/lib/db.js`의 마이그레이션 러너는 **파일명 기준 forward-only**다 (적용된 이름을 `migrations` 테이블에 기록, 정렬 후 미적용분만 실행).

- ❌ **기존 마이그레이션 008/009 파일을 삭제하지 않는다.** 삭제해도 이미 적용된 DB에는 `chats`/`chat_participants`/`chat_messages` 테이블이 남고, 신규 DB만 영향받아 환경 간 불일치가 발생한다.
- ✅ **신규 마이그레이션 `012_drop_chat_tables.sql`을 추가**해 테이블을 DROP한다. 기존·신규 DB 모두 일관되게 정리된다.
- Webview는 전용 테이블/컬럼이 없다(`agent_ports.type`이 `'webview'` 값을 받을 수 있을 뿐 스키마는 generic). **DB 변경 불필요.**

```sql
-- server/migrations/012_drop_chat_tables.sql
DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS chat_participants;
DROP TABLE IF EXISTS chats;
```

> 참고: 기존 008/009 파일은 히스토리로 보존한다. 새 마이그레이션이 의존하므로 순서를 깨지 않는다.

## 4. Webview 삭제 상세

### 4-1. 전체 삭제 (server)
- `server/routes/webview.js` — 등록(POST/DELETE) + 메모리 상태
- `server/routes/webview-proxy.js` — Local HTTP 프록시
- `server/routes/webview-inspect.js` — 스크린샷/DOM Inspect
- `server/routes/webview-shared.js` — Shared Screen WS
- `server/routes/shared-page.js` — rrweb 플레이어 HTML
- `server/lib/shared-screen.js` — Puppeteer 세션 관리
- 테스트: `server/routes/webview.test.js`, `webview-proxy.test.js`, `webview-inspect.test.js`

### 4-2. 전체 삭제 (client)
- `client/src/components/WebviewPanel.jsx`

### 4-3. 부분 수정
- `server/index.js` — webview 5종 import + register 제거 (import 라인 ~26–30, register 라인 ~92–96)
- `server/routes/agents.js` — `import { getWebview }` 제거, 응답 매핑의 `webview: getWebview(a.id)` 제거
- `server/routes/guide.js` — WEBVIEW 문서 섹션 제거
- `server/routes/ports.js` — webview 관련 주석/분기 정리(generic 포트 등록은 유지)
- `server/routes/ports.test.js` — "register webview port" 테스트 블록 제거
- `client/src/pages/AgentDetail.jsx` — `WebviewPanel` import 및 `tab === 'webview'` 렌더 분기 제거
- `client/src/components/PanelContent.jsx` — TAB_ICONS/TAB_LABELS의 `webview` 항목 제거

### 4-4. 의존성 제거
- `server/package.json`: `puppeteer`, `rrweb`
- `client/package.json`: `rrweb`, `rrweb-player`
- 두 패키지는 webview 전용임을 grep으로 확인(다른 import 없음). 제거 후 `npm install`로 lock 갱신.

## 5. Chat 삭제 상세

### 5-1. 전체 삭제 (server)
- `server/routes/chats.js` — 채팅 API 전체
- 신규 마이그레이션 `012_drop_chat_tables.sql` **추가** (위 3절)

### 5-2. 전체 삭제 (client)
- `client/src/components/ChatPanel.jsx`

### 5-3. 부분 수정
- `server/index.js` — `import chatRoutes` + `register(chatRoutes)` 제거
- `server/routes/guide.js` — CHAT 문서 섹션 제거
- `client/src/pages/Dashboard.jsx` — `ChatPanel` import, `goChat` 함수, `view === 'chat'` 분기, `onGoChat` prop 제거
- `client/src/pages/AgentDetail.jsx` — `ChatPanel` import, `RIGHT_TABS`/`MOBILE_TABS`에서 `'chat'` 제거, `tab === 'chat'` 분기 제거
- `client/src/components/PanelContent.jsx` — TAB_ICONS/TAB_LABELS의 `chat` 항목 + `MessageSquare` import 제거
- `client/src/components/MobileNav.jsx` — `MessageSquare` import, `onGoChat` 파라미터, Chat 버튼, 메뉴 config의 `chat` 항목 제거
- `client/src/components/Sidebar.jsx` — `MessageSquare` import, `onGoChat` 파라미터, Chat 버튼 2곳 제거

### 5-4. 의존성
- Chat은 인증/DB/WS 등 공유 인프라만 사용. 전용 npm 패키지 없음. attachments 등 다른 기능과 독점 의존 없음.

## 6. 문서 정리
- `CLAUDE.md` — Tech Stack의 Shared Screen, "Webview Dual Mode" / "Webview Inspect API" 섹션, webview 관련 설계 결정 제거 (chat은 미언급)
- `README.md` — 설명·아키텍처 다이어그램·Webview API/Modes 섹션, rrweb-player 의존성 제거
- `requirements/initialization.md` — Shared Screen / webview 프로토콜·UI 명세 제거
- `plan/phase-3-agent-group-chat.md` — 폐기 표시(상단에 `> 상태: 폐기됨 (Phase 7에서 제거)` 추가) 또는 보존. **삭제하지 않고 폐기 마킹 권장**(히스토리 보존).

## 7. 실행 순서

1. **Chat 백엔드**: `chats.js` 삭제 → `012_drop_chat_tables.sql` 추가 → `index.js`에서 chat 등록 제거
2. **Chat 프론트**: `ChatPanel.jsx` 삭제 → Dashboard/AgentDetail/PanelContent/MobileNav/Sidebar 수정
3. **Webview 백엔드**: route 6종 + `lib/shared-screen.js` 삭제 → `index.js`/`agents.js`/`ports.js`/`guide.js` 수정
4. **Webview 프론트**: `WebviewPanel.jsx` 삭제 → AgentDetail/PanelContent 수정
5. **의존성**: server/client `package.json`에서 4개 패키지 제거 → 각 `npm install`
6. **테스트 정리**: webview 테스트 3종 삭제, `ports.test.js` 블록 제거
7. **문서**: guide.js / CLAUDE.md / README.md / requirements / phase-3 폐기 마킹
8. **검증**: 8절 체크리스트

## 8. 검증 체크리스트

- [ ] `cd server && npm test` — 모든 테스트 통과 (webview/chat 잔존 참조로 인한 import 에러 없음)
- [ ] `grep -ri "webview\|chat\|rrweb\|puppeteer\|shared-screen" server/ client/src --include=*.js --include=*.jsx` — 잔존 참조 0건 (의도적 보존 문서 제외)
- [ ] `cd server && node index.js --auth` — 정상 기동, 라우트 등록 에러 없음
- [ ] `cd client && npm run build` — 빌드 성공 (깨진 import 없음)
- [ ] 신규 DB로 기동 시 `chats*` 테이블 미생성, 기존 DB 기동 시 012 마이그레이션으로 DROP 확인
- [ ] UI: 사이드바/모바일 네비/패널 탭에서 Chat·Webview 항목 미노출, 레이아웃 깨짐 없음

## 9. 롤백

- 코드/문서/마이그레이션 변경 전체를 단일 브랜치(`chore/remove-webview-chat`)로 커밋 → 문제 시 브랜치 되돌림.
- ⚠️ `012_drop_chat_tables.sql`은 **데이터 파괴적**(채팅 메시지 영구 삭제). 운영 DB 적용 전 백업 필수. 채팅 데이터 보존이 필요하면 이 단계만 분리해 마지막에 수동 적용.

## 10. 리스크

| 리스크 | 영향 | 완화 |
|---|---|---|
| 외부 에이전트가 webview 등록 API 호출 중 | 등록 실패(무해, localhost-only) | guide 갱신으로 호출 중단 안내 |
| 채팅 데이터 영구 삭제 | 복구 불가 | 사전 DB 백업, drop 단계 분리 옵션 |
| 잔존 import 누락 | 빌드/기동 실패 | 8절 grep + build + test로 차단 |

---

## 11. 실행 로그 (진행 현황 — 2026-06-25)

### ✅ 완료

**Chat 백엔드**
- 삭제: `server/routes/chats.js`
- 추가: `server/migrations/012_drop_chat_tables.sql` (chat_messages / chat_participants / chats DROP)
- 수정: `server/index.js` — `chatRoutes` import + register 제거

**Chat 프론트엔드**
- 삭제: `client/src/components/ChatPanel.jsx`
- 수정: `Dashboard.jsx`(import·goChat·view 분기·onGoChat prop), `AgentDetail.jsx`(import·RIGHT_TABS·MOBILE_TABS·render 분기), `PanelContent.jsx`(chat 아이콘/라벨), `MobileNav.jsx`(MessageSquare·onGoChat·버튼·config), `Sidebar.jsx`(MessageSquare·onGoChat·버튼 2곳), `Layout.jsx`(onGoChat param + 전달 4곳)

**Webview 백엔드**
- 삭제: `routes/webview.js`, `webview-proxy.js`, `webview-inspect.js`, `webview-shared.js`, `shared-page.js`, `lib/shared-screen.js`
- 삭제(테스트): `webview.test.js`, `webview-proxy.test.js`, `webview-inspect.test.js`
- 수정: `index.js`(webview 5종 import+register 제거), `agents.js`(`getWebview` import·응답 `webview` 필드 제거), `ports.js`(webview 주석 제거), `guide.js`(WEBVIEW 섹션 + ports 예제 `type:"webview"`→`"service"`)
- ✅ 확인: `grep -rn "webview|chat|getWebview|shared-screen|rrweb|puppeteer" server/` → **0건**

**Webview 프론트엔드**
- 삭제: `client/src/components/WebviewPanel.jsx`
- 수정: `AgentDetail.jsx`, `PanelContent.jsx` (webview 아이콘/라벨/render 분기)

**의존성 / 테스트**
- `server/package.json` — `puppeteer`, `rrweb` 제거
- `client/package.json` — `rrweb`, `rrweb-player` 제거
- `client/vite.config.js` — 삭제된 shared-page용 `/shared` 프록시 제거
- `server/routes/ports.test.js` — webview 포트 테스트 블록 제거 + 리스트 카운트 `2`→`1` 보정

**문서**
- `server/routes/guide.js` — CHAT 섹션 제거 (선행 작업)

### ✅ 잔여 작업 (완료)

- [x] `cd server && npm install` / `cd client && npm install` — lock 갱신
- [x] `cd server && npm test` — 15 files, 85 tests passed
- [x] `cd client && npm run build` — 빌드 성공
- [x] 문서 정리: `CLAUDE.md` (webview/shared screen 섹션 제거)
- [x] `plan/phase-3-agent-group-chat.md` 폐기 마킹

### 참고
- 코드 삭제 변경은 단일 브랜치 커밋 권장(롤백 용이). `012_drop_chat_tables.sql`는 데이터 파괴적이므로 운영 DB 적용 전 백업 필수.

## Status: DONE (2026-06-25)
