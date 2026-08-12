'use strict';
const RAPIER = require('@dimforge/rapier3d-deterministic-compat');
(async () => {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const allWorldKeys = Object.getOwnPropertyNames(RAPIER.World.prototype);
  const out = {
    hasRestoreSnapshot: typeof world.restoreSnapshot,
    hasTakeSnapshot: typeof world.takeSnapshot,
    restoreLike: allWorldKeys.filter(k => /restore|snapshot|serial/i.test(k)),
    serializationKeys: RAPIER.SerializationPipeline ? Object.getOwnPropertyNames(RAPIER.SerializationPipeline.prototype) : 'N/A',
  };
  require('fs').writeFileSync('rapier-restore-check.json', JSON.stringify(out, null, 2));
  process.exit(0);
})().catch(e => { console.error('FAIL', e && e.message ? e.message : e); process.exit(1); });
