/* 大世界 WS 冒烟测试：STOMP 握手 / join 快照 / position 广播 / build 广播 */
const WS_URL = 'ws://127.0.0.1:8080/ws';

async function main() {
  // 登录拿 token
  const loginRes = await fetch('http://127.0.0.1:8080/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'worldtest4996', password: 'abc123' })
  }).then(r => r.json());
  const token = loginRes.data.token;
  console.log('[login] code=' + loginRes.code + ' uid=' + loginRes.data.userId);

  const ws = new WebSocket(WS_URL + '?token=' + encodeURIComponent(token), 'v12.stomp');
  let buf = '';
  let connected = false;
  const subs = {}; // id -> {dest, cb}
  let subSeq = 0;
  let step = 0;

  function sendFrame(cmd, headers, body) {
    let h = cmd + '\n';
    for (const [k, v] of Object.entries(headers)) h += k + ':' + v + '\n';
    h += '\n' + (body || '') + '\0';
    ws.send(h);
  }
  function sub(dest, cb) {
    const id = 't' + (++subSeq);
    subs[id] = { dest, cb };
    sendFrame('SUBSCRIBE', { id, destination: dest });
  }
  function handleFrame(text) {
    const lines = text.split('\n');
    const cmd = (lines.shift() || '').trim();
    const headers = {};
    while (lines.length && lines[0].trim() !== '') {
      const p = lines.shift().split(':');
      headers[p[0]] = p.slice(1).join(':');
    }
    const body = lines.join('\n');
    if (cmd === 'CONNECTED') {
      connected = true;
      console.log('[stomp] CONNECTED');
      sub('/topic/world', (h, b) => console.log('  [topic/world] ' + b.slice(0, 140)));
      sub('/topic/players', (h, b) => console.log('  [topic/players] ' + b.slice(0, 140)));
      sub('/user/queue/reply', (h, b) => console.log('  [user/queue/reply] ' + b.slice(0, 300)));
      // join
      setTimeout(() => {
        sendFrame('SEND', { destination: '/app/ws.join' }, JSON.stringify({ chunkKey: '0_0', gx: 3, gz: 3 }));
        console.log('[send] /app/ws.join');
      }, 300);
    } else if (cmd === 'MESSAGE') {
      const sid = headers['subscription'];
      const s = subs[sid];
      if (s) s.cb(headers, body);
    } else if (cmd === 'ERROR') {
      console.log('[stomp] ERROR: ' + body);
    }
  }

  ws.onopen = () => {
    console.log('[ws] open');
    sendFrame('CONNECT', { 'accept-version': '1.2', host: 'petpark', 'heart-beat': '0,0' });
  };
  ws.onmessage = ev => {
    buf += ev.data;
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 1);
      handleFrame(frame);
    }
  };
  ws.onerror = e => console.log('[ws] error', e.message || e);

  // 阶段脚本：join 后 1s 发 position，再 1s 发 build
  setTimeout(() => {
    sendFrame('SEND', { destination: '/app/ws.position' }, JSON.stringify({ gx: 4, gz: 4, y: 1.5, rot: 0.3 }));
    console.log('[send] /app/ws.position');
  }, 1500);
  setTimeout(() => {
    sendFrame('SEND', { destination: '/app/ws.build' }, JSON.stringify({ gx: 2, gz: 10, objectType: 'wood_house' }));
    console.log('[send] /app/ws.build @(2,10)');
  }, 2500);
  setTimeout(() => { console.log('[done] 测试结束'); process.exit(0); }, 5000);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
