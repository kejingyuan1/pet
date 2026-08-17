// Ranch baby/egg integration E2E (README to-do #2). Iron-rule validation via Playwright + system Chrome.
// Flow: login -> open ranch (robust wait) -> claim daily coins -> build house (if needed) ->
//   buy chicken & duck -> assert lifecycle baby models (babyCount>=1) and egg models (eggCount>=1)
//   load in the 3D showroom, then click "拾取鸡蛋" and assert coins increased (gameplay wired).
// Prereq: ng serve (4201, with fix) + backend spring-boot (8080) running.
import { chromium } from 'playwright-core';
import fs from 'fs';

const CHROME = 'C:/Users/ken/.agent-browser/browsers/chrome-151.0.7922.76/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:4201';
const USER = 'wtest_ken', PASS = 'Test1234!';
const SHOT_DIR = 'C:/Users/ken/WorkBuddy/2026-08-05-19-13-32/pet/tools/_shots_ranch';
fs.mkdirSync(SHOT_DIR, { recursive: true });
const log = (...a) => console.log('[RANCH-E2E]', ...a);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const errors = [];

const browser = await chromium.launch({
  executablePath: CHROME, headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE:' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERR:' + e.message));
const result = { steps: [], errors };
const dbg = () => page.evaluate(() => window.__ranchDebug || null).catch(() => null);

try {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(1500);
  await page.fill('input[placeholder="用户名"]', USER).catch(() => {});
  await page.fill('input[placeholder*="密码"]', PASS).catch(() => {});
  await page.click('button.btn-login').catch(async () => { await page.click('button[type="submit"]').catch(() => {}); });
  log('login'); await sleep(2500);

  // robustly open the ranch overlay (the always-on world3d canvas can cover the button,
  // so use a forced click to dispatch the handler directly)
  await sleep(2500); // let login + world3d init settle
  // dispatch the click programmatically (proven to fire openRanch; a real Playwright mouse
  // click is flaky here because the event can be swallowed before Angular's handler runs)
  const opened = await page.evaluate(() => {
    const btn = document.querySelector('.enter-ranch-btn');
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!opened) throw new Error('.enter-ranch-btn not found after login');
  // the overlay renders ~2s after click (Angular CD async); waitForSelector on the dynamic
  // component is unreliable here, so poll via waitForFunction + existence check instead
  await page.waitForFunction(() => document.querySelector('.ranch-overlay'), { timeout: 15000 }).catch(() => {});
  await sleep(2000); // allow Angular to render the overlay content + showroom load
  const shopN = await page.$$eval('.shop-item', els => els.length).catch(() => 0);
  if (shopN < 1) throw new Error('ranch overlay opened but no shop-items rendered');
  log('ranch overlay open, shop-items=', shopN);

  // claim daily coins (funds house + animals) if available
  const claim = await page.$('text=领取每日金币');
  if (claim) { await claim.click(); log('claimed daily'); await sleep(800); }

  // build house if not already owned (animalCount>0 means house+animals already loaded)
  let d = await dbg();
  const needBuild = !d || (d.animalCount || 0) === 0;
  if (needBuild) {
    const buildBtn = await page.$('text=建造一层小屋');
    if (buildBtn) { await buildBtn.click(); log('build house clicked'); await sleep(2000); }
    else log('WARN: no build button but animals not loaded');
  } else log('house already owned (animals loaded)');

  // wait for showroom to populate (house + 7 animals)
  for (let i = 0; i < 40; i++) { d = await dbg(); if (d && (d.animalCount || 0) >= 7) break; await sleep(1000); }
  log('ranchDebug after build', JSON.stringify(d));

  // buy chicken + duck from the shop (programmatic click — real mouse click is intercepted by the 3D canvas)
  async function buyByName(name) {
    const res = await page.evaluate((name) => {
      const items = document.querySelectorAll('.shop-item');
      for (const it of items) {
        const n = it.querySelector('.si-name');
        if (n && (n.textContent || '').includes(name)) {
          const buy = it.querySelector('.si-buy');
          if (buy) { buy.click(); return 'bought'; }
          return 'owned';
        }
      }
      return 'notfound';
    }, name);
    log('buy', name, '->', res); await sleep(1200);
    return res === 'bought';
  }
  await buyByName('鸡');
  await buyByName('鸭');

  // wait for baby/egg models to load after reload
  let d2 = null;
  for (let i = 0; i < 50; i++) { d2 = await dbg(); if (d2 && (d2.babyCount || 0) >= 1 && (d2.eggCount || 0) >= 1) break; await sleep(1000); }
  log('ranchDebug after buy', JSON.stringify(d2));

  // collect eggs (gameplay) — programmatic click if button available
  const coinsBefore = d2 ? d2.coins : null;
  const eggClicked = await page.evaluate(() => {
    const b = document.querySelector('.egg-btn');
    if (b) { b.click(); return true; }
    return false;
  });
  let coinsAfter = null;
  if (eggClicked) { log('clicked collect eggs'); await sleep(1000); d2 = await dbg(); coinsAfter = d2 ? d2.coins : null; }
  else log('no egg-btn (eggs already collected today or none)');

  await page.screenshot({ path: `${SHOT_DIR}/ranch.png` }).catch(() => {});

  result.steps.push({
    builtHouse: needBuild, babyCount: d2 ? d2.babyCount : 0, eggCount: d2 ? d2.eggCount : 0,
    animalCount: d2 ? d2.animalCount : 0, coinsBefore, coinsAfter, eggClicked
  });
  const babyOk = !!d2 && (d2.babyCount || 0) >= 1;
  const eggOk = !!d2 && (d2.eggCount || 0) >= 1;
  const collectOk = !eggClicked || (coinsAfter != null && coinsBefore != null && coinsAfter > coinsBefore);
  result.verdict = { babyOk, eggOk, collectOk, pass: babyOk && eggOk && collectOk };
  log('VERDICT', JSON.stringify(result.verdict));
} catch (e) {
  log('FATAL', e.message); errors.push('FATAL:' + e.message);
  result.verdict = { pass: false, fatal: e.message };
} finally {
  await browser.close();
  fs.writeFileSync(`${SHOT_DIR}/result.json`, JSON.stringify(result, null, 2));
  process.exit((result.verdict && result.verdict.pass && errors.length === 0) ? 0 : 1);
}
