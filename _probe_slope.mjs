// 坡地移动探针：在 HY3D 视觉岛内找一个"旧网格判 MOUNTAIN(3)/高差>1.5"的坡地格 B，
// 从旁边可走格 A 向 B 走 3s，测服务端是否放行。
// 改前预期：BLOCKED（用户报"坡地 WASD 动不了"）；改后预期：MOVED。
import { createRequire } from 'module';
import http from 'node:http';
const require = createRequire(import.meta.url);
const { WebSocket } = require('C:\\Users\\ken\\.workbuddy\\binaries\\node\\workspace\\node_modules\\ws');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request({ host: '127.0.0.1', port: 8080, path, method, headers }, (res) => {
      let s = ''; res.on('data', d => s += d); res.on('end', () => resolve(s));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

// ---- 1. login ----
const loginRaw = await req('POST', '/api/auth/login', { username: 'wtest_ken', password: 'Test1234!' });
const token = JSON.parse(loginRaw)?.data?.token;
if (!token) { console.log('LOGIN FAILED:', loginRaw.slice(0, 200)); process.exit(1); }
console.log('[token] ok');

// ---- 2. world config ----
const cfgRaw = await req('GET', '/api/world/config', null, token);
const cfg = JSON.parse(cfgRaw)?.data;
const seedText = String(cfg?.seed || 'dudu2019');
console.log('[config] seed=%s spawn=(%s,%s)', seedText, cfg?.spawnX, cfg?.spawnZ);

// ---- 3. island centers（与服务端 buildIslands 确定性一致，BigInt 复刻） ----
const MASK = 0xFFFFFFFFFFFFFFFFn;
let base = 1125899906842597n;
for (let i = 0; i < seedText.length; i++) base = (31n * base + BigInt(seedText.charCodeAt(i))) & MASK;
const SALT_ISLAND = 0x1B873593n;
const scatterHash = (gx, gz, salt) => {
  let h = (base ^ salt) & MASK;
  h = (h * 6364136223846793005n + BigInt(gx) * 0x9E3779B97F4A7C15n) & MASK;
  h = (((h ^ (h >> 13n)) & MASK) * 0xBF58476D1CE4E5B9n) & MASK;
  h = h ^ (h >> 16n);
  h = (h * 0x94D049BB133111EBn) & MASK;
  h = h ^ (h >> 31n);
  h = (h + ((BigInt(gz) * 0x9E3779B97F4A7C15n) ^ BigInt(gz))) & MASK;
  h = (((h ^ (h >> 13n)) & MASK) * 0xBF58476D1CE4E5B9n) & MASK;
  h = h ^ (h >> 16n);
  return Number(h & 0xFFFFFFFFn) / 4294967296.0;
};
const ISLANDS = [];
for (let i = 0; i < 22; i++) {
  ISLANDS.push({
    cx: (scatterHash(i * 3 + 1, 777, SALT_ISLAND) - 0.5) * 2600,
    cz: (scatterHash(i * 3 + 2, 888, SALT_ISLAND) - 0.5) * 2600,
    r: 115 + scatterHash(i * 3 + 3, 999, SALT_ISLAND) * 75,
  });
}
const inIsland = (x, z, f = 0.85) => ISLANDS.some(c => {
  const rr = c.r * f, dx = x - c.cx, dz = z - c.cz;
  return dx * dx + dz * dz <= rr * rr;
});

// ---- 4. 在出生点附近岛上扫描坡地格对 (A 可走 → B 坡地) ----
const spawnX = cfg?.spawnX ?? 1256, spawnZ = cfg?.spawnZ ?? -760;
const home = ISLANDS.find(c => Math.hypot(spawnX - c.cx, spawnZ - c.cz) < c.r);
console.log('[island] home island center=(%s,%s) r=%s', home?.cx.toFixed(1), home?.cz.toFixed(1), home?.r?.toFixed(1));

const semOf = {};   // `${gx},${gz}` -> semantic code
const hOf = {};     // `${gx},${gz}` -> 顶点高（65×65 lx,lz）
async function loadChunkArea(cx0, cz0, cx1, cz1) {
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
    const raw = await req('GET', `/api/world/chunk?cx=${cx}&cz=${cz}`, null, token);
    const d = JSON.parse(raw)?.data;
    if (!d) { console.log('chunk %s,%s EMPTY', cx, cz); continue; }
    const S = 64, H = 65;
    for (let lz = 0; lz < S; lz++) for (let lx = 0; lx < S; lx++) {
      const gx = cx * S + lx, gz = cz * S + lz;
      semOf[`${gx},${gz}`] = d.semantic[lz * S + lx];
      hOf[`${gx},${gz}`] = d.height[lz * H + lx];
    }
  }
}
// 覆盖 home 岛中心附近 ±40 格
const ccx = Math.floor(home.cx / 64), ccz = Math.floor(home.cz / 64);
await loadChunkArea(ccx - 1, ccz - 1, ccx + 1, ccz + 1);
console.log('[scan] chunk area loaded, cells=%d', Object.keys(semOf).length);

// 找测试对：A=可走(sand1/grass2) 且在岛内且高于水线1.5；B=相邻格坡地（MOUNTAIN3 或 |Δh|>1.5，
// 排除水0/河10/树4/岩5）且在岛内、高于水线
let pair = null, pairInfo = null;
const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
const waterLevel = cfg?.waterLevel ?? -5;
const cands = [];   // 全部候选对，优先挑 MOUNTAIN 语义
for (const [ak, av] of Object.entries(hOf)) {
  const [ax, az] = ak.split(',').map(Number);
  const aSem = semOf[`${ax},${az}`];
  if (aSem !== 1 && aSem !== 2) continue;
  if (av < waterLevel + 1.5) continue; // 离水太近的沙滩不算（会被水判定挡）
  const aCx = ax + 0.5, aCz = az + 0.5;
  if (!inIsland(aCx, aCz)) continue;
  for (const [dx, dz] of DIRS) {
    const bx = ax + dx, bz = az + dz;
    const bKey = `${bx},${bz}`;
    if (!(bKey in semOf)) continue;
    const bSem = semOf[bKey];
    if (bSem === 0 || bSem === 10 || bSem === 4 || bSem === 5) continue; // 水/树/岩不算坡地
    const bH = hOf[bKey], aH = av;
    if (bH < waterLevel + 1.5) continue;
    const dh = Math.abs(bH - aH);
    const isSlope = bSem === 3 || dh > 1.5;
    if (!isSlope) continue;
    if (!inIsland(bx + 0.5, bz + 0.5)) continue;
    cands.push({ A: { x: aCx, z: aCz, h: aH, sem: aSem }, B: { x: bx + 0.5, z: bz + 0.5, h: bH, sem: bSem }, dx, dz, dh, bSem });
  }
}
console.log('[cands] total=%d (sem3=%d, dh>1.5=%d)',
  cands.length, cands.filter(c => c.bSem === 3).length, cands.filter(c => c.dh > 1.5).length);
// EDGE=1 模式：专挑岛缘带（d/r ∈ [0.6, 0.84]）候选，验证 0.05 阈值覆盖错配环带
if (process.env.EDGE === '1') {
  const edge = cands.filter(c => {
    const d = Math.min(...ISLANDS.map(i => Math.hypot(c.B.x - i.cx, c.B.z - i.cz) / i.r));
    return d >= 0.6 && d <= 0.84;
  });
  console.log('[edge] band candidates=%d', edge.length);
  if (edge.length) { edge.sort((p, q) => q.dh - p.dh); pair = edge[0]; }
} else {
  cands.sort((p, q) => (q.bSem === 3 ? 1 : 0) - (p.bSem === 3 ? 1 : 0) || q.dh - p.dh);
  pair = cands[0] || null;
}
if (pair) pairInfo = { aSem: pair.A.sem, bSem: pair.bSem, aH: +pair.A.h.toFixed(2), bH: +pair.B.h.toFixed(2), dh: +pair.dh.toFixed(2) };
if (!pair) { console.log('NO SLOPE PAIR FOUND in island interior'); process.exit(2); }
console.log('[pair] A=(%s,%s) sem=%s h=%s | B=(%s,%s) sem=%s h=%s | Δh=%s dir=(%s,%s)',
  pair.A.x, pair.A.z, pairInfo.aSem, pairInfo.aH, pair.B.x, pair.B.z, pairInfo.bSem, pairInfo.bH, pairInfo.dh, pair.dx, pair.dz);

// ---- 5. WS：join at A，朝 B 走 3s ----
const ws = new WebSocket('ws://127.0.0.1:8080/ws?token=' + encodeURIComponent(token));
let buf = '';
const latest = {}; let first = null;
ws.on('open', () => ws.send('CONNECT\naccept-version:1.2\nheart-beat:0,0\n\n\0'));
ws.on('message', m => {
  buf += m.toString();
  let i;
  while ((i = buf.indexOf('\0')) >= 0) {
    const frame = buf.slice(0, i); buf = buf.slice(i + 1);
    const bi = frame.indexOf('\n\n');
    const body = bi >= 0 ? frame.slice(bi + 2) : '';
    if (!body) continue;
    try {
      const o = JSON.parse(body);
      if (o.t === 'POSITION_SNAPSHOT' && Array.isArray(o.bodies)) {
        for (const b of o.bodies) { latest[b.uid] = { gx: b.gx, gz: b.gz }; if (!first) first = { ...latest[b.uid] }; }
      }
    } catch {}
  }
});
await new Promise(r => setTimeout(r, 1200));
ws.send('SUBSCRIBE\nid:sub-0\ndestination:/topic/world\n\n\0');
ws.send('SEND\ndestination:/app/ws.join\ncontent-type:application/json\n\n' +
  JSON.stringify({ gx: pair.A.x, gz: pair.A.z }) + '\0');
await new Promise(r => setTimeout(r, 800));

let n = 0;
const iv = setInterval(() => {
  ws.send('SEND\ndestination:/app/ws.input\ncontent-type:application/json\n\n' +
    JSON.stringify({ seq: n++, move: { dx: pair.dx, dz: pair.dz, run: true } }) + '\0');
}, 50);
await new Promise(r => setTimeout(r, 3000));
clearInterval(iv);

const cur = latest[67] || Object.values(latest)[0];
console.log('\n=== RESULT ===');
console.log('start:', first, '\nend  :', cur);
if (cur && first) {
  const dist = Math.hypot(cur.gx - first.gx, cur.gz - first.gz);
  const toward = (cur.gx - first.gx) * pair.dx + (cur.gz - first.gz) * pair.dz;
  console.log(`dist=${dist.toFixed(2)} towardB=${toward.toFixed(2)}`);
  console.log(toward > 0.8 ? '>>> SLOPE WALK: MOVED (坡地可走)'
                           : '>>> SLOPE WALK: BLOCKED (坡地被挡死 — 复现用户 bug)');
} else {
  console.log('NO SNAPSHOT for uid');
}
ws.close();
process.exit(0);
