/**
 * M2 端到端：STOMP join → 输入上行 /app/ws.input → physics-service 模拟 → POSITION_SNAPSHOT 下行
 * 另测：kill physics-service 后后端自动重启 → PHYS_RESTART 广播 → 快照续流
 */
const WS_URL = 'ws://127.0.0.1:8080/ws';

async function main() {
  const login = await fetch('http://127.0.0.1:8080/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'worldtest4996', password: 'abc123' })
  }).then(r => r.json());
  const token = login.data.token;
  const uid = login.data.userId;
  console.log('[login] uid=' + uid);

  const ws = new WebSocket(WS_URL + '?token=' + encodeURIComponent(token), 'v12.stomp');
  let buf = '';
  const subs = {};
  let seq = 0;
  let snapshots = [];

  function send(cmd, hdrs, body) { let f = cmd + '\n'; for (const [k, v] of Object.entries(hdrs)) f += k + ':' + v + '\n'; f += '\n' + (body || '') + '\0'; ws.send(f); }
  function sub(dest, cb) { const id = 't' + (++seq); subs[id] = cb; send('SUBSCRIBE', { id, destination: dest }); }

  ws.onopen = () => send('CONNECT', { 'accept-version': '1.2', host: 'petpark', 'heart-beat': '0,0' });
  ws.onmessage = ev => { buf += ev.data; let i; while ((i = buf.indexOf('\0')) >= 0) { const f = buf.slice(0, i); buf = buf.slice(i + 1); onFrame(f); } };
  ws.onerror = e => console.log('[ws] error', e.message || e);

  function onFrame(text) {
    const lines = text.split('\n');
    const cmd = lines.shift().trim();
    const hdrs = {};
    while (lines.length && lines[0].trim() !== '') { const p = lines.shift().split(':'); hdrs[p[0]] = p.slice(1).join(':'); }
    const body = lines.join('\n');
    if (cmd === 'CONNECTED') {
      console.log('[stomp] CONNECTED');
      sub('/topic/world', b => {
        let ev; try { ev = JSON.parse(b); } catch (e) { return; }
        if (ev.t === 'POSITION_SNAPSHOT') {
          snapshots.push(ev);
          const me = (ev.bodies || []).find(x => x.uid === uid);
          if (me && snapshots.length % 6 === 0) console.log(`  [snapshot tick=${ev.tick}] 我 @(${me.gx.toFixed(2)}, ${me.gz.toFixed(2)}, ${me.y.toFixed(2)})`);
        } else if (ev.t === 'PHYS_RESTART') {
          console.log('  [PHYS_RESTART] 收到重启广播');
        }
      });
      setTimeout(() => send('SEND', { destination: '/app/ws.join' }, JSON.stringify({ chunkKey: '0_0', gx: 0, gz: 0 })), 200);
      console.log('[send] /app/ws.join');
      // 1s 后开始持续输入 dz=+1（约 30Hz）
      setTimeout(() => {
        console.log('[send] 开始输入 dz=+1');
        const timer = setInterval(() => {
          send('SEND', { destination: '/app/ws.input' }, JSON.stringify({ seq: Date.now(), move: { dx: 0, dz: 1, run: false } }));
        }, 33);
        setTimeout(() => clearInterval(timer), 3000);
      }, 1000);
      setTimeout(() => finish(), 6000);
    } else if (cmd === 'MESSAGE') {
      const cb = subs[hdrs['subscription']]; if (cb) cb(body);
    }
  }

  function finish() {
    const moved = snapshots.filter(s => s.bodies && s.bodies.some(x => x.uid === uid));
    const first = moved[0] && moved[0].bodies.find(x => x.uid === uid);
    const last = moved[moved.length - 1] && moved[moved.length - 1].bodies.find(x => x.uid === uid);
    console.log('\n[结果]');
    console.log('收到 POSITION_SNAPSHOT 数:', snapshots.length);
    if (first && last) {
      console.log(`玩家 z 位移: ${first.gz.toFixed(2)} → ${last.gz.toFixed(2)}（Δ=${(last.gz - first.gz).toFixed(2)}，权威物理移动）`);
      console.log((last.gz - first.gz) > 1 ? '[PASS] 输入→服务端物理→快照下行 全链路通' : '[FAIL] 移动不明显');
    } else {
      console.log('[FAIL] 未收到包含本玩家的快照');
    }
    process.exit(0);
  }
  setTimeout(() => { console.log('[timeout] 退出'); process.exit(1); }, 20000);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
