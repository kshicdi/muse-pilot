# muse-pilot

Meta의 개인 AI 에이전트 **Muse(muse.ai)** 를 터미널에서 제어하는 [Claude Code](https://claude.com/claude-code) 스킬입니다.

오래 걸리는 웹 조사·가격 추적 같은 작업을 뮤즈에게 외주 주고, 완료되면 알림을 받아 결과만 수거합니다. AI 토큰은 판단에만 쓰고, 단순 반복 조사는 뮤즈가 하는 패턴입니다.

```
node muse.mjs send "○○ 조사해줘. 끝나면 완료됐다고 알려줘."
node muse.mjs watch    # 완료 감시 (+텔레그램 알림)
node muse.mjs read     # 결과 수거
```

## 동작 원리

새 브라우저를 띄우지 않습니다. 이미 로그인된 **내 크롬**에 CDP(Chrome DevTools Protocol, 포트 9222)로 붙어 muse.ai 탭을 직접 제어합니다. 그래서 별도 API 키나 서버 없이, npm 설치조차 없이(Node 21+ 내장 fetch/WebSocket만 사용) 동작합니다.

## 설치

Claude Code 스킬로 쓰려면:

```bash
git clone https://github.com/kshicdi/muse-pilot.git ~/.claude/skills/muse-pilot
```

Claude Code 없이 스크립트만 써도 됩니다 — `muse.mjs` 하나가 전부입니다.

## 준비물 (1회)

1. **Muse 계정** — muse.ai 가입·로그인 (한국은 미국 VPN 필요)
2. **Node 21+** — `node -v`로 확인
3. **크롬을 디버깅 포트로 실행** (이미 떠 있으면 완전히 종료 후):
   ```bash
   open -a "Google Chrome" --args --remote-debugging-port=9222
   ```
4. 크롬에서 https://muse.ai 접속 + 로그인 탭 하나 열어두기

> 💡 가입 시 48시간 내 초대 코드를 입력하면 쌍방 토큰 10억 개를 받습니다. 초대 코드: **021F65**

## 명령

```bash
node muse.mjs check                 # 연결·탭 확인
node muse.mjs send "과업 내용"       # 뮤즈에게 과업 전송
node muse.mjs status                # WORKING / DONE 상태
node muse.mjs read 2000             # 대화 뒷부분 읽기
node muse.mjs watch                 # 30초 간격 감시, 완료 감지 시 종료
```

과업 문구에 **"정리가 끝나면 완료됐다고 알려줘"** 를 포함하세요 — `watch`의 완료 감지에 필요합니다.

## 완료 시 텔레그램 알림 (선택)

```bash
TELEGRAM_BOT_TOKEN="봇토큰" TELEGRAM_CHAT_ID="chat_id" node muse.mjs watch
```

봇 만들기: 텔레그램 @BotFather → `/newbot` → 토큰 받기. chat_id는 봇에게 아무 메시지를 보낸 뒤 `https://api.telegram.org/bot<토큰>/getUpdates`에서 확인.

## 주의

- 뮤즈가 중간에 질문(선택지, 로그인, 캡차)을 하면 `watch`는 계속 WORKING으로 보입니다 — 오래 걸리면 `read`로 중간 확인하세요.
- 화면(DOM)을 제어하므로 muse.ai UI가 크게 바뀌면 셀렉터 수정이 필요할 수 있습니다 (2026-10 기준 동작 확인).
- 뮤즈 탭을 닫거나 크롬을 끄면 제어가 끊깁니다 (뮤즈 자체 작업은 서버에서 계속됩니다).

## 라이선스

MIT
