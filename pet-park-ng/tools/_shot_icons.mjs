import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PW = require('C:/Users/ken/node_modules/playwright-core');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS = resolve(__dirname, '../public/assets/icons');
const TMP = resolve(__dirname, '_icon_tmp');
require('node:fs').mkdirSync(TMP, { recursive: true });

const items = [
  ['ore_coal', '煤矿'],
  ['ore_iron', '铁矿'],
  ['ore_gold', '金矿'],
  ['minnow', '小鱼'],
  ['goldfish', '金鱼'],
  ['koi', '锦鲤'],
  ['dragon', '龙鱼'],
  ['wood', '木材'],
  ['berry', '野果'],
  ['egg_chicken', '鸡蛋'],
  ['egg_duck', '鸭蛋'],
  ['egg_goose', '鹅蛋'],
  ['milk', '牛奶'],
];

const cells = items.map(([code, label]) => `
  <div class="cell">
    <img src="file:///${ICONS.replace(/\\/g, '/')}/${code}.svg" />
    <div class="lbl">${label}<br><span class="code">${code}</span></div>
  </div>`).join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin:0; background:#1b2330; color:#eee; font-family:system-ui,sans-serif; padding:18px; }
  .grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; max-width:680px; }
  .cell { background:#26303f; border-radius:10px; padding:12px; text-align:center; }
  .cell img { width:64px; height:64px; image-rendering:pixelated; display:block; margin:0 auto 8px; }
  .lbl { font-size:13px; line-height:1.4; }
  .code { color:#7fa8c9; font-size:11px; }
</style></head><body>
  <h3>背包像素图标预览（13 项）</h3>
  <div class="grid">${cells}</div>
</body></html>`;

const galleryHtml = resolve(TMP, 'gallery.html');
writeFileSync(galleryHtml, html, 'utf8');
const out = resolve(TMP, 'gallery.png');

const chrome = 'C:/Users/ken/.agent-browser/browsers/chrome-151.0.7922.76/chrome.exe';
const browser = await PW.chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 720, height: 360 } });
await page.goto('file:///' + galleryHtml.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('SHOT', out);
