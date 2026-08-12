'use strict';
const RAPIER = require('@dimforge/rapier3d-deterministic-compat');
(async () => {
  await RAPIER.init();
  const keys = Object.keys(RAPIER).sort();
  const out = {
    keysSample: keys,
    colliderDescKeys: Object.getOwnPropertyNames(RAPIER.ColliderDesc),
    rigidBodyDescKeys: Object.getOwnPropertyNames(RAPIER.RigidBodyDesc),
    worldKeys: Object.getOwnPropertyNames(RAPIER.World.prototype).filter(k => /collider|body|controller|step|snapshot|heightfield|timestep/i.test(k)),
  };
  require('fs').writeFileSync('rapier-api-dump.json', JSON.stringify(out, null, 2));
  process.exit(0);
})().catch(e => { console.error('FAIL', e && e.message ? e.message : e); process.exit(1); });
