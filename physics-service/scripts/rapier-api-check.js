/* 验证 rapier deterministic-compat：无 new 工厂 + heightfield + 角色控制器 + SerializationPipeline */
'use strict';
const RAPIER = require('@dimforge/rapier3d-deterministic-compat');
(async () => {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  const n = 3;
  const heights = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) heights[i] = 0;
  const hf = RAPIER.ColliderDesc.heightfield(heights, n, n).setTranslation(0, 0, 0);
  const hc = world.createCollider(hf);
  const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(1.5, 1.0, 1.5);
  const body = world.createRigidBody(bodyDesc);
  const colDesc = RAPIER.ColliderDesc.capsule(0.5, 0.4);
  const col = world.createCollider(colDesc, body);
  const cc = world.createCharacterController(0.02);
  cc.setUp({ x: 0, y: 1, z: 0 });
  cc.setSnapToGroundDistance(0.5);
  const mov = cc.computeColliderMovement(col, { x: 0.1, y: 0, z: 0 }, undefined, undefined, undefined);
  world.step();
  const serial = new RAPIER.SerializationPipeline();
  const snap = serial.serializeAll(world);
  const restored = serial.deserializeAll(snap);
  const out = {
    ok: true,
    colliders: world.colliders.len(),
    bodies: world.bodies.len(),
    mov: { x: round(mov.translation.x), y: round(mov.translation.y), z: round(mov.translation.z), grounded: mov.grounded },
    bodyPos: body.translation(),
    snapshotBytes: snap.byteLength,
    restoredWorldBodies: restored.bodies.len(),
  };
  require('fs').writeFileSync('rapier-api-check.json', JSON.stringify(out, null, 2));
  process.exit(0);
})().catch(e => { console.error('RAPIER_FAIL', e && e.message ? e.message : e); process.exit(1); });

function round(v) { return Math.round(v * 1000) / 1000; }
