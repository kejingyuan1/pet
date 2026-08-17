// Lake-island spawn E2E (README to-do #1 blocker). Iron-rule validation via Playwright + system Chrome.
// Asserts that forcing lake-island spawn (?spawnIsland=1) lands the player on LAND (playerInWater=0,
// hy3dGround non-null & above water), and that a normal island (?spawnIsland=0) still works (no regression).
// Prereq: ng serve (4201, with fix) + backend spring-boot (8080) running.
import { chromium } from 'playwright-core';
import fs from 'fs';

const CHROME = 'C:/Users/ken/.agent-browser/browsers/chrome-151.0.7922.76/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:4201';
const USER = 'wtest_ken', PASS = 'Test1234!';
const SHOT_DIR = 'C:/Users/ken/WorkBuddy/2026-08-05-19-13-32/pet/tools/_shots_lake';
fs.mkdirSync(SHOT_DIR, { recursive: true });
const log = (...a) => console.log('[LAKE-E2E]', ...a);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const errors = [];

const browser = await chromium.launch({
  executablePath: CHROME, headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox']
});

async function enterWorld(spawnIsland) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE:' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERR:' + e.message));
  await page.goto(`${BASE}/?spawnIsland=${spawnIsland}`, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(1500);
  await page.fill('input[placeholder="用户名"]', USER).catch(() => {});
  await page.fill('input[placeholder*="密码"]', PASS).catch(() => {});
  await page.click('button.btn-login').catch(async () => { await page.click('button[type="submit"]').catch(() => {}); });
  log(`(island ${spawnIsland}) login`); await sleep(2500);
  await page.click('text=进入大世界').catch(async () => {
    for (const b of await page.$$('button')) { const t = await b.innerText().catch(() => ''); if (t.includes('大世界') || t.includes('进入')) { await b.click(); break; } }
  });
  log(`(island ${spawnIsland}) enter-world`); await sleep(4000);
  let ready = false;
  for (let i = 0; i < 50; i++) { ready = await page.evaluate(() => !!(window).__worldDebug && (window).__worldDebug.ready).catch(() => false); if (ready) break; await sleep(1000); }
  log(`(island ${spawnIsland}) ready =`, ready);
  // let spawn clamp settle, then sample the debug a few times
  await sleep(3000);
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const d = await page.evaluate(() => {
      const w = (window).__worldDebug; if (!w) return null;
      return {
        playerInWater: w.counts ? w.counts.playerInWater : null,
        hy3dGround: w.yCoord ? w.yCoord.hy3dGround : null,
        waterLevel: w.waterLevel,
        nearestIdx: w.spawnDiag ? w.spawnDiag.nearestIdx : null,
        onIslandCircle: w.spawnDiag ? w.spawnDiag.onIslandCircle : null,
        dpx: w.yCoord ? w.yCoord.dpx : null, dpz: w.yCoord ? w.yCoord.dpz : null
      };
    }).catch(() => null);
    samples.push(d); await sleep(800);
  }
  const probe = await page.evaluate(() => (window).__probeIsland ? (window).__probeIsland(1) : null).catch(() => null);
  await page.screenshot({ path: `${SHOT_DIR}/island_${spawnIsland}.png` }).catch(() => {});
  await page.close();
  return { spawnIsland, ready, samples, probe };
}

const result = { cases: [], errors };
const ISLANDS = (process.env.ISLANDS || '1,0').split(',').map(s => parseInt(s, 10));
try {
  for (const idx of ISLANDS) {
    try {
      const c = await enterWorld(idx);
      result.cases.push(c);
      const inWaters = c.samples.map(s => s && s.playerInWater).filter(v => v != null);
      const grounds = c.samples.map(s => s && s.hy3dGround).filter(v => v != null);
      const maxInWater = inWaters.length ? Math.max(...inWaters) : null;
      const groundNonNull = grounds.some(g => g != null);
      const groundAboveWater = grounds.some(g => g != null && c.samples[0] && g > (c.samples[0].waterLevel ?? -5));
      const nearest = [...new Set(c.samples.map(s => s && s.nearestIdx).filter(v => v != null))];
      c.summary = { maxInWater, groundNonNull, groundAboveWater, nearest };
      log(`island ${idx}: playerInWater(max)=${maxInWater} hy3dGroundNonNull=${groundNonNull} aboveWater=${groundAboveWater} nearestIdx=${JSON.stringify(nearest)}`);
      if (c.probe) log(`  probeIsland(1): centerHit=${c.probe.centerHit} variant=${c.probe.variant} rings0.3=${JSON.stringify(c.probe.rings[2])}`);
    } catch (e) {
      log(`island ${idx} ERROR`, e.message); errors.push(`island${idx}:` + e.message);
      result.cases.push({ spawnIsland: idx, error: e.message });
    }
  }
  const lake = result.cases.find(c => c.spawnIsland === 1);
  const normal = result.cases.find(c => c.spawnIsland === 0);
  const lakeOk = lake && lake.summary && lake.summary.maxInWater === 0 && lake.summary.groundNonNull && lake.summary.groundAboveWater;
  const normalOk = !normal || (normal.summary && normal.summary.maxInWater === 0 && normal.summary.groundNonNull);
  result.verdict = { lakeOk: !!lakeOk, normalOk: !!normalOk, pass: !!lakeOk && !!normalOk };
  log('VERDICT', JSON.stringify(result.verdict));
} catch (e) {
  log('FATAL', e.message); errors.push('FATAL:' + e.message);
  result.verdict = { pass: false, fatal: e.message };
} finally {
  await browser.close();
  fs.writeFileSync(`${SHOT_DIR}/result.json`, JSON.stringify(result, null, 2));
  process.exit((result.verdict && result.verdict.pass && errors.length === 0) ? 0 : 1);
}
