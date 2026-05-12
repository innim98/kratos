# PTY Leak Investigation & Resolution

## Timeline

| Date | Event |
|------|-------|
| 05-05 | 첫 `posix_spawnp failed` 발생. PTY 527개, max 511 |
| 05-07 | 재발. PTY 527개. `ptmx_max`를 900으로 증가 |
| 05-09 | 재발. 900 한도 도달. `ptmx_max`를 계속 올려야 하는 상황 |
| 05-10 | 근본 원인 발견 및 수정 |

---

## Phase 1: 초기 진단 (05-05)

### 증상
Terminal attach 시 `posix_spawnp failed` 에러.

### 가설 1: Claude Code 세션이 bash pool을 과다 생성
```
모든 tmux 세션이 14개 bash child를 가지고 있음
14 sessions × 14 bash = 196 bash → PTY 한도 초과
```

### 조치
`kern.tty.ptmx_max`를 511 → 900으로 증가 (임시 해결)

### 판단
"Kratos PTY 누수가 아니라 Claude Code의 정상 동작" — **이 결론은 틀렸음**

---

## Phase 2: 재발 및 혼동 (05-07 ~ 05-09)

### 증상
`ptmx_max`를 올려도 계속 한도 도달.

### 가설 2: PTY 디바이스 파일이 회수되지 않고 누적
```
ls /dev/ttys* | wc -l  →  904
lsof /dev/ttys* | awk '{print $9}' | sort -u | wc -l  →  23
```
"904개 파일이 있지만 23개만 사용 중, 나머지는 고아 파일" — **이 결론도 틀렸음**

### 오류 원인
- `lsof /dev/ttys*`로 **slave side**만 확인
- PTY **master side** (`/dev/ptmx` FD)를 확인하지 않음
- macOS에서 `/dev/ttys*` 파일 수 = 현재 열린 PTY 수라는 사실을 몰랐음

---

## Phase 3: 근본 원인 발견 (05-10)

### macOS PTY 동작 원리 (XNU 커널 소스 확인)

```
open("/dev/ptmx")
  → ptmx_clone(): index 0부터 선형 스캔, 첫 빈 슬롯 할당
  → devfs_make_node(): /dev/ttys### 생성
  
close(master) + close(slave)
  → ptmx_free_ioctl(): 슬롯 NULL로 표시
  → devfs_remove(): /dev/ttys### 삭제
```

**핵심 사실:**
- `/dev/ttys*` 파일 수 = 동시 열린 PTY 수 (고아 없음)
- 번호는 재사용됨 (lowest-first)
- `ptmx_max` = 동시 할당 최대 수 (하드 맥스 999)

### 실제 누수 확인

```bash
lsof /dev/ptmx | awk 'NR>1 {print $1, $2}' | sort | uniq -c | sort -rn
# 872 node 48685    ← Kratos 서버!
#  15 tmux 8678
#   8 Cursor 90111
```

**Kratos 서버 프로세스가 872개 PTY master FD를 잡고 있었음.**

---

## Phase 4: 근본 원인 분석

### node-pty의 kill() vs destroy()

| Method | 동작 | Master FD |
|--------|------|-----------|
| `kill()` | 자식 프로세스에 SIGHUP 전송 | **닫히지 않음** |
| `destroy()` | socket.destroy() → master FD close → SIGHUP | **닫힘** |

### 누수 메커니즘

```
1. 브라우저가 WS 연결 → pty.spawn() → master FD 열림
2. 브라우저 탭 닫힘/네트워크 끊김 → socket.on('close') → cleanupPty()
3. cleanupPty()에서 p.kill() 호출
4. 자식 프로세스(tmux attach)는 죽지만 master FD는 열린 채 남음
5. PTY가 커널에서 회수되지 않음
6. 반복 → PTY 누적 → ptmx_max 도달 → posix_spawnp failed
```

### 추가 악화 요인
- 모바일/태블릿에서 화면 잠금 → WS 끊김 → 빈번한 cleanup
- 여러 탭에서 같은 에이전트 접속 → `tmux attach -d`로 이전 연결 강제 분리
- `onExit` 콜백이 먼저 불려 `ptyProcess = null` → cleanup에서 참조 잃음

---

## Phase 5: 수정

### Before (누수)
```javascript
function cleanupPty() {
  // ...
  try { p.kill(); } catch {}  // 프로세스만 죽임, FD는 그대로
  setTimeout(() => { try { p.kill('SIGKILL'); } catch {} }, 500);
}
```

### After (수정)
```javascript
function cleanupPty() {
  // ...
  try { p.destroy(); } catch {}  // socket close → FD close → PTY 해제
  setTimeout(() => {
    if (pid) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  }, 1000);
}
```

### 검증
```
서버 재시작 전: 900 PTYs (한도 꽉 참)
서버 재시작 후: 28 PTYs (정상)
```

---

## 교훈

1. **`lsof /dev/ttys*`는 slave side만 보여줌.** Master FD 누수 확인은 `lsof /dev/ptmx`로 해야 함
2. **macOS에서 `/dev/ttys*` 파일 수 = 열린 PTY 수.** 고아 파일은 존재하지 않음
3. **node-pty의 `kill()` ≠ PTY 해제.** 반드시 `destroy()`를 호출해야 master FD가 닫힘
4. **시스템 한도를 올리는 것은 누수를 숨길 뿐** 근본 해결이 아님

---

## 진단 명령어 레퍼런스

```bash
# 현재 열린 PTY 수
ls /dev/ttys[0-9][0-9][0-9] | wc -l

# PTY master를 잡고 있는 프로세스 (누수 확인)
lsof /dev/ptmx | awk 'NR>1 {print $1, $2}' | sort | uniq -c | sort -rn

# 시스템 한도 확인
sysctl kern.tty.ptmx_max

# 한도 변경 (임시)
sudo sysctl -w kern.tty.ptmx_max=1024
```
