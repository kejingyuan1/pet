import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const PW_PATH = 'C:/Users/WIN11/.workbuddy/binaries/node/workspace/node_modules/playwright';
const { chromium } = require(PW_PATH);

const URL = process.argv[2] || 'http://localhost:8099/demo_animals_skel.html';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on('console', m => console.log('[console.'+m.type()+']', m.text()));
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('requestfailed', r => console.log('[reqfail]', r.url(), r.failure() && r.failure().errorText));
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(6000);
const state = await page.evaluate(() => {
  return {
    hasAnimals: !!window.__animals,
    animals: window.__animals ? Object.keys(window.__animals) : [],
    statusText: document.getElementById('status') ? document.getElementById('status').textContent : 'NO STATUS EL',
    bodyHTML: document.body.innerHTML.slice(0, 200),
  };
});
console.log('STATE:', JSON.stringify(state, null, 2));
await browser.close();
