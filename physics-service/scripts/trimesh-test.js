'use strict';
const RAPIER = require('@dimforge/rapier3d-deterministic-compat');
(async () => {
  await RAPIER.init();
  const out = [];
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;

  // TriMesh：由 65×65 高度场生成（每 cell 2 三角），替代坏掉的 heightfield
  const N = 65;
  const heights = new Float32Array(N * N); // 全 0 平地
  const vertices = new Float32Array(N * N * 3);
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = z * N + x;
      vertices[i * 3] = x;
      vertices[i * 3 + 1] = heights[z * N + x];
      vertices[i * 3 + 2] = z;
    }
  }
  const indices = [];
  for (let z = 0; z < N - 1; z++) {
    for (let x = 0; x < N - 1; x++) {
      const a = z * N + x, b = a + 1, c = (z + 1) * N + x, d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  try {
    const desc = RAPIER.ColliderDesc.trimesh(vertices, new Uint32Array(indices))
      .setTranslation(0, 0, 0)
      .setFriction(1.0);
    const c = world.createCollider(desc);
    out.push('trimesh OK handle=' + c.handle);
  } catch (e) {
    out.push('trimesh THREW ' + (e.message || e));
  }

  // 角色控制器 + capsule 碰撞 trimesh
  try {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(5, 1.2, 5));
    const col = world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.4), body);
    const cc = world.createCharacterController(0.02);
    cc.setUp({ x: 0, y: 1, z: 0 });
    cc.enableSnapToGround(0.5);
    cc.computeColliderMovement(col, { x: 0.2, y: 0, z: 0 }, undefined, undefined, undefined);
    const mv = cc.computedMovement();
    const grounded = cc.computedGrounded();
    out.push('move x=' + round(mv.x) + ' y=' + round(mv.y) + ' z=' + round(mv.z) + ' grounded=' + grounded);
    // 60 tick 贴地检查
    for (let i = 0; i < 60; i++) world.step();
    const t = body.translation();
    out.push('body after 60t: x=' + round(t.x) + ' y=' + round(t.y) + ' z=' + round(t.z));
  } catch (e) {
    out.push('controller THREW ' + (e.message || e));
  }

  // serialize/restore
  try {
    const snap = world.takeSnapshot();
    out.push('takeSnapshot bytes=' + snap.byteLength);
    const pipe = new RAPIER.SerializationPipeline();
    const w2 = pipe.deserializeAll(snap);
    out.push('deserialize bodies=' + w2.bodies.len() + ' colliders=' + w2.colliders.len());
  } catch (e) {
    out.push('serialize THREW ' + (e.message || e));
  }

  require('fs').writeFileSync('trimesh-test.json', JSON.stringify(out, null, 2));
  process.exit(0);
})().catch(e => { console.error('FAIL', e && e.stack ? e.stack : e); process.exit(1); });

function round(v) { return Math.round(v * 1000) / 1000; }
