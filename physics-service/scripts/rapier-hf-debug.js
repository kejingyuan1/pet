'use strict';
const RAPIER = require('@dimforge/rapier3d-deterministic-compat');
(async () => {
  await RAPIER.init();
  const log = [];
  try {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 60;
    // 1) 纯 capsule + controller + serialize（无 heightfield）
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(1.5, 1.0, 1.5));
    const col = world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.4), body);
    const cc = world.createCharacterController(0.02);
    cc.setUp({ x: 0, y: 1, z: 0 });
    let mov;
    try {
      mov = cc.computeColliderMovement(col, { x: 0.1, y: 0, z: 0 }, undefined, undefined, undefined);
      log.push('mov typeof=' + typeof mov);
      if (mov) log.push('mov proto=' + JSON.stringify(Object.getOwnPropertyNames(Object.getPrototypeOf(mov))));
    } catch (e) { log.push('mov THREW: ' + e.message); }
    const serial = new RAPIER.SerializationPipeline();
    const snap = serial.serializeAll(world);
    log.push('serialize bytes=' + snap.byteLength);
    // 2) heightfield 单独测试：变体参数
    const heights = new Float32Array(3 * 3);
    for (const [label, fn] of [
      ['hf rows3 cols3 noT', () => RAPIER.ColliderDesc.heightfield(heights, 3, 3)],
      ['hf rows3 cols3 T0', () => RAPIER.ColliderDesc.heightfield(heights, 3, 3).setTranslation(0, 0, 0)],
      ['hf rows4 cols4', () => RAPIER.ColliderDesc.heightfield(new Float32Array(16), 4, 4)],
    ]) {
      try {
        const desc = fn();
        const c = world.createCollider(desc);
        log.push(label + ' OK collider=' + c.handle);
      } catch (e) {
        log.push(label + ' THREW: ' + e.message);
      }
    }
  } catch (e) {
    log.push('FATAL: ' + e.stack);
  }
  require('fs').writeFileSync('rapier-hf-debug.json', JSON.stringify(log, null, 2));
  process.exit(0);
})();
