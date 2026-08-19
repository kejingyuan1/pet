/* 阶段 E 主理人亲自验收 v2（工程 A 海面/水速/穿模 + 工程 B 持久化）
 *
 * 核心铁证目标：
 *  - A：waterSize === 10000（海面扩展）
 *  - B：uTimeScale === 0.00005（水速降 4×）
 *  - C：diskRadiusByVariant 4 变体均 > 0 且 shoreClipFixAdded === true（湖底盘治穿模黑坑）
 *  - D：清 DB → 首登随机 → 落地自动保存 → 二次刷新登录 → 断言回到同一坐标（islandIdx 一致 + gx/gz 一致）
 *
 * 运行：node D:/pet/tools/verify_stage_e_v2.cjs
 */
const fs = require('fs');
const { execSync } = require('child_process');
const PW = require('C:/Users/WIN11/.workbuddy/binaries/node/versions/22.22.2/node_modules/@playwright/cli/node_modules/playwright');
const { chromium } = PW;

const BASE = 'http://127.0.0.1:8080';
const FRONTEND = 'http://127.0.0.1:4200';
const MYSQL = 'D:/mysql-5.7.43-winx64/bin/mysql';
const USER = 'kejingyuan';
const PASS = 'abc123';
const OUT = 'D:/pet/tools/stage_e_v2';
fs.mkdirSync(OUT, { recursive: true });
const RESULT = { ts: new Date().toISOString() };

function log(...a) { console.log('[verify]', ...a); }

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/WIN11/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe',
    args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--disable-gpu-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });
  page.on('pageerror', e => errors.push('PAGEERR:' + String(e).slice(0, 400)));

  // 1) 登录
  await page.goto(FRONTEND + '/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('.login-card input', { timeout: 20000 });
  const inputs = page.locator('.login-card input');
  await inputs.nth(0).fill(USER);
  await inputs.nth(1).fill(PASS);
  await page.click('.btn-login');
  await page.waitForSelector('.app-shell', { timeout: 20000 });
  const { uid, token } = await page.evaluate(async () => {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'kejingyuan', password: 'abc123' }) });
    const d = await r.json();
    return { uid: d.data.userId, token: d.data.token };
  });
  log('登录 uid=', uid);

  // 2) 清空该用户持久化记录（确保首登是"随机"而非"恢复"）
  try {
    execSync(`"${MYSQL}" -h127.0.0.1 -uroot -p123456 pet_park -e "DELETE FROM user_world_state WHERE user_id=${uid}"`, { stdio: 'ignore' });
    log('已清空 user_world_state(uid=' + uid + ')');
  } catch (e) { log('清空失败（可能无记录）:', e.message); }

  // 3) 进大世界（首登，无存档 → 随机落岛）
  await page.click('nav.nav button:has-text("大世界")');
  await page.waitForSelector('app-world3d .world3d-mount canvas', { timeout: 30000 });
  await page.evaluate(() => { window.__worldDebugEnabled = true; });
  // 轮询等待新代码已加载（__worldDebug.shoreClip.diskRadiusByVariant 存在 = 工程 A 新字段）
  await page.waitForFunction(() => {
    const d = window.__worldDebug;
    return d && d.shoreClip && d.shoreClip.diskRadiusByVariant && d.shoreClip.diskRadiusByVariant.lake > 0;
  }, { timeout: 40000 });
  // 等落地自动保存 + 至少一次定时保存(10s)覆盖，使坐标收敛到后端权威点（避免首登瞬时前后端随机不一致干扰断言）
  await page.waitForTimeout(12000);

  // 4) 读首登诊断
  const first = await page.evaluate(() => {
    const d = window.__worldDebug;
    return {
      waterSize: d.waterSize,
      uTimeScale: d.uTimeScale,
      diskRadiusByVariant: d.shoreClip.diskRadiusByVariant,
      shoreClipFixAdded: d.shoreClip.shoreClipFixAdded,
      lakeBasinVsWater: d.shoreClip.lakeBasinVsWater,
      lakeFloorVsWater: d.shoreClip.lakeFloorVsWater,
      lakeVariantLoaded: d.shoreClip.lakeVariantLoaded,
      px: d.yCoord.dpx,
      pz: d.yCoord.dpz,
      py: d.yCoord.displayY,
      spawnNearestIdx: d.spawnDiag.nearestIdx,
      playerInWater: d.counts.playerInWater,
      sceneBg: d.scene.bg,
      sceneFog: d.scene.fog
    };
  });
  log('首登诊断:', JSON.stringify(first));

  // 5) 读后端 GET（证明前端落地自动保存已生效）
  const saved1 = await page.evaluate(async () => {
    const r = await fetch('/api/world/position', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('pp_token') } });
    return await r.json();
  });
  log('首登后后端记录 saved1:', JSON.stringify(saved1.data));

  // 6) 穿模/海面截图（首登视角，默认昼夜）
  await page.screenshot({ path: OUT + '/first_view.png' });

  // 7) 二次登录：刷新页面（保留 localStorage token）→ 重新进大世界（应恢复存档）
  await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('.app-shell', { timeout: 20000 });
  // reload 后 DOM 滞后：先等入口按钮渲染再点（避免 canvas 仍 hidden 导致超时）
  await page.waitForSelector('nav.nav button:has-text("大世界")', { timeout: 20000 });
  await page.click('nav.nav button:has-text("大世界")');
  await page.waitForSelector('app-world3d .world3d-mount canvas', { state: 'visible', timeout: 30000 });
  await page.evaluate(() => { window.__worldDebugEnabled = true; });
  await page.waitForFunction(() => {
    const d = window.__worldDebug;
    return d && d.shoreClip && d.shoreClip.diskRadiusByVariant && d.shoreClip.diskRadiusByVariant.lake > 0;
  }, { timeout: 40000 });
  await page.waitForTimeout(4000);

  const second = await page.evaluate(() => {
    const d = window.__worldDebug;
    return {
      px: d.yCoord.dpx,
      pz: d.yCoord.dpz,
      py: d.yCoord.displayY,
      spawnNearestIdx: d.spawnDiag.nearestIdx,
      playerInWater: d.counts.playerInWater
    };
  });
  const saved2 = await page.evaluate(async () => {
    const r = await fetch('/api/world/position', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('pp_token') } });
    return await r.json();
  });
  log('二次登录渲染坐标 second:', JSON.stringify(second));
  log('二次登录后端记录 saved2:', JSON.stringify(saved2.data));
  await page.screenshot({ path: OUT + '/second_view.png' });

  await browser.close();

  // 8) 断言
  RESULT.first = first;
  RESULT.saved1 = saved1.data;
  RESULT.second = second;
  RESULT.saved2 = saved2.data;
  RESULT.consoleErrors = errors;

  const coordMatch = (a, b) => a != null && b != null && Math.abs(a - b) < 2;
  RESULT.checks = {
    A_waterSize_10000: first.waterSize === 10000,
    B_uTimeScale_000005: Math.abs(first.uTimeScale - 0.00005) < 1e-9,
    C_disk_all_variants_positive: !!(first.diskRadiusByVariant && first.diskRadiusByVariant.plain > 0 && first.diskRadiusByVariant.lake > 0 && first.diskRadiusByVariant.peninsula > 0 && first.diskRadiusByVariant.mountain > 0),
    C_shoreClipFixAdded: first.shoreClipFixAdded === true,
    D_saved1_exists: !!(saved1.data && typeof saved1.data.gx === 'number'),
    D_saved1_matches_first: coordMatch(saved1.data && saved1.data.gx, first.px) && coordMatch(saved1.data && saved1.data.gz, first.pz),
    D_rejoin_coord_match: coordMatch(first.px, second.px) && coordMatch(first.pz, second.pz),
    D_rejoin_island_match: !!(saved1.data && saved2.data && saved1.data.islandIdx === saved2.data.islandIdx)
  };
  RESULT.allPass = Object.values(RESULT.checks).every(Boolean);

  fs.writeFileSync(OUT + '/result.json', JSON.stringify(RESULT, null, 2));
  log('==== 验收结果 ====');
  log(JSON.stringify(RESULT.checks, null, 2));
  log('allPass =', RESULT.allPass);
  log('console/page errors 数:', errors.length);
  if (errors.length) log(errors.slice(0, 10).join('\n'));
  process.exit(RESULT.allPass ? 0 : 1);
}

main().catch(e => { console.error('[verify] 异常:', e); process.exit(2); });
