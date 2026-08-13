import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/WIN11/.workbuddy/binaries/node/workspace/node_modules/playwright');

const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=swiftshader'] });
const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
const msgs = [];
p.on('console', m => msgs.push(`[${m.type()}] ${m.text()}`));
p.on('pageerror', e => msgs.push('PAGEERROR: ' + e.message));
p.on('requestfailed', r => msgs.push('REQFAIL: ' + r.url() + ' :: ' + (r.failure()?.errorText)));
p.on('response', r => { if (r.url().includes('.glb')) msgs.push('RESP: ' + r.status() + ' ' + r.url()); });

await p.goto('http://127.0.0.1:8099/demo_animals_vshader.html', { waitUntil: 'load', timeout: 60000 });
await p.waitForTimeout(6000);
const status = await p.evaluate(() => document.getElementById('status')?.textContent);
const hasModels = await p.evaluate(() => !!(window.__models && window.__models.cat));
console.log('STATUS:', status);
console.log('HAS_MODELS:', hasModels);
console.log('--- console/network ---');
console.log(msgs.join('\n'));
await b.close();
