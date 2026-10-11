#!/usr/bin/env node
// muse.mjs — 내 크롬의 muse.ai 탭을 터미널에서 제어하는 미니 CLI
// 요구: Node 21+ (내장 fetch/WebSocket), 크롬을 --remote-debugging-port=9222 로 실행, muse.ai 로그인 상태
//
// 사용법:
//   node muse.mjs check                 # 연결·탭 확인
//   node muse.mjs send "과업 내용"       # 뮤즈에게 과업 전송
//   node muse.mjs status                # 마지막 대화 상태 (WORKING/DONE 추정)
//   node muse.mjs read [글자수]          # 대화 내용 뒷부분 읽기 (기본 1500자)
//   node muse.mjs watch                 # 30초 간격 감시, 완료 키워드 감지 시 출력 후 종료
//
// 환경변수(선택): MUSE_PORT(기본 9222)
//   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID 설정 시 watch 완료 때 텔레그램 알림 전송

const PORT = process.env.MUSE_PORT || '9222';
const [cmd, ...rest] = process.argv.slice(2);

async function connect() {
  let targets;
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  } catch {
    console.error(`크롬 CDP(${PORT}) 연결 실패. 크롬을 이렇게 실행하세요:\n  open -a "Google Chrome" --args --remote-debugging-port=${PORT}\n(이미 떠 있으면 완전히 종료 후 재실행)`);
    process.exit(1);
  }
  const page = targets.find(t => t.type === 'page' && t.url.includes('muse.ai'));
  if (!page) {
    console.error('muse.ai 탭이 없습니다. 크롬에서 https://muse.ai 를 열고 로그인해두세요.');
    process.exit(1);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r?.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r?.result?.value;
  };
  return { page, ws, evalJs };
}

// 채팅 피드 텍스트 (사이드바 제외)
const FEED_EXPR = `(()=>{const f=document.querySelector('div[class*="chat-feed"]');return f?f.innerText:(document.querySelector('main')||document.body).innerText})()`;

const DONE_RE = /완료됐|완료했|정리를 마쳤|마무리했|조사가 끝났|작업(이|을) 끝|여기까지 정리/;

async function telegramNotify(text) {
  const tok = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!tok || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text })
    });
    console.log('(텔레그램 알림 전송됨)');
  } catch { console.log('(텔레그램 전송 실패 — 토큰/챗ID 확인)'); }
}

if (cmd === 'check') {
  const { page, ws } = await connect();
  console.log('OK:', page.title, '—', page.url);
  ws.close(); process.exit(0);

} else if (cmd === 'send') {
  const task = rest.join(' ').trim();
  if (!task) { console.error('과업 내용을 적어주세요: node muse.mjs send "조사해줘 ..."'); process.exit(1); }
  const { ws, evalJs } = await connect();
  const typed = await evalJs(`(()=>{const ta=document.querySelector('textarea');if(!ta)return null;ta.focus();document.execCommand('selectAll',false,null);document.execCommand('insertText',false,${JSON.stringify(task)});return ta.value})()`);
  if (!typed) { console.error('입력창(textarea)을 못 찾음 — muse.ai 채팅 화면인지 확인'); ws.close(); process.exit(1); }
  const sent = await evalJs(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>['보내기','Send'].includes(b.getAttribute('aria-label')));if(!b)return false;b.click();return true})()`);
  if (!sent) { console.error('보내기 버튼을 못 찾음'); ws.close(); process.exit(1); }
  await new Promise(r => setTimeout(r, 4000));
  const tail = (await evalJs(FEED_EXPR) || '').slice(-400).replace(/\n+/g, ' / ');
  console.log('전송 완료. 뮤즈 응답:\n' + tail);
  ws.close(); process.exit(0);

} else if (cmd === 'status' || cmd === 'read') {
  const { ws, evalJs } = await connect();
  const t = (await evalJs(FEED_EXPR)) || '';
  if (cmd === 'read') {
    console.log(t.slice(-(Number(rest[0]) || 1500)));
  } else {
    const tail = t.slice(-500);
    console.log((DONE_RE.test(tail) ? 'DONE' : 'WORKING') + ' | ' + tail.slice(-220).replace(/\n+/g, ' / '));
  }
  ws.close(); process.exit(0);

} else if (cmd === 'watch') {
  console.log('감시 시작 (30초 간격, 완료 감지 시 종료 — Ctrl+C로 중단)');
  while (true) {
    const { ws, evalJs } = await connect();
    const t = (await evalJs(FEED_EXPR)) || '';
    ws.close();
    const tail = t.slice(-500);
    const line = tail.slice(-180).replace(/\n+/g, ' / ');
    if (DONE_RE.test(tail)) {
      console.log('✅ 완료 감지:\n' + line);
      await telegramNotify('🤖 Muse 작업 완료\n\n' + tail.slice(-300));
      process.exit(0);
    }
    console.log('… 진행 중 | ' + line.slice(-100));
    await new Promise(r => setTimeout(r, 30000));
  }

} else {
  console.log(`사용법:
  node muse.mjs check                 연결·탭 확인
  node muse.mjs send "과업 내용"       뮤즈에게 과업 전송
  node muse.mjs status                상태 확인 (WORKING/DONE)
  node muse.mjs read [글자수]          대화 뒷부분 읽기
  node muse.mjs watch                 완료까지 감시 (+텔레그램 알림 옵션)`);
  process.exit(0);
}
