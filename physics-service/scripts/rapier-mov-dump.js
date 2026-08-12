'use strict';
const RAPIER = require('@dimforge/rapier3d-deterministic-compat');
(async () => {
  await RAPIER.init();
  const log = [];
  try {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    log.push('world ok');
    world.timestep = 1 / 60;
    const n = 3;
    const heights = new Float32Array(n * n);
    const hf = RAPIER.ColliderDesc.heightfield(heights, n, n).setTranslation(0, 0, 0);
    const hc = world.createCollider(hf);
    log.push('hf ok');
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(1.5, 1.0, 1.5));
    log.push('body ok ' + JSON.stringify(body.translation()));
    const col = world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.4), body);
    log.push('col ok');
    const cc = world.createCharacterController(0.02);
    cc.setUp({ x: 0, y: 1, z: 0 });
    log.push('cc ok');
    let mov;
    try {
      mov = cc.computeColliderMovement(col, { x: 0.1, y: 0, z: 0 }, undefined, undefined, undefined);
      log.push('mov computed, typeof=' + typeof mov);
    } catch (e) {
      log.push('mov THREW: ' + e.message);
      throw e;
    }
    log.push('mov keys proto=' + (mov ? JSON.stringify(Object.getOwnPropertyNames(Object.getPrototypeOf(mov))) : 'undefined'));
  } catch (e) {
    log.push('FATAL: ' + e.stack);
  }
  require('fs').writeFileSync('rapier-mov-dump.json', JSON.stringify(log, null, 2));
  process.exit(0);
})();
