/**
 * M2 物理核心验证脚本（主理人本机直跑 v2：含 RAPIER.init）
 * 验证项：
 *  1. 确定性：同输入两次重跑 → takeSnapshot checksum 一致（bit-level）
 *  2. 快照/恢复：takeSnapshot → restoreSnapshot 可用
 *  3. 崩溃恢复修复：fresh 进程（world=null）直接 restoreSnapshot 不再抛错（world.new.js 修复）
 *  4. 恢复后世界非空 + 可继续 step
 */
'use strict';
const crypto = require('crypto');
const RAPIER = require('@dimforge/rapier3d-deterministic-compat');
const { PhysicsWorld } = require('./src/world');

function ck(buf) { return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16); }

function buildWorld() {
  const w = new PhysicsWorld();
  w.initWorld({ gravityY: -9.81 });
  const h = new Float32Array(65 * 65);
  h.fill(0);
  w.addTerrainChunk('0,0', 0, 0, h);
  w.addPlayer('u1', 0, 0, 0);
  return w;
}

function run(w, steps) {
  for (let i = 0; i < steps; i++) { w.enqueueInput('u1', { dx: 0, dz: 1, run: false }); w.step(); }
  return w;
}

async function main() {
  await RAPIER.init();
  // 1+2. 两次独立重跑（确定性）
  const w1 = run(buildWorld(), 60);
  const s1 = Buffer.from(w1.takeSnapshot());
  console.log('[1] run1 tick=' + w1.tick + ' bodies=' + w1.bodyCount() + ' player=' + JSON.stringify(w1.snapshotBodies()) + ' ck=' + ck(s1));

  const w2 = run(buildWorld(), 60);
  const s2 = Buffer.from(w2.takeSnapshot());
  console.log('[1] run2 tick=' + w2.tick + ' bodies=' + w2.bodyCount() + ' ck=' + ck(s2));
  console.log('[1] DETERMINISM_MATCH=' + (ck(s1) === ck(s2)));

  // 3+4. 崩溃恢复修复：fresh（world=null）直接 restoreSnapshot
  const w3 = new PhysicsWorld(); // 故意不 initWorld
  try {
    const r = w3.restoreSnapshot(s1);
    const bodies = w3.bodyCount();
    console.log('[3] RESTORE_ON_FRESH ok=' + JSON.stringify(r) + ' bodies=' + bodies);
    console.log('[3] RESTORED_NONEMPTY=' + (bodies > 0));
    w3.step();
    console.log('[3] POST_RESTORE_STEP tick=' + w3.tick + ' bodies=' + w3.bodyCount());
  } catch (e) {
    console.log('[3] RESTORE_ON_FRESH_FAIL: ' + e.message);
  }

  console.log('VERIFY_DONE');
}

main().catch(e => { console.error('MAIN_FAIL: ' + e.message); process.exit(1); });
