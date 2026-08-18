// 星空 + 水面 GPU 截图验证（尝试使用真实 GPU 渲染夜间场景）
const { chromium } = require('C:/Users/ken/.workbuddy/binaries/node/workspace/node_modules/playwright-core');
const BASE = 'http://127.0.0.1:4200';
const OUT = 'D:/pet/tools/stars_water';
require('fs').mkdirSync(OUT, { recursive: true });

const log = (m) => process.stderr.write('[STEP] ' + m + '\n');
(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--ignore-gpu-blocklist',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows'
    ]
  });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { window.__worldDebugEnabled = true; });
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') log('CONSOLE_ERROR: ' + m.text().slice(0, 200)); });
  p.on('pageerror', e => log('PAGE_ERROR: ' + e.message.slice(0, 200)));

  await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.evaluate(() => { try { window.sessionStorage.setItem('forceSpawnIsland', '0'); } catch (e) {} });
  await p.waitForSelector('input[placeholder="用户名"]', { timeout: 10000 });
  await p.fill('input[placeholder="用户名"]', 'kejingyuan');
  await p.fill('input[type="password"]', 'abc123');
  await p.click('button.btn-login');
  await p.waitForSelector('text=进入大世界', { timeout: 15000 });
  await p.click('text=进入大世界');
  await p.waitForTimeout(10000);

  // 强制夜晚
  await p.evaluate(() => { if (window.__forcePhase) window.__forcePhase(0); });
  await p.waitForTimeout(5000);

  const starDiag = await p.evaluate(() => window.__starDiag ? window.__starDiag() : null);
  log('starDiag=' + JSON.stringify(starDiag));

  await p.screenshot({ path: OUT + '/overview_night_gpu.png', timeout: 120000 });
  log('screenshot done');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
