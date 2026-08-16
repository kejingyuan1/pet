// 空气墙端到端验证（2026-08-16 根治后，v3）
// 核心证明（坡地/山体不再是空气墙）：
//   选最近的 MOUNTAIN(sem===3) 格，用 moveTarget 世界空间自动驾驶【直驱】（不走 A*），
//   朝山体走。若山体边界是开阔地形(沙1/草2/山3)且玩家连续 3 个采样(≈1.5s)零进展 → 真空气墙；
//   若前方是 树(4)/水(0)/河(10) 卡住 → 合法障碍/测试局限，不算空气墙，换下一座山体重试。
//   玩家逼近山体(minDist<30%初始距)或踩上 sem===3 → 坡地可走，证明修复生效。
// 另含：A* 导航到岛上几点（绕开树），同样只把"开阔地形卡死"判为空气墙，用于常规走动回归。
// 前置：ng serve(4200) + 后端 spring-boot(8080，含空气墙修复) 已启动。
import { chromium } from 'playwright-core';
import fs from 'fs';

const CHROME = 'C:/Users/ken/.agent-browser/browsers/chrome-151.0.7922.76/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:4200';
const USER = 'wtest_ken', PASS = 'Test1234!';
const SHOT_DIR = 'C:/Users/ken/WorkBuddy/2026-08-05-19-13-32/pet/tools/_shots_airwall';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const log = (...a) => console.log('[AIRWALL]', ...a);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const errors = [];

const browser = await chromium.launch({
  executablePath: CHROME, headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE:' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERR:' + e.message));

async function shot(name) { const p = `${SHOT_DIR}/${name}.png`; await page.screenshot({ path: p }); log('shot ->', p); return p; }
const playerCell = () => page.evaluate(() => (window).__playerCell());
const cellSem = (gx, gz) => page.evaluate(([x, z]) => (window).__cellSem ? (window).__cellSem(x, z) : -1, [gx, gz]).catch(() => -1);

// 直驱山体：验证坡地/山体可走。迭代多座候选山体，直到得到明确结论。
async function slopeProof() {
  const trials = [[160, 0], [240, 40], [320, 90], [340, 150]];
  for (const [mr, nr] of trials) {
    let m = null;
    for (let i = 0; i < 8; i++) { m = await page.evaluate(([a, b]) => (window).__nearestMountain ? (window).__nearestMountain(a, b) : null, [mr, nr]).catch(() => null); if (m) break; await sleep(500); }
    if (!m) continue;
    log('slope trial -> mountain', JSON.stringify(m));
    await page.evaluate(w => (window).__goto(w.x, w.z), m);
    const t0 = Date.now();
    let minDist = m.dist, maxSem = -1, prevDist = m.dist, stallOpen = 0, blocked = false;
    while (Date.now() - t0 < 28000) {
      const c = await playerCell();
      if (c.sem > maxSem) maxSem = c.sem;
      const d = Math.hypot(c.x - m.x, c.z - m.z); if (d < minDist) minDist = d;
      await sleep(350);
      const c2 = await playerCell();
      const d2 = Math.hypot(c2.x - m.x, c2.z - m.z);
      const moved = prevDist - d2;
      if (Math.abs(moved) < 0.5) {
        const dirx = m.x - c2.x, dirz = m.z - c2.z, dl = Math.hypot(dirx, dirz) || 1;
        const ag = Math.floor(c2.x + dirx / dl * 2), az = Math.floor(c2.z + dirz / dl * 2);
        const asem = await cellSem(ag, az);
        if (asem === 1 || asem === 2 || asem === 3) {
          stallOpen++;
          if (stallOpen >= 3) { log('REAL AIRWALL on open terrain sem', asem, '-> FAIL'); await page.evaluate(() => (window).__clearGoto()); return { label: 'mountain', ok: false, realAirwall: true, minDist: +minDist.toFixed(2), maxSem, dist: m.dist }; }
        } else { blocked = true; log('trial blocked by water/tree sem', asem, '-> next mountain'); break; }
      } else { stallOpen = 0; }
      prevDist = d2;
      if (d2 < 4 || maxSem === 3) { log('mountain REACHED minDist', d2.toFixed(2), 'maxSem', maxSem); await page.evaluate(() => (window).__clearGoto()); return { label: 'mountain', ok: true, realAirwall: false, minDist: +Math.min(minDist, d2).toFixed(2), maxSem, dist: m.dist, reached: (maxSem === 3) || d2 < 4 }; }
    }
    await page.evaluate(() => (window).__clearGoto());
    if (blocked) continue;
    if (minDist < 0.4 * m.dist || maxSem === 3) { log('mountain progress ok minDist', minDist.toFixed(2), 'maxSem', maxSem); return { label: 'mountain', ok: true, realAirwall: false, minDist: +minDist.toFixed(2), maxSem, dist: m.dist, reached: (maxSem === 3) }; }
  }
  return { label: 'mountain', ok: false, realAirwall: false, reason: 'no clear mountain trial' };
}

// A* 导航到 (tx,tz)，逐路点跟随；仅把"开阔地形(沙/草/山)卡死"判为空气墙。
async function navAStar(tx, tz, label, timeoutMs = 45000) {
  let path = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 12000) {
    path = await page.evaluate(([x, z]) => (window).__pathTo(x, z), [tx, tz]).catch(() => null);
    if (path && path.length) break;
    await sleep(700);
  }
  if (!path || !path.length) { log('NO PATH ->', label); return { label, ok: false, reason: 'no_path' }; }
  let wpIdx = 0, stallCount = 0, prevFinal = Infinity, minDist = Infinity, maxSem = -1, stalledOnTree = false, aheadSem = -1;
  const startDist = Math.hypot((await playerCell()).x - tx, (await playerCell()).z - tz);
  const t1 = Date.now();
  while (wpIdx < path.length && Date.now() - t1 < timeoutMs) {
    const wp = path[wpIdx];
    await page.evaluate(w => (window).__goto(w.x, w.z), wp);
    const wt0 = Date.now();
    while (Date.now() - wt0 < 3000) {
      const c = await playerCell();
      if (c.sem > maxSem) maxSem = c.sem;
      const dT = Math.hypot(c.x - tx, c.z - tz); if (dT < minDist) minDist = dT;
      if (Math.hypot(c.x - wp.x, c.z - wp.z) < 3) break;
      await sleep(200);
    }
    const c = await playerCell();
    const curFinal = Math.hypot(c.x - tx, c.z - tz);
    if (curFinal < minDist) minDist = curFinal;
    const progress = prevFinal === Infinity ? 999 : prevFinal - curFinal;
    if (progress < 0.5) stallCount++; else stallCount = 0;
    prevFinal = curFinal;
    if (stallCount >= 3) {
      const dirx = tx - c.x, dirz = tz - c.z, dl = Math.hypot(dirx, dirz) || 1;
      const aheadGx = Math.floor(c.x + dirx / dl * 2), aheadGz = Math.floor(c.z + dirz / dl * 2);
      aheadSem = await cellSem(aheadGx, aheadGz);
      stalledOnTree = (aheadSem === 4);
      const airwall = (aheadSem === 1 || aheadSem === 2 || aheadSem === 3);
      log('STALL ->', label, 'wp', wpIdx, 'finalDist', curFinal.toFixed(1), 'aheadSem', aheadSem, airwall ? '(开阔地形=真空气墙!)' : (stalledOnTree ? '(tree=合法)' : '(水/其他=非空气墙)'));
      break;
    }
    wpIdx++;
  }
  await page.evaluate(() => (window).__clearGoto());
  const c = await playerCell();
  const finalDist = Math.hypot(c.x - tx, c.z - tz);
  const progressed = minDist < 8 || minDist <= 0.5 * startDist;
  const realAirwall = (stallCount >= 3 && (aheadSem === 1 || aheadSem === 2 || aheadSem === 3));
  const ok = progressed && !realAirwall;
  log('nav', label, '-> ok=', ok, 'finalDist=', finalDist.toFixed(2), 'minDist=', minDist.toFixed(2), 'startDist=', startDist.toFixed(1), 'maxSem=', maxSem, 'wp=', path.length, 'reachedWp=', wpIdx, 'stall=', stallCount, (realAirwall ? ' [AIRWALL!]' : (stalledOnTree ? ' [tree]' : '')));
  return { label, ok, finalDist: +finalDist.toFixed(2), minDist: +minDist.toFixed(2), startDist: +startDist.toFixed(1), maxSem, waypoints: path.length, reachedWp: wpIdx, stallCount, stalledOnTree, realAirwall };
}

const result = { navigations: [], errors };

try {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(1500);
  await page.fill('input[placeholder="用户名"]', USER).catch(() => {});
  await page.fill('input[placeholder*="密码"]', PASS).catch(() => {});
  await page.click('button.btn-login').catch(async () => { await page.click('button[type="submit"]').catch(() => {}); });
  log('login'); await sleep(2500); await shot('01_login');
  await page.click('text=进入大世界').catch(async () => {
    for (const b of await page.$$('button')) { const t = await b.innerText().catch(() => ''); if (t.includes('大世界') || t.includes('进入')) { await b.click(); break; } }
  });
  log('enter-world'); await sleep(4000);
  let ready = false;
  for (let i = 0; i < 40; i++) { ready = await page.evaluate(() => !!(window).__worldDebug && (window).__worldDebug.ready).catch(() => false); if (ready) break; await sleep(1000); }
  log('ready =', ready); await shot('02_world');

  // 等玩家所在 chunk 加载后再做导航
  for (let i = 0; i < 25; i++) { const c = await playerCell(); if (c.sem !== -1) break; await sleep(1000); }

  // 1) 坡地/山体空气墙证明（直驱）
  result.navigations.push(await slopeProof());

  // 2) 常规走动回归：A* 导航到岛上几点（绕开树），仅"开阔地形卡死"算空气墙
  const start = await playerCell();
  const sx = Math.round(start.x), sz = Math.round(start.z);
  const points = [
    { x: sx, z: sz - 60, label: 'north' },
    { x: sx + 60, z: sz - 20, label: 'east' },
    { x: sx - 60, z: sz - 20, label: 'west' }
  ];
  for (const p of points) result.navigations.push(await navAStar(p.x, p.z, p.label));

  await shot('03_after_nav');

  const realAirwall = result.navigations.some(n => n.realAirwall === true);
  const movedSomewhere = result.navigations.some(n => (n.minDist ?? 999) < (n.startDist ?? 999) - 5);
  const mountainNav = result.navigations.find(n => n.label === 'mountain');
  const mountainReached = !!(mountainNav && (mountainNav.ok || mountainNav.reached) && !mountainNav.realAirwall);
  const pass = errors.length === 0 && !realAirwall && movedSomewhere && mountainReached;
  result.verdict = { pass, realAirwall, movedSomewhere, mountainReached, errorCount: errors.length, navigationsOk: result.navigations.map(n => n.ok) };
  log('VERDICT pass=', pass, 'realAirwall=', realAirwall, 'moved=', movedSomewhere, 'mountainReached=', mountainReached, 'errors=', errors.length);
  fs.writeFileSync(`${SHOT_DIR}/result.json`, JSON.stringify(result, null, 2));
} catch (e) {
  log('FATAL', e.message); await shot('FATAL').catch(() => {});
  errors.push('FATAL:' + e.message);
  result.verdict = { pass: false, fatal: e.message };
} finally {
  await browser.close();
  fs.writeFileSync(`${SHOT_DIR}/result.json`, JSON.stringify(result, null, 2));
  process.exit(errors.length || (result.verdict && !result.verdict.pass) ? 1 : 0);
}
