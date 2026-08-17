// Verify snapSpawnToIsland (HARDENED: land above water safety line, pick highest)
// for ALL 4 HY3D island variants against their REAL GLB geometry.
// variantPaths order in world3d: [island(0), lake(1), peninsula(2), mountain(3)]
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'fs';

process.on('unhandledRejection', (e) => console.error('REJECT', e && (e.message || e)));
global.self = global;
const fakeEl = () => ({ addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, getContext() { return {}; }, width: 0, height: 0 });
global.document = { createElement: () => fakeEl(), createElementNS: () => fakeEl() };
global.URL = global.URL || { createObjectURL: () => 'blob:', revokeObjectURL() {} };
THREE.TextureLoader.prototype.load = function (url, onLoad) { const t = new THREE.Texture(); if (onLoad) onLoad(t); return t; };
THREE.ImageLoader.prototype.load = function (url, onLoad) { if (onLoad) onLoad({}); return {}; };

const BASE = process.argv[2] || '../assets/3d_build/terrain-hy3d/';
const VARIANTS = [
  { idx: 0, file: BASE + 'hy3_island.glb', name: 'normal' },
  { idx: 1, file: BASE + 'hy3_island_lake.glb', name: 'lake' },
  { idx: 2, file: BASE + 'hy3_island_peninsula.glb', name: 'peninsula' },
  { idx: 3, file: BASE + 'hy3_island_mountain.glb', name: 'mountain' },
];

function computeIslandCenters(seedText) {
  const MASK = 0xFFFFFFFFFFFFFFFFn;
  let base = 1125899906842597n;
  for (let i = 0; i < seedText.length; i++) base = (31n * base + BigInt(seedText.charCodeAt(i))) & MASK;
  const SALT_ISLAND = 0x1B873593n;
  const scatterHash = (gx, gz, salt) => {
    let h = (base ^ salt) & MASK;
    h = (h * 6364136223846793005n + BigInt(gx) * 0x9E3779B97F4A7C15n) & MASK;
    h = (((h ^ (h >> 13n)) & MASK) * 0xBF58476D1CE4E5B9n) & MASK;
    h = (h ^ (h >> 16n)) & MASK;
    h = (h * 0x94D049BB133111EBn) & MASK;
    h = h ^ (h >> 31n);
    h = (h + ((BigInt(gz) * 0x9E3779B97F4A7C15n) ^ BigInt(gz))) & MASK;
    h = (((h ^ (h >> 13n)) & MASK) * 0xBF58476D1CE4E5B9n) & MASK;
    h = h ^ (h >> 16n);
    const low32 = h & 0xFFFFFFFFn;
    return Number(low32) / 4294967296.0;
  };
  const ISLAND_COUNT = 22, SPREAD = 2600, BASE_R = 115, R_VAR = 75;
  const centers = [];
  for (let i = 0; i < ISLAND_COUNT; i++) {
    centers.push({
      cx: (scatterHash(i * 3 + 1, 777, SALT_ISLAND) - 0.5) * SPREAD,
      cz: (scatterHash(i * 3 + 2, 888, SALT_ISLAND) - 0.5) * SPREAD,
      r: BASE_R + scatterHash(i * 3 + 3, 999, SALT_ISLAND) * R_VAR,
    });
  }
  return centers;
}

const centers = computeIslandCenters('dudu2019');
const wl = -5, LAND_MIN = wl + 0.5;
const rc = new THREE.Raycaster();
rc.ray.direction.set(0, -1, 0);

function loadGLB(path) {
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
}

let passAll = true;
for (const v of VARIANTS) {
  let template;
  try { template = (await loadGLB(v.file)).scene; } catch (e) { console.log(`[${v.name}] LOAD FAIL ${e.message}`); passAll = false; continue; }
  template.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(template);
  const radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
  const baseY = box.min.y;
  const c = centers[v.idx];
  const horizScale = (c.r * 1.1) / radius;
  const vertScale = horizScale * 0.35;
  const inst = template.clone(true);
  inst.scale.set(horizScale, vertScale, horizScale);
  inst.position.set(c.cx, -baseY * vertScale, c.cz);
  inst.rotation.y = (v.idx * 2.39996) % (Math.PI * 2);
  inst.updateMatrixWorld(true);

  const surfaceAt = (x, z) => {
    rc.ray.origin.set(x, 200, z);
    const targets = [];
    inst.traverse(o => { if (o instanceof THREE.Mesh) targets.push(o); });
    const hits = rc.intersectObjects(targets, false);
    return hits.length ? hits[0].point.y : null;
  };

  // HARDENED snap (mirrors new component logic)
  const hit = surfaceAt;
  let y = hit(c.cx, c.cz);
  let res;
  if (y != null && y > LAND_MIN) res = { where: 'center', x: c.cx, z: c.cz, y };
  else {
    const DIRS = 16; let best = null;
    for (let step = 1; step <= 9 && !best; step++) {
      const rf = step * 0.12, rr = rf * c.r;
      for (let k = 0; k < DIRS; k++) {
        const a = (k * Math.PI * 2) / DIRS + step * 0.2;
        const tx = c.cx + rr * Math.cos(a), tz = c.cz + rr * Math.sin(a);
        const hy = hit(tx, tz);
        if (hy != null && hy > LAND_MIN && (!best || hy > best.y)) best = { where: `spiral s${step}`, x: tx, z: tz, y: hy };
      }
    }
    res = best || { where: 'NONE', x: c.cx, z: c.cz, y: null };
  }
  const ok = res.y != null && res.y > LAND_MIN;
  if (!ok) passAll = false;
  console.log(`[${v.name}] idx${v.idx} r=${c.r.toFixed(0)} centerHit=${y == null ? 'null' : y.toFixed(2)} -> ${ok ? 'OK' : 'FAIL'} ${JSON.stringify(res)}`);
}
console.log(passAll ? '\n=== ALL VARIANTS PASS: player lands on land ===' : '\n=== SOME VARIANTS FAILED ===');
process.exit(passAll ? 0 : 1);
