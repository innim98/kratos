# Phase 4: Phase Grid Map

## Overview

프로젝트별 Phase(단계)를 등록하고, 에이전트가 진행 현황 문서를 연결하여 대시보드에서 열람 가능한 기능.

## 핵심 개념

- **Phase**: 프로젝트의 개발 단계 (예: "Phase 1 - 인프라 구축", "Phase 2 - 핵심 기능")
- **Phase Document**: 에이전트가 등록하는 markdown 문서 경로. 해당 에이전트의 작업 디렉토리 내 파일.
- **Grid Map**: 프로젝트 × Phase 매트릭스로 진행 현황을 한눈에 파악

## 일지

### 2026-06-21
- Phase Grid Map 기능 설계 시작
- Kratos Sidebar 메뉴에 "Phases" 항목 추가 예정
- Markdown 렌더링 라이브러리 조사 중

---

## Data Model

```sql
CREATE TABLE phases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planned',  -- planned | active | completed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE phase_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phase_id INTEGER NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  agent_id INTEGER NOT NULL REFERENCES agents(id),
  title TEXT NOT NULL,
  doc_path TEXT NOT NULL,          -- 에이전트 작업 디렉토리 내 상대 경로
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(phase_id, agent_id, doc_path)
);
```

## API

```
# Phase CRUD
GET    /api/phases?project_code=HT        → 프로젝트별 phase 목록
POST   /api/phases                        → { project_code, name }
PUT    /api/phases/:id                    → { name, status, sort_order }
DELETE /api/phases/:id

# Phase Documents (에이전트가 등록)
GET    /api/phases/:id/documents          → 해당 phase의 문서 목록
POST   /api/phases/:id/documents          → { title, doc_path }  (agent token)
DELETE /api/phase-documents/:id

# Document content (markdown 파일 읽기)
GET    /api/agents/:agentId/files/read?path=<doc_path>  → 기존 API 재사용
```

## UI

### Sidebar
- Agents, Todos, Issues, Chat, **Phases**, Ports, Settings

### Phases 페이지 (Grid Map)
```
┌─────────────────────────────────────────────────────┐
│ Phases                            [Project: HT ▼]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Phase 1 - 인프라 구축                    ● active    │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 📄 hotel-agent: infra-setup.md          [View]  │ │
│ │ 📄 juliet-agent: db-migration.md        [View]  │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ Phase 2 - 핵심 기능                      ○ planned   │
│ ┌─────────────────────────────────────────────────┐ │
│ │ (No documents yet)                              │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Document Viewer
- 문서 클릭 → Markdown 렌더링 뷰 (전체 화면)
- 뒤로가기 버튼으로 Grid Map 복귀
- 기존 `/api/agents/:id/files/read` API로 파일 내용 로드
- React Markdown 라이브러리로 렌더링 (GFM, code highlighting)

## Markdown 렌더링 (조사 중)

- **react-markdown** + remark-gfm + rehype-highlight
  - 가장 대중적, 플러그인 생태계
  - GFM (표, 체크박스, 취소선) 지원
  - 코드 하이라이팅: rehype-highlight 또는 react-syntax-highlighter

## Implementation Order

1. DB migration: phases, phase_documents 테이블
2. Phase API: CRUD + documents
3. Sidebar에 Phases 메뉴 추가
4. Phases 페이지: Grid Map UI
5. Markdown viewer: react-markdown 설치 + 렌더링 컴포넌트
6. Document viewer: 파일 로드 + markdown 표시
7. Guide 페이지에 phase document 등록 가이드 추가

## Questions

- (답변 대기 중)

## Status: DONE (2026-06-21)
