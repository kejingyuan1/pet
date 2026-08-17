import { chromium } from 'playwright-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:4200';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true,
    args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const logs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => logs.push(`[PAGEERR] ${e}`));
  page.on('requestfailed', r => logs.push(`[REQFAIL] ${r.url()} ${r.failure()?.errorText}`));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  const info = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    hasCanvas: !!document.querySelector('canvas'),
    bodyText: document.body.innerText.slice(0, 500),
    hasWorldDebug: !!window.__worldDebug,
  }));
  console.log('INFO:', JSON.stringify(info, null, 2));
  console.log('--- console (last 40) ---');
  console.log(logs.slice(-40).join('\n'));
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
