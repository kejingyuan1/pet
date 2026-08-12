/* QA 独立验证：WS build → OBJECT_ADD 广播（遍历多 chunk 找平坦 grass 避免脚本脆弱性） */
const token = await fetch('http://127.0.0.1:8080/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:'worldtest4996', password:'abc123'})}).then(r=>r.json()).then(d=>d.data.token);

// 遍历多 chunk 找平坦 grass 且未占用 cell
const SEARCH = [[0,1],[-1,0],[1,0],[0,0],[2,0]];
let target = null, baseCx = 0, baseCz = 0;
outer:
for (const [cx,cz] of SEARCH) {
  const chunk = await fetch(`http://127.0.0.1:8080/api/world/chunk?cx=${cx}&cz=${cz}`).then(r=>r.json()).then(d=>d.data);
  const h = chunk.height;
  const occupied = new Set();
  for (const o of (chunk.objects||[])) occupied.add(o.gx + '_' + o.gz);
  const bx = cx*64, bz = cz*64;
  for (let lz = 0; lz < 63; lz++) {
    for (let lx = 0; lx < 63; lx++) {
      const gx = bx + lx, gz = bz + lz;
      if (occupied.has(gx + '_' + gz)) continue;
      const s = chunk.semantic[lz*64+lx];
      const slope = Math.max(Math.abs(h[lz*65+lx]-h[lz*65+lx+1]), Math.abs(h[lz*65+lx]-h[(lz+1)*65+lx]));
      if (s === 2 && slope < 0.2) { target = { gx, gz }; baseCx = cx; baseCz = cz; break outer; }
    }
  }
}
if (!target) { console.log('FAIL: 未找到可放置平坦 grass cell'); process.exit(2); }
console.log('target cell:', target, 'chunk:', baseCx + '_' + baseCz);

const ws = new WebSocket('ws://127.0.0.1:8080/ws?token='+encodeURIComponent(token), 'v12.stomp');
let buf = '';
const subs = {};
let seq = 0, gotAdd = false, gotResult = null;
function send(cmd, hdrs, body) { let f = cmd + '\n'; for (const [k,v] of Object.entries(hdrs)) f += k + ':' + v + '\n'; f += '\n' + (body||'') + '\0'; ws.send(f); }
function sub(dest, cb) { const id = 't'+(++seq); subs[id] = cb; send('SUBSCRIBE', {id, destination: dest}); }
function onFrame(text) {
  const lines = text.split('\n');
  const cmd = lines.shift().trim();
  const hdrs = {};
  while (lines.length && lines[0].trim() !== '') { const p = lines.shift().split(':'); hdrs[p[0]] = p.slice(1).join(':'); }
  const body = lines.join('\n');
  if (cmd === 'CONNECTED') {
    sub('/topic/world', b => {
      const ev = JSON.parse(b);
      if (ev.t === 'OBJECT_ADD') {
        gotAdd = true;
        console.log('[topic/world] OBJECT_ADD:', ev.object.type, '@', ev.object.gx, ev.object.gz, 'owner', ev.object.owner.nickname, 'chunkKey', ev.chunkKey);
      }
    });
    sub('/user/queue/reply', b => {
      const ev = JSON.parse(b);
      if (ev.t === 'BUILD_RESULT') { gotResult = ev; console.log('[reply] BUILD_RESULT code=' + ev.code + ' msg=' + ev.msg + (ev.object ? ' id=' + ev.object.id : '')); }
    });
    setTimeout(() => send('SEND', {destination:'/app/ws.join'}, JSON.stringify({chunkKey: baseCx + '_' + baseCz, gx: 3, gz: 3})), 200);
    setTimeout(() => send('SEND', {destination:'/app/ws.build'}, JSON.stringify({gx: target.gx, gz: target.gz, objectType: 'wood_house'})), 800);
    setTimeout(() => {
      console.log('\n=== 汇总 ===');
      console.log('OBJECT_ADD 广播:', gotAdd ? 'PASS' : 'FAIL');
      console.log('BUILD_RESULT:', gotResult ? (gotResult.code === 0 ? 'PASS' : 'FAIL code=' + gotResult.code) : '未收到');
      process.exit(gotAdd && gotResult && gotResult.code === 0 ? 0 : 1);
    }, 2500);
  } else if (cmd === 'MESSAGE') {
    const cb = subs[hdrs['subscription']];
    if (cb) cb(body);
  }
}
ws.onopen = () => send('CONNECT', {'accept-version':'1.2', host:'petpark', 'heart-beat':'0,0'});
ws.onmessage = ev => { buf += ev.data; let i; while ((i = buf.indexOf('\0')) >= 0) { const f = buf.slice(0, i); buf = buf.slice(i+1); onFrame(f); } };
ws.onerror = e => { console.log('ws error', e.message || e); process.exit(3); };
