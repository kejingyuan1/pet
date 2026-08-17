// Walk-and-sample E2E: login → enter world → walk in a small circle while sampling Y.
// Catches island-overlap flickering that only manifests during movement (cache bucket crossings).
import { chromium } from 'playwright-core';
const CHROME = 'C:/Users/ken/.agent-browser/browsers/chrome-151.0.7922.76/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:4200';
const USER = 'wtest_ken', PASS = 'Test1234!';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('[WALK-E2E]', ...a);

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
  await sleep(5000);
  for (let i = 0; i < 50; i++) {
    const r = await page.evaluate(() => {
      const w = (window).__worldDebug;
      return !!(w && w.ready && w.hy3dTerrain && Array.isArray(w.hy3dTerrain.centerList) && w.hy3dTerrain.centerList.length > 0);
    }).catch(()=>false);
    if (r) break;
    await sleep(1000);
  }
  await sleep(2000);

  // Phase 1: static baseline (3s)
  const staticSamples = [];
  for (let i = 0; i < 12; i++) {
    const d = await page.evaluate(() => (window).__dpyNow).catch(() => null);
    if (d != null && Number.isFinite(d)) staticSamples.push(d);
    await sleep(250);
  }

  // Phase 2: walk in a circle while sampling (10s)
  // Inject keyboard handler to simulate WASD
  await page.evaluate(() => {
    window.__walkTest = { active: false, angle: 0, samples: [] };
    const listener = (e) => {
      if (window.__walkTest.active) e.preventDefault();
    };
    window.addEventListener('keydown', listener);
    window.addEventListener('keyup', listener);
  });

  // Start walking + sampling
  const walkResult = await page.evaluate(() => new Promise(resolve => {
    const wt = window.__walkTest;
    wt.active = true;
    wt.samples = [];
    let angle = 0;

    // Simulate WASD in a circle by sending keydown/keyup rapidly
    const interval = setInterval(() => {
      angle += 0.15; // ~42 steps per circle
      const fx = Math.cos(angle), fz = Math.sin(angle); // forward direction

      // Determine which WASD keys to press for this direction
      const keys = [];
      if (Math.abs(fx) > 0.3) keys.push(fx > 0 ? 'KeyW' : 'KeyS');
      if (Math.abs(fz) > 0.3) keys.push(fz > 0 ? 'KeyD' : 'KeyA');

      // Dispatch key events
      for (const k of keys) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: k.replace('Key','').toLowerCase(), code: k, bubbles: true }));
      }
      // Sample Y
      const d = (window).__dpyNow;
      if (d != null && Number.isFinite(d)) wt.samples.push(d);
      // Release keys
      for (const k of keys) {
        window.dispatchEvent(new KeyboardEvent('keyup', { key: k.replace('Key','').toLowerCase(), code: k, bubbles: true }));
      }
    }, 250);

    setTimeout(() => {
      clearInterval(interval);
      wt.active = false;
      resolve({ sampleCount: wt.samples.length, samples: wt.samples });
    }, 10000);
  }));

  // Phase 3: stop walking, sample static again (3s)
  const postWalkSamples = [];
  for (let i = 0; i < 12; i++) {
    const d = await page.evaluate(() => (window).__dpyNow).catch(() => null);
    if (d != null && Number.isFinite(d)) postWalkSamples.push(d);
    await sleep(250);
  }

  // Analyze
  const analyze = (arr) => {
    if (!arr.length) return { n: 0, min: 0, max: 0, range: 0, mean: 0 };
    const min = Math.min(...arr), max = Math.max(...arr);
    return { n: arr.length, min: +min.toFixed(4), max: +max.toFixed(4), range: +(max-min).toFixed(4), mean: +(arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(4) };
  };

  const staticStat = analyze(staticSamples);
  const walkStat = analyze(walkResult.samples);
  const postStat = analyze(postWalkSamples);

  log('STATIC', JSON.stringify(staticStat));
  log('WALK', JSON.stringify(walkStat));
  log('POST_WALK', JSON.stringify(postStat));

  // Also get overlap info
  const overlapInfo = await page.evaluate(() => {
    const w = (window).__worldDebug;
    if (!w || !w.hy3dTerrain) return null;
    const centers = w.hy3dTerrain.centerList;
    const yc = w.yCoord || {};
    const px = yc.dpx ?? 0, pz = yc.dpz ?? 0;
    const loaded = centers.map((c, i) => {
      const dx = c.cx - px, dz = c.cz - pz;
      return { i, dist: Math.sqrt(dx*dx+dz*dz), r: c.r, loaded: dx*dx+dz*dz <= 360000 };
    }).filter((x) => x.loaded);
    const overlaps = [];
    for (let a = 0; a < loaded.length; a++) {
      for (let b = a+1; b < loaded.length; b++) {
        const dcx = loaded[a].cx - loaded[b].cx; // won't work - need center from original
        // Just use distance from player as proxy
      }
    }
    return { playerPos: { x: px, z: pz }, loadedCount: loaded.length, indices: loaded.map((x)=>x.i) };
  });

  const verdict = {
    staticOK: staticStat.range < 0.5,
    walkOK: walkStat.range < 1.5,   // allow more variance during walking (terrain slope)
    walkSevereFlicker: walkStat.range > 3.0,  // >3 units = definitely broken
    overall: (staticStat.range < 0.5 && walkStat.range < 1.5) ? 'PASS' : 'FAIL'
  };

  log('VERDICT', JSON.stringify(verdict));
  await page.screenshot({ path: 'C:/Users/ken/WorkBuddy/2026-08-05-19-13-32/pet/tools/_shots_lake/walk_test.png' }).catch(()=>{});

  process.exit(verdict.overall === 'PASS' ? 0 : 1);
} catch(e) {
  log('FATAL', e.message); process.exit(2);
} finally {
  await browser.close().catch(()=>{});
}
