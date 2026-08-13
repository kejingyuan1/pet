// M4 采矿闭环验证（后端权威链路）
//  - 注册/登录两个用户（A=B 矿主 / B=旁观者）
//  - A 通过 STOMP WS 进入世界（出生点附近即有矿脉），发送 /app/ws.mine
//  - 断言：MINE_RESULT(code=0)、能量 -4、背包 +1、TERRAIN_CHANGE 广播
//  - B 作为旁观者也收到 TERRAIN_CHANGE（多人同步）
//  - A 通过 REST 售卖矿石 → 金币 +sell_price
import WebSocket from 'file:///C:/Users/WIN11/WorkBuddy/2026-08-03-13-46-59/pet-park/pet-park-ng/node_modules/ws/index.js';

const BASE = 'http://127.0.0.1:8080';
const WS_BASE = 'ws://127.0.0.1:8080';
const CHUNK = 64;
const ORE = new Set([6, 7, 8]);

function encodeFrame(command, headers, body = '') {
  let f = command + '\n';
  for (const [k, v] of Object.entries(headers)) f += `${k}:${v}\n`;
  f += '\n' + body + '\0';
  return f;
}
function decodeFrame(str) {
  const parts = str.split('\n');
  const command = parts[0];
  const headers = {};
  let i = 1;
  for (; i < parts.length; i++) {
    if (parts[i] === '') { i++; break; }
    const idx = parts[i].indexOf(':');
    if (idx > 0) headers[parts[i].slice(0, idx)] = parts[i].slice(idx + 1);
  }
  const body = parts.slice(i).join('\n');
  return { command, headers, body };
}

function makeClient(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/ws?token=${encodeURIComponent(token)}`, ['v12.stomp']);
    let buf = '';
    const subs = {};
    let connectResolve;
    const connected = new Promise(r => connectResolve = r);
    ws.on('open', () => {
      ws.send(encodeFrame('CONNECT', { 'accept-version': '1.2', 'heart-beat': '0,0' }));
    });
    ws.on('message', (data) => {
      buf += data.toString();
      let idx;
      while ((idx = buf.indexOf('\0')) >= 0) {
        const frameStr = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!frameStr.trim()) continue;
        const f = decodeFrame(frameStr);
        if (f.command === 'CONNECTED') { connectResolve(); continue; }
        if (f.command === 'MESSAGE') {
          const cb = subs[f.headers['destination']];
          if (cb) cb(f.body);
        }
        if (f.command === 'ERROR') console.error('STOMP ERROR', f.body);
      }
    });
    ws.on('error', reject);
    const api = {
      ws,
      connected,
      subscribe(dest, cb) {
        subs[dest] = cb;
        ws.send(encodeFrame('SUBSCRIBE', { id: 'sub-' + Math.random().toString(36).slice(2), destination: dest }));
      },
      send(dest, obj) {
        ws.send(encodeFrame('SEND', { destination: dest, 'content-type': 'application/json' }, JSON.stringify(obj)));
      },
      close() { try { ws.close(); } catch (e) {} }
    };
    resolve(api);
  });
}

async function registerLogin() {
  const pw = 'M4test@123';
  // 短用户名（2-16 字符），避免唯一性冲突
  const username = 'm4' + Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: pw, confirmPassword: pw, nickname: username, inviteCode: 'dudu2019', education: 'PRIMARY_1' })
  }).then(r => r.json()).catch(() => ({}));
  if (reg.code !== 0) console.log('  注册回执:', JSON.stringify(reg), '(若已存在则忽略)');
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: pw })
  });
  const j = await r.json();
  if (j.code !== 0 || !j.data || !j.data.token) throw new Error('登录失败: ' + JSON.stringify(j));
  j.data.username = username;
  return j.data;
}

function waitFor(predicate, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (predicate()) { clearInterval(timer); resolve(true); }
      else if (Date.now() - start > timeoutMs) { clearInterval(timer); reject(new Error('超时等待: ' + label)); }
    }, 50);
  });
}

async function main() {
  const out = { steps: [], pass: true };
  const log = (s) => { out.steps.push(s); console.log(s); };

  // 1. 配置 + 最近未采矿石
  const cfg = await (await fetch(`${BASE}/api/world/config`)).json().then(j => j.data);
  log(`配置 spawn=(${cfg.spawnGx},${cfg.spawnGz})`);

  // 找最近矿石候选（按距离排序）
  const pcx = Math.floor(cfg.spawnGx / CHUNK), pcz = Math.floor(cfg.spawnGz / CHUNK);
  const ores = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const cx = pcx + dx, cz = pcz + dz;
    const ch = await (await fetch(`${BASE}/api/world/chunk?cx=${cx}&cz=${cz}`)).json().then(j => j.data);
    const sem = ch.semantic;
    for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
      const cell = sem[lz * CHUNK + lx];
      if (ORE.has(cell)) {
        const gx = cx * CHUNK + lx, gz = cz * CHUNK + lz;
        ores.push({ gx, gz, cell, d: Math.hypot(gx - cfg.spawnGx, gz - cfg.spawnGz) });
      }
    }
  }
  ores.sort((a, b) => a.d - b.d);
  log(`出生点附近矿石候选 ${ores.length} 个，最近 ${ores[0].gx},${ores[0].gz} dist=${ores[0].d.toFixed(1)}`);

  // 2. 登录两个用户
  const A = await registerLogin();
  const B = await registerLogin();
  log(`A uid=${A.userId}(${A.username}) B uid=${B.userId}(${B.username})`);

  // 3. 连接 B（旁观者，先订阅 /topic/world）
  const clientB = await makeClient(B.token);
  await clientB.connected;
  let bTerrainChange = null;
  clientB.subscribe('/topic/world', (body) => {
    const ev = JSON.parse(body);
    if (ev.t === 'TERRAIN_CHANGE') bTerrainChange = ev;
  });
  clientB.send('/app/ws.join', { chunkKey: `${pcx}_${pcz}`, gx: cfg.spawnGx, gz: cfg.spawnGz });
  log('B 已连接并订阅 /topic/world');

  // 4. 连接 A，订阅回复 + 世界
  const clientA = await makeClient(A.token);
  await clientA.connected;
  let mineResult = null, aTerrainChange = null;
  clientA.subscribe('/user/queue/reply', (body) => {
    const ev = JSON.parse(body);
    if (ev.t === 'MINE_RESULT') mineResult = ev;
  });
  clientA.subscribe('/topic/world', (body) => {
    const ev = JSON.parse(body);
    if (ev.t === 'TERRAIN_CHANGE') aTerrainChange = ev;
  });
  clientA.send('/app/ws.join', { chunkKey: `${pcx}_${pcz}`, gx: cfg.spawnGx, gz: cfg.spawnGz });
  await new Promise(r => setTimeout(r, 400)); // 等 join + tick 登记位置
  log('A 已连接并加入世界');

  // 5. 依次尝试最近矿石直到成功（跳过已被采空的）
  let target = null;
  for (const o of ores.slice(0, 10)) {
    mineResult = null;
    clientA.send('/app/ws.mine', { gx: o.gx, gz: o.gz });
    try {
      await waitFor(() => mineResult !== null, 4000, 'MINE_RESULT');
    } catch (e) { log('mine 无回执: ' + e.message); break; }
    if (mineResult.code === 0) { target = o; break; }
    log(`矿石(${o.gx},${o.gz}) 返回 code=${mineResult.code} msg=${mineResult.msg}（可能已采空），尝试下一个`);
  }
  if (!target) { out.pass = false; log('❌ 未找到可采矿脉'); }
  else {
    log(`✅ 采矿成功: ore ${target.cell} @(${target.gx},${target.gz}) → ${JSON.stringify(mineResult.data)}`);
    // 断言：能量扣减、背包 +1
    const mr = mineResult.data;
    if (mr.energy === 96) log('✅ 能量扣减正确 (100→96)'); else { out.pass = false; log(`❌ 能量异常 ${mr.energy}`); }
    if (mr.itemQty === 1) log('✅ 背包 +1 正确'); else { out.pass = false; log(`❌ 背包数量异常 ${mr.itemQty}`); }
  }

  // 6. 等待 TERRAIN_CHANGE（A 与 B 都应收到）
  try {
    await waitFor(() => aTerrainChange !== null && bTerrainChange !== null, 4000, 'TERRAIN_CHANGE');
    log(`✅ TERRAIN_CHANGE 同步: A=${JSON.stringify(aTerrainChange)} B=${JSON.stringify(bTerrainChange)}`);
    if (aTerrainChange.newType === 'empty' && bTerrainChange.gx === aTerrainChange.gx) log('✅ 地形变化广播一致（矿格→empty）');
    else { out.pass = false; log('❌ TERRAIN_CHANGE 不一致'); }
  } catch (e) { out.pass = false; log('❌ ' + e.message); }

  // 7. 售卖矿石 → 金币增长
  if (target) {
    const before = (await (await fetch(`${BASE}/api/world/mining/profile`, { headers: { Authorization: 'Bearer ' + A.token } })).json()).data;
    const sellResp = await fetch(`${BASE}/api/world/mining/sell`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.token },
      body: JSON.stringify([{ type: 'ore_' + (target.cell === 6 ? 'coal' : target.cell === 7 ? 'iron' : 'gold'), qty: 1 }])
    }).then(r => r.json());
    log(`售卖响应: ${JSON.stringify(sellResp.data)}`);
    if (sellResp.code === 0 && sellResp.data.earnedCoins > 0) {
      log(`✅ 售卖获得 ${sellResp.data.earnedCoins} 积分，余额 ${sellResp.data.coins}`);
    } else { out.pass = false; log('❌ 售卖失败'); }
    const after = (await (await fetch(`${BASE}/api/world/mining/profile`, { headers: { Authorization: 'Bearer ' + A.token } })).json()).data;
    log(`档案: 售前金币=${before.coins} 售后金币=${after.coins} 背包=${JSON.stringify(after.inventory)}`);
  }

  clientA.close();
  clientB.close();
  console.log('\n==== M4 验证结果 ====');
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.pass ? 0 : 1);
}

main().catch(e => { console.error('FATAL', e); process.exit(2); });
