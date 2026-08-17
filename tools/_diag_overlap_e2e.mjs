// Diagnostic E2E: detect HY3D island overlap + Y stability at player position.
// 1) Login → enter world → wait for islands loaded
// 2) Query __worldDebug for all loaded island centers
// 3) Check pairwise overlap (centerDist < sumR)
// 4) Sample __dpyNow over 8s to check Y stability
import { chromium } from 'playwright-core';
const CHROME = 'C:/Users/ken/.agent-browser/browsers/chrome-151.0.7922.76/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:4200';
const USER = 'wtest_ken', PASS = 'Test1234!';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('[DIAG]', ...a);

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-gl=swiftshader','--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
try {
  await page.goto(`${BASE}/?spawnIsland=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(1500);
  await page.fill('input[placeholder="用户名"]', USER).catch(()=>{});
  await page.fill('input[placeholder*="密码"]', PASS).catch(()=>{});
  await page.click('button.btn-login').catch(()=>{});
  await sleep(2500);
  await page.click('text=进入大世界').catch(async () => {
    for (const b of await page.$$('button')) { const t = await b.innerText().catch(()=>''); if (t.includes('大世界')) { await b.click(); break; } }
  });
  await sleep(5000); // wait for LOD to load nearby islands
  // wait debug ready WITH centerList populated
  for (let i = 0; i < 50; i++) {
    const r = await page.evaluate(() => {
      const w = (window).__worldDebug;
      return !!(w && w.ready && w.hy3dTerrain && Array.isArray(w.hy3dTerrain.centerList) && w.hy3dTerrain.centerList.length > 0);
    }).catch(()=>false);
    if (r) { log('debug+centerList ready at', i, 's'); break; }
    await sleep(1000);
  }
  await sleep(3000); // extra time for LOD to load all nearby islands

  const diag = await page.evaluate(() => {
    const w = (window).__worldDebug;
    if (!w || !w.hy3dTerrain || !Array.isArray(w.hy3dTerrain.centerList)) return { err: 'no-debug', keys: w ? Object.keys(w) : [] };
    const centers = w.hy3dTerrain.centerList;
    // Use DISPLAY position (smoothed render pos), not raw server pos
    const yc = w.yCoord || {};
    const dpx = yc.dpx ?? w.px ?? 0;
    const dpz = yc.dpz ?? w.pz ?? 0;
    const LOD_R = 600;
    
    // Loaded islands
    const loaded = centers.map((c, i) => {
      const dx = c.cx - dpx, dz = c.cz - dpz;
      return { i, cx: c.cx, cz: c.cz, r: c.r, dist: Math.sqrt(dx*dx+dz*dz), loaded: dx*dx+dz*dz <= LOD_R*LOD_R };
    }).filter(x => x.loaded);
    
    // Pairwise overlap
    const overlaps = [];
    for (let a = 0; a < loaded.length; a++) {
      for (let b = a+1; b < loaded.length; b++) {
        const dcx = loaded[a].cx - loaded[b].cx;
        const dcz = loaded[a].cz - loaded[b].cz;
        const cdist = Math.sqrt(dcx*dcx + dcz*dcz);
        const sumR = loaded[a].r + loaded[b].r;
        const gap = cdist - sumR;
        overlaps.push({ pair: `${loaded[a].i}-${loaded[b].i}`, cdist: +cdist.toFixed(1), sumR: +sumR.toFixed(1), gap: +gap.toFixed(1), overlaps: gap < 0 });
      }
    }

    // Sample Y over 8s
    return new Promise(resolve => {
      const samples = [];
      const interval = setInterval(() => {
        const d = (window).__dpyNow;
        if (d != null && Number.isFinite(d)) samples.push(d);
      }, 250);
      setTimeout(() => {
        clearInterval(interval);
        const ys = samples.filter(v => Number.isFinite(v));
        const minY = ys.length ? Math.min(...ys) : null;
        const maxY = ys.length ? Math.max(...ys) : null;
        const range = (minY != null && maxY != null) ? maxY - minY : null;
        resolve({
          playerPos: { x: +(dpx||0).toFixed(1), z: +(dpz||0).toFixed(1) },
          totalIslands: centers.length,
          loadedCount: loaded.length,
          loadedIndices: loaded.map(x => x.i),
          overlaps,
          hasOverlap: overlaps.some(o => o.overlaps),
          ySamples: ys.length,
          yMin: minY != null ? +minY.toFixed(4) : null,
          yMax: maxY != null ? +maxY.toFixed(4) : null,
          yRange: range != null ? +range.toFixed(4) : null,
          first5: ys.slice(0, 5),
          last5: ys.slice(-5)
        });
      }, 8000);
    });
  });

  log('DIAGNOSTIC RESULT');
  log(JSON.stringify(diag, null, 2));
  
  await page.screenshot({ path: 'C:/Users/ken/WorkBuddy/2026-08-05-19-13-32/pet/tools/_shots_lake/diag_overlap.png' }).catch(()=>{});
  
  process.exit((diag.hasOverlap || (diag.yRange && diag.yRange > 0.5)) ? 1 : 0);
} catch(e) {
  log('FATAL', e.message); process.exit(2);
} finally {
  await browser.close().catch(()=>{});
}
