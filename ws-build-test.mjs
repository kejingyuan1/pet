/* 验证 WS 成功放置 → OBJECT_ADD 广播（O4 加固：遍历多 chunk，无目标时给出明确提示而非崩溃） */
const token = await fetch('http://127.0.0.1:8080/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:'worldtest4996', password:'abc123'})}).then(r=>r.json()).then(d=>d.data.token);

/** 在若干 chunk 内找"平坦 grass 且未占用"的目标格；找不到返回 null */
async function findBuildableCell() {
  const chunks = [[0,0],[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,-1]];
  for (const [cx, cz] of chunks) {
    const chunk = await fetch(`http://127.0.0.1:8080/api/world/chunk?cx=${cx}&cz=${cz}`).then(r=>r.json()).then(d=>d.data);
    const h = chunk.height;
    const occupied = new Set();
    const objs = await fetch(`http://127.0.0.1:8080/api/world/objects?cx=${cx}&cz=${cz}`).then(r=>r.json()).then(d=>d.data||[]);
    for (const o of objs) occupied.add(o.gx + '_' + o.gz);
    for (let lz = 0; lz < 63; lz++) {
      for (let lx = 0; lx < 63; lx++) {
        const s = chunk.semantic[lz*64+lx];
        const slope = Math.max(Math.abs(h[lz*65+lx]-h[lz*65+lx+1]), Math.abs(h[lz*65+lx]-h[(lz+1)*65+lx]));
        if (s === 2 && slope < 0.2 && !occupied.has((cx*64+lx) + '_' + (cz*64+lz))) {
          return { gx: cx*64+lx, gz: cz*64+lz, chunkKey: `${cx}_${cz}` };
        }
      }
    }
  }
  return null;
}

const target = await findBuildableCell();
if (!target) {
  console.log('[skip] 遍历 7 个 chunk 均无满足条件的平坦 grass 格（或全部被占用），无法执行放置验证，请换数据或清空 world_objects 后重试');
  process.exit(0);
}
console.log('target cell:', target, 'chunkKey:', target.chunkKey);

const ws = new WebSocket('ws://127.0.0.1:8080/ws?token='+encodeURIComponent(token), 'v12.stomp');
let buf = '';
const subs = {};
let seq = 0;
let sawObjectAdd = false;
function send(cmd, hdrs, body) { let f = cmd + '\n'; for (const [k,v] of Object.entries(hdrs)) f += k + ':' + v + '\n'; f += '\n' + (body||'') + '\0'; ws.send(f); }
function sub(dest, cb) { const id = 't'+(++seq); subs[id] = cb; send('SUBSCRIBE', {id, destination: dest}); }
function onFrame(text) {
  const lines = text.split('\n');
  const cmd = lines.shift().trim();
  const hdrs = {};
  while (lines.length && lines[0].trim() !== '') { const p = lines.shift().split(':'); hdrs[p[0]] = p.slice(1).join(':'); }
  const body = lines.join('\n');
  if (cmd === 'CONNECTED') {
    sub('/topic/world', b => { const ev = JSON.parse(b); if (ev.t === 'OBJECT_ADD') { sawObjectAdd = true; console.log('[topic/world] OBJECT_ADD:', ev.object.type, '@', ev.object.gx, ev.object.gz, 'owner', ev.object.owner.nickname); } });
    sub('/user/queue/reply', b => console.log('[reply]', b.slice(0,120)));
    setTimeout(() => send('SEND', {destination:'/app/ws.join'}, JSON.stringify({chunkKey: target.chunkKey, gx: target.gx, gz: target.gz})), 200);
    setTimeout(() => send('SEND', {destination:'/app/ws.build'}, JSON.stringify({gx: target.gx, gz: target.gz, objectType: 'wood_house'})), 800);
    setTimeout(() => { console.log(sawObjectAdd ? '[PASS] 收到 OBJECT_ADD 广播' : '[FAIL] 未收到 OBJECT_ADD 广播'); process.exit(sawObjectAdd ? 0 : 1); }, 2500);
  } else if (cmd === 'MESSAGE') {
    const cb = subs[hdrs['subscription']];
    if (cb) cb(body);
  }
}
ws.onopen = () => send('CONNECT', {'accept-version':'1.2', host:'petpark', 'heart-beat':'0,0'});
ws.onmessage = ev => { buf += ev.data; let i; while ((i = buf.indexOf('\0')) >= 0) { const f = buf.slice(0, i); buf = buf.slice(i+1); onFrame(f); } };
ws.onerror = e => console.log('ws error', e.message || e);
