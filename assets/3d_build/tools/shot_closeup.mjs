// 近距 3/4 视角截图，确认动物真实形状（绕过 Read 去重：内容不同）
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const PW_PATH = 'C:/Users/WIN11/.workbuddy/binaries/node/workspace/node_modules/playwright';
const { chromium } = require(PW_PATH);

const BASE = process.argv[2] || 'http://127.0.0.1:8099/demo_animals_skel.html';
const OUT = process.argv[3] || '.';
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => {
  const a = window.__animals;
  return a && a.cat && a.cat.skinned && a.fish && a.fish.skinned;
}, { timeout: 60000 }).catch(() => {});

// 给每个动物换近距机位
async function shot(name, label) {
  await page.click(`#topbar [data-animal="${name}"]`);
  await page.waitForTimeout(400);
  // 通过页面暴露的相机重置 + 拉近
  await page.evaluate((nm) => {
    const app = window.__three;
    if (app && app.camera) {
      // 拉近并摆 3/4 视角
      app.camera.position.set(0.9, 0.7, 1.6);
      app.camera.lookAt(0, 0, 0);
      app.camera.updateProjectionMatrix();
    }
  }, name);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/close_${name}.png` });
  console.log('shot:', `${OUT}/close_${name}.png`);
}

for (const n of ['cat','dog','fish']) await shot(n);
await browser.close();
console.log('DONE');
