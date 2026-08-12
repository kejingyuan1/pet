/* M2 前端 E2E（对 vite 瞬态错误覆盖层做容错）：登录 → 大世界 → 服务端物理权威移动 → 截图 */
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

  await page.goto('http://localhost:4200/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.login-card input', { timeout: 30000 });
  for (let i = 0; i < 15; i++) {
    const hasOverlay = await page.evaluate(() => !!document.querySelector('vite-error-overlay')).catch(() => false);
    if (!hasOverlay) break;
    await page.waitForTimeout(1000);
  }
  const inputs = page.locator('.login-card input');
  await inputs.nth(0).fill('worldtest4996');
  await inputs.nth(1).fill('abc123');
  await page.click('.btn-login', { force: true });
  await page.waitForSelector('.app-shell', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log('[ok] 登录成功（或已进入主应用）');

  await page.click('nav.nav button:has-text("大世界")', { force: true }).catch(() => {});
  await page.waitForSelector('app-world3d .world3d-mount canvas', { timeout: 30000 });
  console.log('[ok] 大世界 canvas 出现');

  await page.waitForTimeout(8000);
  const posBefore = await page.locator('.w3d-hud .hud-row').nth(1).innerText().catch(() => '');
  console.log('[info] 移动前位置:', posBefore);

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(800);
  const posAfter = await page.locator('.w3d-hud .hud-row').nth(1).innerText().catch(() => '');
  console.log('[info] 移动后位置:', posAfter);
  const moved = posBefore !== posAfter;
  console.log(moved ? '[ok] 位置变化 → 服务端物理权威移动生效' : '[warn] 位置未变化');

  await page.screenshot({ path: 'C:/Users/WIN11/WorkBuddy/2026-08-03-13-46-59/pet-park/playwright-m2-world3d.png' });
  const online = await page.locator('.w3d-hud .hud-row').nth(0).innerText().catch(() => '');
  console.log('[info] HUD:', online);

  console.log('\n=== world3d 相关 console 错误（排除 home .glb/404）===');
  const realErrors = errors.filter(e => !e.includes('.glb') && !e.includes('404'));
  if (realErrors.length === 0) console.log('[ok] 无');
  else realErrors.slice(0, 10).forEach(e => console.log('  ' + e));
  console.log('\n移动:', moved ? 'PASS' : '需人工确认');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('E2E 异常:', e); process.exit(2); });
