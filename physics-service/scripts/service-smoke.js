/**
 * physics-service 协议冒烟：spawn 进程 → /healthz → /load_world → WS 输入 → 快照 → /snapshot → /restore
 * 使用独立测试端口 18082/18083，避免与运行中的实例冲突。
 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

const CTL = 18082;
const DATA = 18083;
const NODE = process.env.NODE_BIN || 'node';

function httpJson(method, port, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({ host: '127.0.0.1', port, path, method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {} }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode === 200) {
          try { resolve({ headers: res.headers, json: JSON.parse(text) }); }
          catch (e) { resolve({ headers: res.headers, raw: text }); }
        } else resolve({ status: res.statusCode, raw: text });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function waitHealth(port, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await httpJson('GET', port, '/healthz');
      if (r.json && r.json.ok) return r.json;
    } catch (e) { /* retry */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('physics-service /healthz 超时');
}

(async () => {
  const out = [];
  const child = spawn(NODE, ['src/index.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PHYSICS_CONTROL_PORT: String(CTL), PHYSICS_DATA_PORT: String(DATA) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', d => process.stderr.write('[svc] ' + d));
  child.stderr.on('data', d => process.stderr.write('[svc-err] ' + d));

  try {
    const health = await waitHealth(CTL);
    out.push('healthz ok tick=' + health.tick);

    // 平坦地形 3×3 chunk（65×65 全 0），玩家 uid=1 @(2,3) y=0
    const terrain = [];
    for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) {
      terrain.push({ chunkKey: `${cx}_${cz}`, cx, cz, heights: Array.from(new Float32Array(65 * 65)) });
    }
    const lw = await httpJson('POST', CTL, '/load_world',
      { seed: 'smoke', version: 1, gravityY: -9.81, terrain, players: [{ uid: 1, gx: 2, gz: 3, y: 0 }] });
    out.push('load_world ' + JSON.stringify(lw.json));

    // WS 数据面：发输入 dz=+1，收集快照 ~1.5s
    const ws = new WebSocket(`ws://127.0.0.1:${DATA}`);
    const snapshots = [];
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 1800);
      ws.on('open', () => {
        ws.send(JSON.stringify({ t: 'input', uid: 1, dx: 0, dz: 1, run: false }));
      });
      ws.on('message', raw => {
        const msg = JSON.parse(raw.toString('utf8'));
        if (msg.t === 'snapshot') snapshots.push(msg);
      });
      ws.on('error', reject);
      timer.unref();
    });
    ws.close();

    out.push('snapshots received=' + snapshots.length);
    if (snapshots.length > 0) {
      const first = snapshots[0].bodies.find(b => b.uid === 1);
      const last = snapshots[snapshots.length - 1].bodies.find(b => b.uid === 1);
      out.push('first gz=' + (first && first.gz) + ' last gz=' + (last && last.gz)
        + ' moved=' + ((last && first) ? (last.gz - first.gz).toFixed(3) : '?'));
    }

    // /snapshot 二进制 + 头，再 /restore 回灌
    const snapBuf = await httpBinary('GET', CTL, '/snapshot');
    out.push('snapshot bytes=' + snapBuf.bytes.length + ' x-tick=' + snapBuf.headers['x-tick'] + ' x-body-count=' + snapBuf.headers['x-body-count']);
    const restore = await httpBinary('POST', CTL, '/restore', snapBuf.bytes, snapBuf.headers['x-tick']);
    out.push('restore ' + (restore.json ? JSON.stringify(restore.json) : restore.raw));

    require('fs').writeFileSync('service-smoke.json', JSON.stringify(out, null, 2));
  } finally {
    child.kill('SIGKILL');
  }
  process.exit(0);
})().catch(e => { console.error('SMOKE_FAIL', e && e.stack ? e.stack : e); process.exit(1); });

function httpBinary(method, port, path, bodyBuf, xTick) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method,
      headers: bodyBuf ? { 'Content-Type': 'application/octet-stream', 'Content-Length': bodyBuf.length, ...(xTick ? { 'X-Tick': String(xTick) } : {}) } : {} }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (e) { /* binary */ }
        resolve({ headers: res.headers, bytes: buf, raw: text, json });
      });
    });
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}
