'use strict';
const RAPIER = require('@dimforge/rapier3d-deterministic-compat');
(async () => {
  await RAPIER.init();
  const out = [];
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  const N = 65;
  const heights = new Float32Array(N * N);
  const vertices = new Float32Array(N * N * 3);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = z * N + x;
    vertices[i * 3] = x; vertices[i * 3 + 1] = 0; vertices[i * 3 + 2] = z;
  }
  const indices = new Uint32Array((N - 1) * (N - 1) * 6);
  let k = 0;
  for (let z = 0; z < N - 1; z++) for (let x = 0; x < N - 1; x++) {
    const a = z * N + x, b = a + 1, c = (z + 1) * N + x, d = c + 1;
    indices[k++] = a; indices[k++] = b; indices[k++] = c;
    indices[k++] = b; indices[k++] = d; indices[k++] = c;
  }
  world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices));
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(2.5, 0.6, 3.5));
  const col = world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.4), body);
  const cc = world.createCharacterController(0.02);
  cc.setUp({ x: 0, y: 1, z: 0 });
  cc.enableSnapToGround(0.5);

  for (let i = 0; i < 8; i++) {
    cc.computeColliderMovement(col, { x: 0, y: 0, z: 0.0667 }, undefined, undefined, undefined);
    const mv = cc.computedMovement();
    const grounded = cc.computedGrounded();
    const t = body.translation();
    out.push(`tick${i} mv=(${mv.x.toFixed(4)},${mv.y.toFixed(4)},${mv.z.toFixed(4)}) grounded=${grounded} bodyY=${t.y.toFixed(4)}`);
    // 应用位移（模拟 world.step 传播）
    body.setTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
    world.step();
  }
  require('fs').writeFileSync('cc-debug.json', JSON.stringify(out, null, 2));
  process.exit(0);
})().catch(e => { console.error('FAIL', e && e.stack ? e.stack : e); process.exit(1); });
