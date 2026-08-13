// M4 探索：读取世界配置 + 扫描出生点附近矿石分布，确定最近可达矿脉
const BASE = 'http://127.0.0.1:8080';

async function getConfig() {
  const r = await fetch(`${BASE}/api/world/config`);
  const j = await r.json();
  return j.data;
}

async function getChunk(cx, cz) {
  const r = await fetch(`${BASE}/api/world/chunk?cx=${cx}&cz=${cz}`);
  const j = await r.json();
  return j.data;
}

const CHUNK = 64;
const ORE = new Set([6, 7, 8]);

const cfg = await getConfig();
console.log('CONFIG spawn:', cfg.spawnGx, cfg.spawnGz, 'waterLevel', cfg.waterLevel, 'viewRadius', cfg.viewRadius);

const pcx = Math.floor(cfg.spawnGx / CHUNK);
const pcz = Math.floor(cfg.spawnGz / CHUNK);

const ores = [];
for (let dz = -2; dz <= 2; dz++) {
  for (let dx = -2; dx <= 2; dx++) {
    const cx = pcx + dx, cz = pcz + dz;
    let chunk;
    try { chunk = await getChunk(cx, cz); } catch (e) { continue; }
    const sem = chunk.semantic;
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const cell = sem[lz * CHUNK + lx];
        if (ORE.has(cell)) {
          const gx = cx * CHUNK + lx;
          const gz = cz * CHUNK + lz;
          const d = Math.hypot(gx - cfg.spawnGx, gz - cfg.spawnGz);
          ores.push({ gx, gz, cell, d, cx, cz });
        }
      }
    }
  }
}
ores.sort((a, b) => a.d - b.d);
console.log('ORE count within 2 chunks of spawn:', ores.length);
console.log('Nearest 15 ores:');
for (const o of ores.slice(0, 15)) {
  console.log(`  ore ${o.cell} @(${o.gx},${o.gz}) dist=${o.d.toFixed(1)} chunk(${o.cx},${o.cz})`);
}
