/* QA 诊断：定位 e2e 中 10 个 404 的具体 URL */
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/WIN11/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe',
    args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--disable-gpu-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const notFound = [];
  page.on('response', r => { if (r.status() === 404) notFound.push(r.url()); });
  page.on('console', msg => { if (msg.type() === 'error') console.log('[console.error]', msg.text().slice(0, 200)); });

  await page.goto('http://localhost:4200/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('.login-card input', { timeout: 20000 });
  const inputs = page.locator('.login-card input');
  await inputs.nth(0).fill('worldtest4996');
  await inputs.nth(1).fill('abc123');
  await page.click('.btn-login');
  await page.waitForSelector('.app-shell', { timeout: 20000 });
  await page.click('nav.nav button:has-text("大世界")');
  await page.waitForSelector('app-world3d .world3d-mount canvas', { timeout: 30000 });
  await page.waitForTimeout(6000);

  console.log('\n=== 404 URL 列表 ===');
  const uniq = [...new Set(notFound)];
  uniq.forEach(u => console.log('404: ' + u));
  console.log('404 总数=' + notFound.length + ' 唯一=' + uniq.length);
  await browser.close();
})();
