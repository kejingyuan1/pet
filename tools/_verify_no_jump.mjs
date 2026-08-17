// Robust lake-island jitter verification.
// Samples the LOCAL player's rendered Y (window.__dpyNow, set every frame) and
// server Y (window.__worldDebug.yCoord) over ~10s. Asserts the rendered Y stays
// stable on land (range < 0.5, minY > waterLevel + 1.0).
import { chromium } from 'playwright-core';
import fs from 'fs';

const CHROME = 'C:/Users/ken/.agent-browser/browsers/chrome-151.0.7922.76/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:4200';
const LOG = 'C:/Users/ken/WorkBuddy/2026-08-05-19-13-32/pet/tools/_shots_lake/nojump2.log';
const USER = 'wtest_ken', PASS = 'Test1234!';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const out = (...a) => { const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); console.log(s); try { fs.appendFileSync(LOG, s + '\n'); } catch {} };

// Watchdog: never hang forever.
const watchdog = setTimeout(() => { out('WATCHDOG TIMEOUT 120s'); process.exit(3); }, 120000);

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR:' + e.message));
try {
  out('goto', BASE + '/?spawnIsland=1');
  await page.goto(`${BASE}/?spawnIsland=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  out('loaded'); await sleep(1500);
  // login
  await page.fill('input[placeholder="用户名"]', USER).catch(e => out('fill user fail', e.message));
  await page.fill('input[placeholder*="密码"]', PASS).catch(e => out('fill pass fail', e.message));
  await page.click('button.btn-login').catch(e => out('login click fail', e.message));
  out('login clicked'); await sleep(2500);
  // enter world
  await page.click('text=进入大世界').catch(async () => {
    for (const b of await page.$$('button')) { const t = await b.innerText().catch(()=>''); if (t.includes('大世界')) { await b.click(); out('clicked 大世界 fallback'); break; } }
  });
  out('enter world clicked'); await sleep(4000);
  // wait for debug ready
  let ready = false;
  for (let i = 0; i < 40; i++) {
    ready = await page.evaluate(() => !!(window).__worldDebug && (window).__worldDebug.ready).catch(()=>false);
    if (ready) { out('worldDebug ready at', i); break; }
    await sleep(1000);
  }
  await sleep(2000);
  // sample
  const samples = [];
  for (let i = 0; i < 40; i++) {
    const d = await page.evaluate(() => {
      const w = (window).__worldDebug;
      return {
        dpy: (window).__dpyNow,
        displayY: w ? w.yCoord.displayY : null,
        serverPy: w ? w.yCoord.serverPy : null,
        hy3dGround: w ? w.yCoord.hy3dGround : null,
        inWater: w ? w.counts.playerInWater : null,
        waterLevel: w ? w.waterLevel : null,
        px: w ? w.px : null, pz: w ? w.pz : null,
      };
    }).catch(() => null);
    if (d) samples.push(d);
    await sleep(250);
  }
  const dps = samples.map(s => s.dpy).filter(v => v != null && Number.isFinite(v));
  const minY = Math.min(...dps), maxY = Math.max(...dps), range = maxY - minY;
  const wl = samples[0]?.waterLevel ?? -5;
  const stableOnLand = range < 0.5 && minY > (wl + 1.0);
  out('RESULT', { samples: dps.length, dpy_min: +minY.toFixed(3), dpy_max: +maxY.toFixed(3), range: +range.toFixed(3), wl, stableOnLand, first: samples[0], last: samples[samples.length-1] });
  const verdict = stableOnLand && errors.length === 0;
  out('VERDICT', verdict ? 'PASS' : 'FAIL');
  await page.screenshot({ path: 'C:/Users/ken/WorkBuddy/2026-08-05-19-13-32/pet/tools/_shots_lake/nojump2.png' }).catch(()=>{});
  clearTimeout(watchdog);
  process.exit(verdict ? 0 : 1);
} catch (e) {
  out('FATAL', e.message); clearTimeout(watchdog); process.exit(2);
} finally {
  await browser.close().catch(()=>{});
}
