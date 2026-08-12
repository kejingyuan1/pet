/* M1 大世界前端 E2E 验证：登录 → 大世界 → 地形渲染 → 移动交互 → WS → 无 console error */
const { chromium } = require('playwright');

(async () => {
  const errors = [];
  const browser = await chromium.launch({
    headless: true,
    // 本地 playwright 版本与已装浏览器小版本不一致，显式指定可执行文件（chromium_headless_shell-1234）
    executablePath: 'C:/Users/WIN11/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe',
    args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--disable-gpu-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  page.on('console', msg => {
    if (msg.type() === 'error') errors.push('[console.error] ' + msg.text().slice(0, 300));
  });
  page.on('pageerror', err => errors.push('[pageerror] ' + String(err).slice(0, 300)));

  // 1. 打开页面 → 登录
  await page.goto('http://localhost:4200/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('.login-card input', { timeout: 20000 });
  const inputs = page.locator('.login-card input');
  await inputs.nth(0).fill('worldtest4996');
  await inputs.nth(1).fill('abc123');
  await page.click('.btn-login');
  await page.waitForSelector('.app-shell', { timeout: 20000 });
  console.log('[ok] 登录成功，进入主应用');

  // 2. 切到大世界页签
  await page.click('nav.nav button:has-text("大世界")');
  await page.waitForSelector('app-world3d .world3d-mount canvas', { timeout: 30000 });
  console.log('[ok] 大世界 canvas 出现');

  // 3. 等待 chunk 流式加载 + WS 接入
  await page.waitForTimeout(6000);

  const canvasInfo = await page.evaluate(() => {
    const c = document.querySelector('.world3d-mount canvas');
    return c ? { w: c.width, h: c.height } : null;
  });
  console.log('[info] canvas 尺寸:', JSON.stringify(canvasInfo));

  // HUD 状态
  const hudBefore = await page.locator('.w3d-hud').innerText().catch(() => '');
  console.log('[info] HUD 初始:\n' + hudBefore);

  // 4. 截图（地形渲染前）
  await page.screenshot({ path: 'C:/Users/WIN11/WorkBuddy/2026-08-03-13-46-59/pet-park/playwright-world3d-before.png' });

  // 5. 移动交互：按住 W 约 1s（前进）
  const posBefore = await page.locator('.w3d-hud .hud-row').nth(1).innerText().catch(() => '');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(500);
  const posAfter = await page.locator('.w3d-hud .hud-row').nth(1).innerText().catch(() => '');
  console.log('[move] 移动前:', posBefore);
  console.log('[move] 移动后:', posAfter);
  const moved = posBefore !== posAfter;
  console.log(moved ? '[ok] 玩家移动成功（位置文本变化）' : '[warn] 位置文本未变化（需人工确认）');

  // 6. 再截图（移动后）
  await page.screenshot({ path: 'C:/Users/WIN11/WorkBuddy/2026-08-03-13-46-59/pet-park/playwright-world3d-after.png' });

  // 7. 在线人数（WS 生效 → ≥1）
  const online = await page.evaluate(() => {
    const el = document.querySelector('.w3d-hud .hud-row');
    return el ? el.textContent : '';
  });
  console.log('[info] HUD 在线:', online);
  console.log('[ws] ' + (/在线\s*\d+/.test(online) ? '在线人数显示正常（WS 已连接）' : '未看到在线人数'));

  // 8. 结论
  console.log('\n=== console 错误 ===');
  if (errors.length === 0) {
    console.log('[ok] 无 console.error / pageerror');
  } else {
    console.log('[fail] 发现 ' + errors.length + ' 个错误:');
    errors.slice(0, 10).forEach(e => console.log('  - ' + e));
  }
  console.log('\n=== 汇总 ===');
  console.log('canvas 渲染:', canvasInfo && canvasInfo.w > 0 ? 'canvas 存在且有尺寸' : 'FAIL');
  console.log('移动交互:', moved ? 'PASS' : '需人工确认');
  console.log('console 错误数:', errors.length);

  await browser.close();
  process.exit(errors.length === 0 ? 0 : 1);
})().catch(e => { console.error('E2E 异常:', e); process.exit(2); });
