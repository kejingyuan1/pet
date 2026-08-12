/**
 * physics-service 入口（ADR-W7 候选② · Node Rapier WASM 独立物理服务）
 *
 * 控制面 HTTP :18080：/healthz /load_world /add_collider /remove_collider /snapshot /restore
 * 数据面 WS   :18081：输入上行（Spring Boot 转发客户端意图）+ 权威快照下行（10Hz）
 *
 * 确定性纪律：固定 1/60s 单线程 step（world.timestep=FIXED_DT）；输入按到达序入队、每 tick 消费 1 条。
 * 对外仅 Spring Boot 可连（同机回环）；本服务不直接暴露给浏览器。
 */
'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');
const RAPIER = require('@dimforge/rapier3d-deterministic-compat');
const { PhysicsWorld, FIXED_DT } = require('./world');

const CONTROL_PORT = parseInt(process.env.PHYSICS_CONTROL_PORT || '18080', 10);
const DATA_PORT = parseInt(process.env.PHYSICS_DATA_PORT || '18081', 10);
const SNAPSHOT_HZ = 10;                             // 快照下行频率（设计 02 §8）
const SNAPSHOT_EVERY = Math.round(60 / SNAPSHOT_HZ); // 每 6 tick 发一次快照

const world = new PhysicsWorld();

// ---------------- HTTP 控制面 ----------------

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks);
        resolve(raw.length ? JSON.parse(raw.toString('utf8')) : {});
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

const control = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;
  try {
    if (req.method === 'GET' && path === '/healthz') {
      return sendJson(res, 200, { ok: true, ...world.info() });
    }

    if (req.method === 'POST' && path === '/load_world') {
      const body = await readJsonBody(req);
      world.initWorld({
        gravityY: body.gravityY,
        seed: body.seed,
        version: body.version,
        bodyBudget: body.bodyBudget,
      });
      if (Array.isArray(body.terrain)) {
        for (const t of body.terrain) world.addTerrainChunk(t.chunkKey, t.cx, t.cz, Float32Array.from(t.heights));
      }
      if (Array.isArray(body.objects)) {
        for (const o of body.objects) world.addObjectCollider(o);
      }
      if (Array.isArray(body.players)) {
        for (const p of body.players) world.addPlayer(p.uid, p.gx, p.gz, p.y);
      }
      return sendJson(res, 200, { ok: true, tick: world.tick, ...world.info() });
    }

    if (req.method === 'POST' && path === '/add_collider') {
      const body = await readJsonBody(req);
      let result;
      if (body.type === 'terrain_chunk') {
        result = world.addTerrainChunk(body.chunkKey, body.cx, body.cz, Float32Array.from(body.heights));
      } else if (body.type === 'object') {
        result = world.addObjectCollider(body);
      } else if (body.type === 'player') {
        result = world.addPlayer(body.uid, body.gx, body.gz, body.y);
      } else {
        return sendJson(res, 400, { ok: false, msg: '未知 type' });
      }
      return sendJson(res, 200, { ok: true, result });
    }

    if (req.method === 'POST' && path === '/remove_collider') {
      const body = await readJsonBody(req);
      let removed = false;
      if (body.type === 'terrain_chunk' && body.chunkKey) removed = world.removeTerrainChunk(body.chunkKey);
      else if (body.type === 'object' && body.id != null) removed = world.removeObjectCollider(body.id);
      else if (body.type === 'player' && body.uid != null) removed = world.removePlayer(body.uid);
      return sendJson(res, 200, { ok: true, removed, ...world.info() });
    }

    if (req.method === 'GET' && path === '/snapshot') {
      const bytes = world.takeSnapshot();
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': bytes.byteLength,
        'X-Tick': String(world.tick),
        'X-Body-Count': String(world.bodyCount()),
      });
      res.end(Buffer.from(bytes));
      return;
    }

    if (req.method === 'POST' && path === '/restore') {
      const bytes = await readRawBody(req);
      const r = world.restoreSnapshot(new Uint8Array(bytes));
      const tickHeader = req.headers['x-tick'];
      if (tickHeader) world.tick = parseInt(tickHeader, 10) || 0;
      return sendJson(res, 200, { ok: true, ...r, tick: world.tick });
    }

    return sendJson(res, 404, { ok: false, msg: 'not found' });
  } catch (e) {
    return sendJson(res, 500, { ok: false, msg: e && e.message ? e.message : String(e) });
  }
});

// ---------------- 数据面 WS ----------------

const wss = new WebSocketServer({ port: DATA_PORT });

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString('utf8')); } catch (e) { return; }
    if (!msg || !msg.t) return;
    if (msg.t === 'input') {
      // 输入按到达顺序入队；Spring Boot 已做鉴权/zone 预检
      world.enqueueInput(msg.uid, { dx: msg.dx, dz: msg.dz, run: msg.run });
    } else if (msg.t === 'ping') {
      socket.send(JSON.stringify({ t: 'pong', tick: world.tick }));
    }
  });
});

// ---------------- 启动（先 init Rapier WASM） ----------------

RAPIER.init()
  .then(() => {
    control.listen(CONTROL_PORT, '127.0.0.1', () => {
      console.log(`[physics] 控制面 HTTP :${CONTROL_PORT} 已启动`);
    });
    wss.on('listening', () => {
      console.log(`[physics] 数据面 WS :${DATA_PORT} 已启动，固定步进 ${Math.round(FIXED_DT * 1000)}ms`);
    });
    console.log('[physics] Rapier WASM 初始化完成（deterministic-compat）');
  })
  .catch(e => {
    console.error('[physics] Rapier 初始化失败:', e && e.message ? e.message : e);
    process.exit(1);
  });

// ---------------- 主循环（固定步进 1/60 单线程） ----------------

setInterval(() => {
  world.step();
  if (world.tick % SNAPSHOT_EVERY === 0) {
    broadcast({ t: 'snapshot', tick: world.tick, bodies: world.snapshotBodies() });
  }
}, FIXED_DT * 1000);

// 诊断（30s 一条）
setInterval(() => {
  console.log(`[physics] ${JSON.stringify(world.info())}`);
}, 30 * 1000);
