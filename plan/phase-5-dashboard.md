# Phase 5: Dashboard Home

## Overview

Kratos 메인 페이지. 로그인 후 첫 화면에 전체 현황을 한눈에 파악할 수 있는 대시보드.

## 표시 항목

### 1. Agents 요약
- 가동 중(online) 에이전트 수 / 전체 수
- 정렬 기준 맨 위 4개 에이전트 카드 (이름, 상태, 마지막 활동)
- 카드 클릭 → Agent Detail 이동

### 2. Todos 요약
- 미결(pending + in_progress) Todo 수
- 가장 오래된 미결 Todo 5개 (created_at 오래된 순)
- 클릭 → Todos 페이지 이동

### 3. Issues 요약
- 미결(pending + todo + inprogress + verification) Issue 수
- 가장 오래된 미결 Issue 5개
- 클릭 → Issues 페이지 이동

### 4. Phases 요약
- 각 프로젝트의 가장 오래된 active Phase 1개씩
- 클릭 → Phases 페이지 이동

## API

기존 API 조합으로 충분:
- `GET /api/agents` → online 카운트 + 상위 4개
- `GET /api/todos?status=pending` + `?status=in_progress` → 미결 카운트 + 오래된 5개
- `GET /api/issues?status=pending` (+ todo, inprogress, verification) → 미결 카운트 + 오래된 5개
- `GET /api/phases` → 프로젝트별 가장 오래된 active phase

또는 서버에 `GET /api/dashboard` 전용 엔드포인트를 만들어 한 번에 가져오기.

## 어려운 점

없음. 모든 데이터가 기존 API에서 이미 제공됨. 전용 엔드포인트를 만들면 클라이언트에서 여러 번 호출하지 않아도 돼서 더 깔끔함.

## Implementation

1. `GET /api/dashboard` 엔드포인트 (한 번에 모든 요약 데이터 반환)
2. Dashboard 홈 컴포넌트 (Welcome 대체)
3. 각 섹션 카드 클릭 시 해당 뷰로 이동

## Status: DONE (2026-06-21)
