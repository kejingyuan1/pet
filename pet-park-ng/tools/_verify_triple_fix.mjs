import { chromium } from 'playwright-core';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHROME = 'C:/Users/ken/.agent-browser/browsers/chrome-151.0.7922.76/chrome.exe';
const URL = 'http://localhost:4200';
const OUT = path.join(__dirname, '_verify_triple_fix');

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(20000);

  // Collect console errors
  const waterWarnings = [];
  page.on('console', msg => {
    if (msg.type() === 'warning' || msg.type() === 'error') {
      const t = msg.text();
      if (/WATER|water|落水/i.test(t)) waterWarnings.push(t);
    }
  });

  console.log('1. Opening page & logging in...');
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.fill('input[placeholder="用户名"]', 'kjy');
  await page.fill('input[placeholder*="密码"]', 'abc123');
  await page.click('.btn-login');
  await page.waitForTimeout(3000);

  // Enter world
  console.log('2. Entering world...');
  const enterBtn = page.locator('text=进入大世界');
  if (await enterBtn.count() > 0) {
    await enterBtn.first().click();
    console.log('   Clicked enter, waiting 20s for terrain + HY3D + water...');
    await page.waitForTimeout(20000);
  }

  // Dismiss guide dialogs
  for (const txt of ['下一步', '知道了', '关闭', '跳过']) {
    const btn = page.locator(`text=${txt}`);
    for (let i = 0; i < 3; i++) {
      if (await btn.count() > 0) { await btn.first().click(); await page.waitForTimeout(400); }
      else break;
    }
  }

  // Read debug info
  console.log('3. Reading debug info...');
  const dbg = await page.evaluate(() => {
    const d = window.__worldDebug;
    if (!d) return { error: '__worldDebug not set' };
    return {
      hy3dTerrain: d.hy3dTerrain,
      chunkMeshCount: d.terrain?.chunkMeshCount,
      waterPlane: d.waterPlane,
      camera: d.camera,
    };
  });
  console.log('   Debug:', JSON.stringify(dbg));

  // Screenshot 1: Default view
  console.log('4. Screenshot default...');
  await page.screenshot({ path: path.join(OUT, '01_default.png'), fullPage: false });

  // Screenshot 2: Move camera toward water
  console.log('5. Water view...');
  await page.evaluate(() => {
    const cam = window.__worldDebug?.camera;
    if (cam) {
      cam.position.x += 200;
      cam.position.z += 150;
      cam.position.y += 15;
    }
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT, '02_water_view.png'), fullPage: false });

  // Screenshot 3: Zoomed out
  console.log('6. Zoomed out...');
  await page.evaluate(() => {
    const cam = window.__worldDebug?.camera;
    if (cam) {
      cam.position.y += 60;
      cam.position.z += 40;
    }
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT, '03_zoomed_out.png'), fullPage: false });

  // Summary
  console.log('\n=== VERIFICATION SUMMARY ===');
  console.log(`HY3D islands: ${dbg.hy3dTerrain?.islands ?? 'N/A'} / ${dbg.hy3dTerrain?.centers ?? 'N/A'} centers`);
  console.log(`Chunk meshes: ${dbg.chunkMeshCount ?? 'N/A'}`);
  console.log(`Water plane: ${dbg.waterPlane ? 'YES' : 'NO'}`);
  console.log(`Water warnings: ${waterWarnings.length}`);

  await browser.close();
  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
