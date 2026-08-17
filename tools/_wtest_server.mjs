import WebSocket from 'ws';

const WS_URL = 'ws://localhost:8080/ws?token=';
const HTTP = 'http://localhost:8080';
const INVITE = 'dudu2019';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function frame(cmd, headers, body) {
  let s = cmd + '\n';
  for (const [k, v] of Object.entries(headers)) s += `${k}:${v}\n`;
  s += '\n';
  if (body) s += body;
  return s + '\0';
}

// 4 个方向：dx,dz（绕开出生点朝向，取最大位移）
const DIRS = [
  { name: 'N', dx: 0, dz: 1 },
  { name: 'S', dx: 0, dz: -1 },
  { name: 'E', dx: 1, dz: 0 },
  { name: 'W', dx: -1, dz: 0 },
];

(async () => {
  const uname = 'srv' + (Date.now() % 100000);
  const reg = await fetch(HTTP + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: uname, password: 'Test1234', nickname: uname,
      confirmPassword: 'Test1234', inviteCode: INVITE, education: 'PRIMARY_1', gender: 'M' })
  }).then(r => r.json());
  if (!reg.data || !reg.data.token) { console.log('REG FAIL', JSON.stringify(reg).slice(0,200)); return; }
  const uid = reg.data.userId;
  const token = reg.data.token;
  console.log('registered uid=', uid);

  const ws = new WebSocket(WS_URL + encodeURIComponent(token), 'v12.stomp');
  let connected = false;
  let buf = '';
  const snaps = [];
  let seq = 0;
  const lastPos = () => snaps.length ? snaps[snaps.length - 1] : null;

  ws.on('open', () => {
    ws.send(frame('CONNECT', { 'accept-version': '1.2', host: 'petpark', 'heart-beat': '10000,10000' }));
  });
  ws.on('message', (data) => {
    buf += data.toString();
    let idx;
    while ((idx = buf.indexOf('\0')) >= 0) {
      const fr = buf.slice(0, idx); buf = buf.slice(idx + 1);
      const lines = fr.split('\n');
      const cmd = (lines.shift() || '').trim();
      if (cmd === 'CONNECTED') {
        connected = true;
        ws.send(frame('SUBSCRIBE', { id: 'sub-1', destination: '/topic/world' }));
        ws.send(frame('SEND', { destination: '/app/ws.join', 'content-type': 'application/json' },
          JSON.stringify({ chunkKey: '78_-48', gx: 1256, gz: -760 })));
      } else if (cmd === 'MESSAGE') {
        const jsonStart = fr.indexOf('{');
        if (jsonStart >= 0) {
          try {
            const ev = JSON.parse(fr.slice(jsonStart));
            if (ev.t === 'POSITION_SNAPSHOT' && Array.isArray(ev.bodies)) {
              const b = ev.bodies.find(b => Number(b.uid) === Number(uid));
              if (b) snaps.push({ gx: b.gx, gz: b.gz, t: Date.now() });
            }
          } catch {}
        }
      }
    }
  });
  ws.on('error', e => console.log('WS ERR', String(e)));

  for (let i = 0; i < 50 && !connected; i++) await sleep(100);
  if (!connected) { console.log('WS NOT CONNECTED'); ws.close(); return; }
  await sleep(500);
  console.log('spawn pos:', JSON.stringify(lastPos()));

  const results = [];
  for (const d of DIRS) {
    // 等到有快照，记录起点
    const before = lastPos();
    const iv = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(frame('SEND', { destination: '/app/ws.input', 'content-type': 'application/json' },
          JSON.stringify({ seq: seq++, move: { dx: d.dx, dz: d.dz, run: false } })));
      }
    }, 33);
    await sleep(1200);
    clearInterval(iv);
    // 等 0.4s 让最后快照到达
    await sleep(400);
    const after = lastPos();
    let disp = 0;
    if (before && after) disp = Math.hypot(after.gx - before.gx, after.gz - before.gz);
    results.push({ dir: d.name, disp });
    console.log(`dir ${d.name}: displacement = ${disp.toFixed(2)}`);
    // 停一下
    ws.send(frame('SEND', { destination: '/app/ws.input', 'content-type': 'application/json' },
      JSON.stringify({ seq: seq++, move: { dx: 0, dz: 0, run: false } })));
    await sleep(300);
  }

  const max = results.reduce((m, r) => Math.max(m, r.disp), 0);
  console.log('--- max displacement over 1.2s =', max.toFixed(2), '(expected ~4.8 if healthy: 4u/s * 1.2s)');
  console.log(max > 3 ? 'SERVER MOVEMENT OK ✅' : 'SERVER MOVEMENT WEAK/STUCK ❌');
  ws.close();
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
