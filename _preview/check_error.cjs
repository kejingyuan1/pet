const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:4200';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [], overlay = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERR ' + String(e)));
  await page.goto(BASE + '/?debug=1', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(4000);
  // 抓取 vite 错误遮罩文本
  const ov = await page.evaluate(() => {
    const el = document.querySelector('vite-error-overlay');
    if (!el) return null;
    return el.shadowRoot ? el.shadowRoot.textContent : el.textContent;
  });
  console.log('=== vite-error-overlay ===');
  console.log(ov ? ov.slice(0, 1500) : '无遮罩');
  console.log('=== console/page errors ===');
  console.log(errs.slice(0, 15).join('\n'));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
