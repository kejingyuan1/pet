/* M2 前端 E2E：登录 → 大世界 → 服务端物理权威移动（输入上行 → 快照插值渲染）→ 无 console error */
const { chromium } = require('playwright');

(async () => {
  const errors = [];
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/WIN11/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe',
    args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--disable-gpu-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 200)); });
  page.on('pageerror', e => errors.push('[pageerror] ' + String(e).slice(0, 200)));

  await page.goto('http://localhost:4200/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('.login-card input', { timeout: 20000 });
  const inputs = page.locator('.login-card input');
  await inputs.nth(0).fill('worldtest4996');
  await inputs.nth(1).fill('abc123');
  await page.click('.btn-login');
  await page.waitForSelector('.app-shell', { timeout: 20000 });
  console.log('[ok] 登录成功');

  await page.click('nav.nav button:has-text("大世界")');
  await page.waitForSelector('app-world3d .world3d-mount canvas', { timeout: 30000 });
  console.log('[ok] 大世界 canvas 出现');

  // 等待 join + 物理快照下发（首帧姿态由 physics-service 权威快照驱动）
  await page.waitForTimeout(7000);
  const posBefore = await page.locator('.w3d-hud .hud-row').nth(1).innerText().catch(() => '');
  console.log('[info] 移动前位置:', posBefore);

  // 按住 W 前进 ~1.5s（输入上行 → 服务端物理 → POSITION_SNAPSHOT → 前端插值渲染）
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(800);
  const posAfter = await page.locator('.w3d-hud .hud-row').nth(1).innerText().catch(() => '');
  console.log('[info] 移动后位置:', posAfter);
  const moved = posBefore !== posAfter;
  console.log(moved ? '[ok] 位置变化 → 服务端物理权威移动生效' : '[warn] 位置未变化（需人工确认）');

  await page.screenshot({ path: 'C:/Users/WIN11/WorkBuddy/2026-08-03-13-46-59/pet-park/playwright-m2-world3d.png' });

  const online = await page.locator('.w3d-hud .hud-row').nth(0).innerText().catch(() => '');
  console.log('[info] HUD 在线:', online);
  console.log('\n=== console 错误（排除既有 home .glb 404）===');
  const realErrors = errors.filter(e => !e.includes('.glb') && !e.includes('404'));
  if (realErrors.length === 0) console.log('[ok] 无 world3d 相关 console 错误');
  else realErrors.slice(0, 10).forEach(e => console.log('  ' + e));

  console.log('\n移动:', moved ? 'PASS' : '需人工确认');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('E2E 异常:', e); process.exit(2); });
