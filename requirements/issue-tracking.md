# Issue Tracking System

## Overview

프로젝트 코드 기반의 이슈 관리 시스템. DB를 단일 소스로 하되, 에이전트 작업 폴더에 마크다운 파일로 자동 export하여 에이전트가 자연스럽게 참고할 수 있게 한다.

## 데이터 흐름

```
사용자 (UI) ──┐
              ├──► Kratos API ──► DB (primary source)
에이전트 (API)─┘                      │
                                     ▼
                              자동 export
                                     │
                     src/hotel/history/README.md  (이슈 목록)
                     src/hotel/history/HT-1.md   (이슈 본문 + 코멘트)
                     src/hotel/history/HT-2.md
```

- DB가 단일 진실 소스
- 이슈 생성/수정/코멘트 시 자동으로 `.md` 파일 export
- 에이전트는 API로 조작, 파일은 읽기 전용 스냅샷
- 에이전트가 작업 폴더의 `history/` 디렉토리를 자연스럽게 읽음

## 프로젝트 (Projects)

| 필드 | 설명 |
|------|------|
| code | 프로젝트 코드 (HT, JU, G9 등) — unique |
| name | 프로젝트 이름 |
| folder | 에이전트 작업 폴더 경로 (export 대상) |
| created_at | 생성일 |

- admin이 생성/관리
- 폴더 경로를 지정하면 해당 폴더의 `history/` 에 이슈 파일 export

### API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects` | JWT | 프로젝트 목록 |
| POST | `/api/projects` | JWT (admin) | 프로젝트 생성 `{ code, name, folder }` |
| PUT | `/api/projects/:code` | JWT (admin) | 프로젝트 수정 |
| DELETE | `/api/projects/:code` | JWT (admin) | 프로젝트 삭제 |

## 이슈 (Issues)

### 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| id | INTEGER | 내부 ID |
| project_code | TEXT | 프로젝트 코드 (FK) |
| issue_number | INTEGER | 프로젝트 내 순번 (자동 증가) |
| title | TEXT | 제목 |
| description | TEXT | 본문 (마크다운) |
| status | TEXT | pending / todo / inprogress / verification / completed |
| priority | INTEGER | 1~5 |
| reporter_type | TEXT | user / agent |
| reporter_id | INTEGER | 리포터 ID |
| assignee_agent_id | INTEGER | 담당 에이전트 (nullable) |
| created_at | TEXT | 생성일 |
| updated_at | TEXT | 수정일 |

### 이슈 번호

프로젝트별 순번: HT-1, HT-2, JU-1, JU-2...

### 상태 전이

```
pending → todo → inprogress → verification → completed
                      ↑              │
                      └──── 반려 ─────┘
```

### 권한

| 행위 | 사용자 | 에이전트 |
|------|--------|----------|
| 이슈 생성 | O | O |
| 이슈 내용 수정 | O (모든 이슈) | O (모든 이슈) |
| 코멘트 작성 | O | O |
| 리코멘트 작성 | O | O |
| 상태 변경 (일반) | O (모든 이슈) | O (모든 이슈) |
| completed 처리 | O (모든 이슈) | O (자기가 리포트한 것만) |

### API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/issues` | JWT/agent | 이슈 목록 (filter: project_code, status, assignee) |
| GET | `/api/issues/:code-:number` | JWT/agent | 이슈 상세 (코멘트 포함) |
| POST | `/api/issues` | JWT/agent | 이슈 생성 `{ project_code, title, description, priority }` |
| PUT | `/api/issues/:code-:number` | JWT/agent | 이슈 수정 `{ title, description, status, priority, assignee_agent_id }` |

## 코멘트 (Comments)

### 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| id | INTEGER | 코멘트 ID |
| issue_id | INTEGER | 이슈 FK |
| parent_id | INTEGER | 부모 코멘트 (리코멘트용, nullable) |
| body | TEXT | 내용 (마크다운) |
| author_type | TEXT | user / agent |
| author_id | INTEGER | 작성자 ID |
| created_at | TEXT | 작성일 |

### API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/issues/:code-:number/comments` | JWT/agent | 코멘트 작성 `{ body, parent_id? }` |
| PUT | `/api/comments/:id` | JWT/agent | 코멘트 수정 (작성자만) |
| DELETE | `/api/comments/:id` | JWT/agent | 코멘트 삭제 (작성자만) |

## 파일 Export 형식

### history/README.md (이슈 목록)

```markdown
# HT Issues

| # | Status | Priority | Title | Reporter | Assignee |
|---|--------|----------|-------|----------|----------|
| [HT-1](HT-1.md) | inprogress | P4 | 로그인 버그 수정 | admin | juliet |
| [HT-2](HT-2.md) | todo | P3 | 회원가입 플로우 | juliet | - |
```

### history/HT-1.md (이슈 본문)

```markdown
# HT-1: 로그인 버그 수정

- **Status**: inprogress
- **Priority**: P4
- **Reporter**: admin
- **Assignee**: juliet
- **Created**: 2026-04-21

## Description

Safari에서 로그인 시 세션이 유지되지 않는 문제

## Comments

### admin (2026-04-21 14:30)
Safari의 ITP 정책 때문인 것 같습니다

#### juliet (2026-04-21 14:35)
> Safari의 ITP 정책 때문인 것 같습니다

확인했습니다. SameSite 쿠키 설정을 수정하겠습니다.

### juliet (2026-04-21 15:00)
수정 완료. PR #42에서 확인해주세요.
```

## UI

### 사이드바

- **Issues** 메뉴 추가 (Agents, Todos, Ports, Issues, Settings)

### Issues 목록 페이지

- 프로젝트 탭/필터
- 상태 필터 (pending/todo/inprogress/verification/completed)
- 이슈 카드: 번호, 제목, 상태 뱃지, 우선순위, reporter, assignee
- 이슈 생성 버튼

### 이슈 상세 페이지

- 제목, 상태, 우선순위, reporter, assignee
- 본문 (plain text)
- 코멘트 목록 (리코멘트 들여쓰기)
- 코멘트 입력
- 상태 변경 버튼

### 에이전트 상세 패널

- 우측 탭에 Issues 추가 (해당 에이전트에 할당된 이슈)

## DB 마이그레이션

### 005_create_issues.sql

```sql
CREATE TABLE projects (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  folder TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_code TEXT NOT NULL REFERENCES projects(code),
  issue_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','todo','inprogress','verification','completed')),
  priority INTEGER NOT NULL DEFAULT 3 CHECK(priority >= 1 AND priority <= 5),
  reporter_type TEXT NOT NULL CHECK(reporter_type IN ('user','agent')),
  reporter_id INTEGER NOT NULL,
  assignee_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_code, issue_number)
);

CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author_type TEXT NOT NULL CHECK(author_type IN ('user','agent')),
  author_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## 구현 순서

1. DB 마이그레이션 (005)
2. 프로젝트 CRUD API
3. 이슈 CRUD API + 파일 export 로직
4. 코멘트 API
5. Issues 목록/상세 UI
6. 에이전트 패널 Issues 탭
