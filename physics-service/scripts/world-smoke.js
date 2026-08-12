/**
 * PhysicsWorld 单元冒烟：heightfield + 玩家移动 + 快照/恢复 + 确定性抽样
 */
'use strict';
const RAPIER = require('@dimforge/rapier3d-deterministic-compat');
const { PhysicsWorld, FIXED_DT } = require('../src/world');

(async () => {
  await RAPIER.init();
  const out = [];

  // 1. initWorld + 一块平坦地形（65×65，全 0 高）
  const world = new PhysicsWorld();
  world.initWorld({ seed: 'smoke', version: 1 });
  const heights = new Float32Array(65 * 65); // 全 0 → 平坦地面 y=0
  world.addTerrainChunk('0_0', 0, 0, heights);
  out.push('terrain chunks=' + world.terrainChunks.size);

  // 2. 添加玩家（uid=1, 起点 (2,3)，y 由调用方给 0 → capsule 底部恰好贴地）
  world.addPlayer(1, 2, 3, 0);
  out.push('player added, pos=' + JSON.stringify(world.players.get(1).body.translation()));

  // 3. 输入前进（dz=+1），跑 60 tick（1s）→ 应前进约 4 单位（walk 4 m/s）
  world.enqueueInput(1, { dx: 0, dz: 1, run: false });
  for (let i = 0; i < 60; i++) world.step();
  const p1 = world.players.get(1);
  out.push('after 60t walk dz=1: ' + JSON.stringify({ gx: round(p1.gx), gz: round(p1.gz), y: round(p1.y) }));

  // 4. 停止输入，再跑 30 tick → 位置应不变（贴地不掉）
  for (let i = 0; i < 30; i++) world.step();
  const p2 = world.players.get(1);
  out.push('after 30t idle: ' + JSON.stringify({ gx: round(p2.gx), gz: round(p2.gz), y: round(p2.y) }));

  // 5. 快照/恢复：takeSnapshot → 新建 world → restore
  const snap = world.takeSnapshot();
  const world2 = new PhysicsWorld();
  world2.initWorld({ seed: 'smoke', version: 1 });
  const r = world2.restoreSnapshot(snap);
  out.push('snapshot bytes=' + snap.byteLength + ' restore=' + JSON.stringify(r));

  // 6. 确定性抽样：同样输入两次独立世界 → 同 tick 快照一致
  const runDet = () => {
    const w = new PhysicsWorld();
    w.initWorld({ seed: 'det', version: 1 });
    w.addTerrainChunk('0_0', 0, 0, new Float32Array(65 * 65));
    w.addPlayer(9, 0, 0, 0);
    // 交错输入序列（固定序）
    w.enqueueInput(9, { dx: 0, dz: 1 });
    w.step(); w.step();
    w.enqueueInput(9, { dx: 1, dz: 0 });
    w.step(); w.step(); w.step();
    w.enqueueInput(9, { dx: 0, dz: -1 });
    w.step(); w.step(); w.step(); w.step();
    return JSON.stringify(w.snapshotBodies());
  };
  const a = runDet();
  const b = runDet();
  out.push('determinism: ' + (a === b ? 'MATCH ' + a : 'MISMATCH a=' + a + ' b=' + b));

  require('fs').writeFileSync('world-smoke.json', JSON.stringify(out, null, 2));
  process.exit(0);
})().catch(e => { console.error('SMOKE_FAIL', e && e.stack ? e.stack : e); process.exit(1); });

function round(v) { return Math.round(v * 1000) / 1000; }
