# Phase 2: Input Notepad & History

## Overview

터미널 입력창을 메모장처럼 사용할 수 있게 개선. 입력 내용 유실 방지 + 히스토리 기능.

## 문제

1. tmux 스크롤 중 입력창에 작성한 내용을 실수로 전송하여 유실
2. 화면 잠금 → 페이지 리로드 시 입력 중이던 내용 유실
3. 이전에 보냈던 명령어를 다시 찾기 어려움

## Features

### 1. Input History (localStorage)

- 엔터로 전송할 때마다 입력 내용을 히스토리에 저장
- 최대 500개, FIFO (오래된 것부터 삭제)
- `localStorage`에 에이전트별로 저장 (`kratos_input_history_{agentId}`)
- 빈 문자열은 저장하지 않음, 연속 중복 저장 안 함

### 2. 자동 임시 저장

- 입력창 내용이 변경될 때마다 `localStorage`에 draft 저장 (`kratos_input_draft_{agentId}`)
- 페이지 로드 시 draft 복원
- `visibilitychange` 이벤트 (백그라운드 전환) 시 즉시 저장
- `beforeunload` 이벤트 시 즉시 저장
- 전송 후 draft 삭제

### 3. History UI

- Extra keys 패널(▲ 펼치기) 영역에 `History` 버튼 추가
- 클릭 시 히스토리 목록 표시 (최신순, 스크롤 가능)
- 각 항목 클릭 → 입력창에 채움 (전송하지 않음)
- 각 항목 길게 누르거나 삭제 버튼 → 개별 삭제
- 검색 입력란 (선택사항, 목록이 길어질 때 유용)

### 4. Quick Key 진입

- Extra keys 영역에 `Hist` 버튼 추가
- 또는 기존 ▲/▼ 키 옆에 시계 아이콘 버튼

## 데이터 구조

```javascript
// localStorage: kratos_input_history_{agentId}
[
  { text: "cat /tmp/kratos/image.png", ts: 1717430000000 },
  { text: "ls -la", ts: 1717429900000 },
  ...
]

// localStorage: kratos_input_draft_{agentId}
"현재 입력 중인 텍스트"
```

### 5. Quick Keys 자동 숨기기

- 입력창에 포커스가 가면 Quick keys (ESC, TAB, ^C, ↑, ↓, q) 숨김
- 입력창에서 포커스가 빠지면 다시 표시
- `Keys` 버튼으로 수동 토글 가능 (포커스 상태에서도)
- 입력창이 더 넓어져서 모바일/태블릿에서 편리

## UI Wireframe

**입력창 포커스 없을 때 (기본):**
```
┌─ Quick keys ──────────────────────────────────┐
│ ESC  TAB  ^C  ↑  ↓  q       [Hist] [▲ More]  │
├───────────────────────────────────────────────┤
│ [input field...........................] [▶]   │
└───────────────────────────────────────────────┘
```

**입력창 포커스 있을 때:**
```
├───────────────────────────────────────────────┤
│ [Keys] [Hist] [input field.............] [▶]  │
└───────────────────────────────────────────────┘
```

**Keys 펼침 (포커스 상태에서도 수동 토글):**
```
┌─ Quick keys ──────────────────────────────────┐
│ ESC  TAB  ^C  ↑  ↓  q               [▲ More] │
├───────────────────────────────────────────────┤
│ [Keys] [Hist] [input field.............] [▶]  │
└───────────────────────────────────────────────┘
```

**History 패널:**
```
┌─────────────────────────────────────────────┐
│ [History]                           [Close] │
│ ┌─────────────────────────────────────────┐ │
│ │ 🔍 Search history...                    │ │
│ ├─────────────────────────────────────────┤ │
│ │ cat /tmp/kratos/image.png    2m ago   × │ │
│ │ ls -la                       5m ago   × │ │
│ │ npm test                    12m ago   × │ │
│ │ git status                  30m ago   × │ │
│ └─────────────────────────────────────────┘ │
├───────────────────────────────────────────────┤
│ [Keys] [Hist] [input field.............] [▶]  │
└───────────────────────────────────────────────┘
```

## Implementation

### TerminalPanel 변경

1. **State 추가**:
   - `showHistory` (boolean)
   - history 읽기/쓰기 함수 (localStorage wrapper)

2. **handleInputSend 수정**:
   - 전송 전 히스토리에 push
   - 전송 후 draft 삭제

3. **Input 이벤트**:
   - `onChange` → draft 저장
   - 컴포넌트 마운트 시 draft 복원

4. **Lifecycle**:
   - `visibilitychange` → draft 저장
   - `beforeunload` → draft 저장

5. **History 패널**:
   - Quick keys 위에 슬라이드업으로 표시
   - 항목 클릭 → 입력창에 채우고 패널 닫기

### localStorage Helper

```javascript
function getHistory(agentId) {
  try {
    return JSON.parse(localStorage.getItem(`kratos_input_history_${agentId}`)) || [];
  } catch { return []; }
}

function pushHistory(agentId, text) {
  const history = getHistory(agentId);
  // 중복 방지
  if (history.length > 0 && history[0].text === text) return;
  history.unshift({ text, ts: Date.now() });
  if (history.length > 500) history.length = 500;
  localStorage.setItem(`kratos_input_history_${agentId}`, JSON.stringify(history));
}

function saveDraft(agentId, text) {
  localStorage.setItem(`kratos_input_draft_${agentId}`, text);
}

function loadDraft(agentId) {
  return localStorage.getItem(`kratos_input_draft_${agentId}`) || '';
}
```

## Implementation Order

1. Quick keys 자동 숨기기 (input focus/blur)
2. localStorage 히스토리/드래프트 헬퍼 함수
3. handleInputSend에 히스토리 저장 연동
4. draft 자동 저장/복원 (onChange, visibilitychange, beforeunload, mount)
5. History UI 패널
6. 하단 바에 `Keys` + `Hist` 버튼 배치
