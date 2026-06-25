# Phase 6: Swipe Text Mode

## Overview

모바일 터미널에서 세로 스와이프로 Text 모드 전환. xterm과 유사한 스타일, 탭으로 복귀.

## Features

### 1. 스와이프 다운 → Text 모드 전환 (모바일 only)

- 터미널 화면에서 세로 아래 스와이프 감지
- `touchstart` → `touchend` Y 차이가 임계값(80px+) 이상이면 전환
- 전환 즉시 `tmux capture-pane` 호출하여 텍스트 로드
- 로드 후 하단으로 자동 스크롤
- **첫 드래그의 Y 이동량만큼 초기 스크롤 오프셋 적용** → 드래그 시작 시점부터 스크롤 느낌

### 2. xterm 스타일 매칭

- 폰트: `JetBrains Mono` (xterm과 동일)
- 폰트 크기: 13px (xterm과 동일)
- 전경색: `#e0e0e0` (xterm theme.foreground)
- ANSI 이스케이프 코드 제거 (순수 텍스트)

### 3. 배경색 차이

- Terminal: `#0a0a0a` (xterm 기본)
- Text 모드: `#1a1a1a` (살짝 밝은 회색) → 다른 모드임을 인지
- 상단에 얇은 표시줄: "TEXT MODE — tap to return" (옅은 색)

### 4. 탭으로 복귀

- Text 모드 화면 아무 곳이나 탭 → Terminal 복귀
- 스크롤 중 탭은 무시 (스크롤 끝나고 탭해야 복귀)
- 구현: `onClick` + 스크롤 중 flag로 구분

## 기술 검토

### 터치 이벤트 충돌

- **xterm.js 터치 이벤트**: xterm은 터치를 내부적으로 처리하지만, 모바일에서 canvas 위 터치 선택은 효용 없음
- **해결**: xterm 컨테이너 위에 투명 오버레이를 두고 터치 이벤트를 감지. 일반 탭은 xterm에 전달(포커스), 세로 스와이프만 가로챔
- **위험**: xterm에 직접 타이핑하는 사용자가 있을 수 있지만, 모바일에서는 하단 입력기를 사용하므로 문제 없음

### 스크롤과 탭 구분

- `touchstart` 시 좌표 기록
- `touchend` 시 좌표 비교
  - Y 이동 > 80px → 스와이프 (Text 모드 전환)
  - 이동 < 10px → 탭 (Text 모드에서 복귀)
  - 그 외 → 무시 (스크롤 중)
- Text 모드에서의 일반 스크롤은 자연스러운 `overflow-y: auto`

### ANSI 코드 제거

- `tmux capture-pane -p` 는 `-e` 없이 호출하면 plain text 반환
- 현재 Text API(`/api/agents/:id/terminal/text`)가 이미 plain text 반환
- 추가 처리 불필요

### 폴링 vs 1회 캡처

- Text 모드 진입 시 1회 캡처
- 5초 간격 자동 폴링 (diff 비교하여 변경 시만 DOM 업데이트)
- Text 모드 탈출 시 폴링 중지

### 데스크탑 영향

- 스와이프 감지는 `isMobile` 조건부 → 데스크탑에서는 전혀 영향 없음
- 데스크탑은 기존 Terminal/Text 탭 전환 유지

## 구현 순서

1. TerminalPanel에 스와이프 감지 오버레이 (모바일 only)
2. Text 모드 상태 + 캡처 로직
3. Text 모드 렌더링 (xterm 스타일, 회색 배경, 상단 표시줄)
4. 탭 복귀 로직
5. 자동 폴링 (5초, diff)
6. 첫 드래그 스크롤 오프셋

## 데스크탑: wheel2txt 스위치

### 개요
Header 상단 바, Focus 알람 스위치 왼쪽에 `[v] wheel2txt` 토글 스위치 (데스크탑 only). localStorage 저장.

### 동작
- **스위치 ON + wheel up** → Text 모드 진입 (과거 로그를 보기 위해)
- **스위치 ON + wheel down은 무시** (진입 트리거가 아님)
- **Text 모드에서 스크롤 자유** (위아래 모두)
- **Text 모드에서 맨 아래 도달 + 추가 wheel down** → Terminal 복귀
  - 연속 wheel이 아닌, 맨 아래 정지 후 새로운 wheel down만 감지
  - 구현: 맨 아래 도달 시 `atBottom` flag → 다음 wheel down 이벤트 시 복귀 → 스크롤 이동이 있으면 flag 리셋
- **스위치 OFF** → 기존 xterm 스크롤백 동작 유지

### 구현
- xterm 컨테이너에 `wheel` 이벤트 리스너 (스위치 ON일 때만)
- `e.deltaY < 0` (wheel up) → `e.preventDefault()` + Text 모드 진입
- Text 모드 컨테이너의 `wheel` + `scroll` 이벤트로 복귀 감지

## 실제 구현 결과

### 불가능했던 것
- **wheel override**: xterm.js canvas가 이벤트를 내부 소비하여 외부에서 가로채기 불가
- **모바일 스와이프**: pull-to-refresh와 충돌, xterm canvas가 터치 이벤트 소비
- **모바일 더블탭**: xterm canvas 위에서 이벤트 전달 안 됨
- **W2T 스위치**: 위 이유로 동작하지 않아 제거

### 최종 구현: 플로팅 TXT 스트립
- xterm 우측에 40px 전체 높이 반투명 스트립 (모바일 + 데스크탑)
- **탭** → Text 모드 진입
- **드래그** → Text 모드 진입 + fast scroll (Y 위치 = 스크롤 비율)
- Text 모드에서 우측 TERM 스트립:
  - **탭** → Terminal 복귀
  - **드래그** → fast scroll 유지
  - 라벨: "DRAG SCROLL · TAP BACK"
- Text 모드 스타일: #151515 배경, xterm과 동일 폰트
- 5초 자동 폴링 (diff 비교, 깜빡임 없음)
- 데스크탑: 기존 Terminal/Text 탭 전환 유지

## Status: DONE (2026-06-25)
