'use strict';
const RAPIER = require('@dimforge/rapier3d-deterministic-compat');
(async () => {
  await RAPIER.init();
  const out = [];
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;

  const variants = [
    ['65x65 colMajor scaleObj', 65, 65, new Float32Array(65 * 65), { x: 1, y: 1, z: 1 }],
    ['65x65 colMajor scaleVec', 65, 65, new Float32Array(65 * 65), new RAPIER.Vector3(1, 1, 1)],
    ['3x3 colMajor scaleObj', 3, 3, new Float32Array(9), { x: 1, y: 1, z: 1 }],
    ['2x2 colMajor scaleObj', 2, 2, new Float32Array(4), { x: 1, y: 1, z: 1 }],
  ];
  for (const [label, rows, cols, h, scale] of variants) {
    try {
      const desc = RAPIER.ColliderDesc.heightfield(rows, cols, h, scale);
      const c = world.createCollider(desc);
      out.push(label + ' OK handle=' + c.handle);
    } catch (e) {
      out.push(label + ' THREW ' + (e.message || e));
    }
  }
  require('fs').writeFileSync('hf-isolate.json', JSON.stringify(out, null, 2));
  process.exit(0);
})().catch(e => { console.error('FAIL', e && e.stack ? e.stack : e); process.exit(1); });
