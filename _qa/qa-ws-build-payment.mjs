/**
 * O1 回归：WS build 扣款断言（quality-lead 报"首次 WS 放置未扣款"复现脚本）
 *
 * 用法：
 *   QA_USER=worldtest4996 QA_PASS=abc123 QA_BUILDS=5 \
 *     node _qa/qa-ws-build-payment.mjs
 * 前置：用户 coins 必须 ≥ QA_BUILDS*100（wood_house 单价 100）。
 *
 * 断言：每次 WS build 成功（BUILD_RESULT code=0）后，/api/auth/me 的 coins 精确减少 100；
 * 若某次未减少或减少额不对，立即 FAIL 并以退出码 1 退出。
 * 说明：只读 + 放置，不删库；测试副作用是新增 wood_house 对象与扣币。
 */
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8080';
const USER = process.env.QA_USER || 'worldtest4996';
const PASS = process.env.QA_PASS || 'abc123';
const N = parseInt(process.env.QA_BUILDS || '5', 10);
const PRICE = 100; // wood_house

async function call(method, path, body, token) {
  const req = await fetch(BASE + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return req.json();
}

async function myCoins(token) {
  const r = await call('GET', '/api/auth/me', null, token);
  return (r.data && r.data.coins != null) ? r.data.coins : null;
}

/** 找平坦 grass 未占用格（遍历多 chunk） */
async function findCells(token, count) {
  const chunks = [[0,0],[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,-1],[2,0],[0,2],[-2,0],[0,-2]];
  const cells = [];
  for (const [cx, cz] of chunks) {
    const d = (await call('GET', `/api/world/chunk?cx=${cx}&cz=${cz}`, null, token)).data;
    const objs = (await call('GET', `/api/world/objects?cx=${cx}&cz=${cz}`, null, token)).data || [];
    const occ = new Set(objs.map(o => o.gx + '_' + o.gz));
    const h = d.height;
    for (let lz = 0; lz < 63 && cells.length < count; lz++) {
      for (let lx = 0; lx < 63 && cells.length < count; lx++) {
        const s = d.semantic[lz * 64 + lx];
        const slope = Math.max(Math.abs(h[lz * 65 + lx] - h[lz * 65 + lx + 1]), Math.abs(h[lz * 65 + lx] - h[(lz + 1) * 65 + lx]));
        if (s === 2 && slope < 0.2 && !occ.has((cx * 64 + lx) + '_' + (cz * 64 + lz))) {
          cells.push({ gx: cx * 64 + lx, gz: cz * 64 + lz, chunkKey: `${cx}_${cz}` });
        }
      }
    }
  }
  return cells;
}

function stompOnce(targetCell, token) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${(BASE.startsWith('https') ? 'wss' : 'ws')}://${BASE.replace(/^https?:\/\//, '')}/ws?token=${encodeURIComponent(token)}`, 'v12.stomp');
    let buf = ''; const subs = {}; let seq = 0; let result = { code: -1, msg: 'timeout' }; let done = false;
    const finish = (r) => { if (!done) { done = true; result = r; try { ws.close(); } catch (e) {} resolve(r); } };
    const send = (cmd, hdrs, body) => { let f = cmd + '\n'; for (const [k, v] of Object.entries(hdrs)) f += k + ':' + v + '\n'; f += '\n' + (body || '') + '\0'; ws.send(f); };
    const sub = (dest, cb) => { const id = 't' + (++seq); subs[id] = cb; send('SUBSCRIBE', { id, destination: dest }); };
    ws.onopen = () => send('CONNECT', { 'accept-version': '1.2', host: 'petpark', 'heart-beat': '0,0' });
    ws.onmessage = (ev) => {
      buf += ev.data; let i;
      while ((i = buf.indexOf('\0')) >= 0) { const f = buf.slice(0, i); buf = buf.slice(i + 1); onFrame(f); }
    };
    ws.onerror = () => finish({ code: -1, msg: 'ws-error' });
    function onFrame(text) {
      const lines = text.split('\n'); const cmd = lines.shift().trim(); const hdrs = {};
      while (lines.length && lines[0].trim() !== '') { const p = lines.shift().split(':'); hdrs[p[0]] = p.slice(1).join(':'); }
      const body = lines.join('\n');
      if (cmd === 'CONNECTED') {
        sub('/user/queue/reply', b => { try { const ev = JSON.parse(b); if (ev.t === 'BUILD_RESULT') finish(ev); } catch (e) {} });
        setTimeout(() => send('SEND', { destination: '/app/ws.join' }, JSON.stringify({ chunkKey: targetCell.chunkKey, gx: targetCell.gx, gz: targetCell.gz })), 100);
        setTimeout(() => send('SEND', { destination: '/app/ws.build' }, JSON.stringify({ gx: targetCell.gx, gz: targetCell.gz, objectType: 'wood_house' })), 400);
        setTimeout(() => finish({ code: -2, msg: 'no BUILD_RESULT within 4s' }), 4000);
      } else if (cmd === 'MESSAGE') {
        const cb = subs[hdrs['subscription']]; if (cb) cb(body);
      }
    }
  });
}

(async () => {
  const login = await call('POST', '/api/auth/login', { username: USER, password: PASS });
  if (login.code !== 0) { console.log('[FAIL] 登录失败:', login.msg); process.exit(1); }
  const token = login.data.token;
  console.log(`[info] 用户 ${USER} 登录成功`);

  const before = await myCoins(token);
  console.log(`[info] 初始 coins=${before}，需执行 ${N} 次 WS build（wood_house 单价 ${PRICE}）`);
  if (before === null) { console.log('[FAIL] 无法读取 coins'); process.exit(1); }
  if (before < N * PRICE) { console.log(`[FAIL] coins 不足：需 ≥${N * PRICE}，当前 ${before}（先用 SQL 或管理员接口充值后重跑）`); process.exit(1); }

  const cells = await findCells(token, N);
  if (cells.length < N) { console.log(`[FAIL] 只找到 ${cells.length}/${N} 个可放置格（世界对象占满了？）`); process.exit(1); }

  let expected = before;
  let pass = 0;
  for (let i = 0; i < N; i++) {
    const r = await stompOnce(cells[i], token);
    const after = await myCoins(token);
    expected -= PRICE;
    if (r.code === 0 && after === expected) {
      pass++;
      console.log(`[PASS] #${i + 1} WS build @(${cells[i].gx},${cells[i].gz}) code=${r.code} coins ${expected + PRICE}→${after}`);
    } else {
      console.log(`[FAIL] #${i + 1} WS build @(${cells[i].gx},${cells[i].gz}) code=${r.code} msg=${r.msg} 期望 coins=${expected} 实际=${after}`);
      console.log('（若此处复现 O1：对象已入 world_objects 但 coins 未扣 → 事务边界问题；请抓后端日志 "[world] 非事务调用" 告警）');
      process.exit(1);
    }
  }
  console.log(`\n[PASS] ${pass}/${N} 次 WS build 扣款断言全部通过，未复现 O1`);
  process.exit(0);
})().catch(e => { console.error('[FAIL] 脚本异常:', e); process.exit(2); });
