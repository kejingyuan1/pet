import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const CHROME = 'C:/Users/ken/.agent-browser/browsers/chrome-151.0.7922.76/chrome.exe';
const URL = 'http://localhost:4200';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '_verify_hidden_chunks');

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: false });
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
  
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text().slice(0, 200)); });

  console.log('1. Opening page...');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });

  // Login
  console.log('2. Logging in...');
  await page.fill('input[placeholder*="用户名"]', 'kjy');
  await page.fill('input[placeholder*="密码"]', 'abc123');
  await page.click('.btn-login');
  await page.waitForTimeout(4000);

  // Enter world
  console.log('3. Entering world...');
  const enterBtn = page.locator('button:has-text("进入大世界")');
  if (await enterBtn.count() > 0) {
    await enterBtn.first().click();
    await page.waitForTimeout(12000);
  }

  // Close tutorial/dialog if present
  console.log('4. Closing any dialogs...');
  await page.evaluate(() => {
    // Close any modal/dialog overlays
    document.querySelectorAll('.ant-modal-wrap, .modal-overlay, [class*="dialog"], [class*="tutorial"]').forEach(el => {
      (el).style.display = 'none';
    });
    // Click "下一步" or "跳过" or close button if exists
    const btns = document.querySelectorAll('button');
    for (const b of Array.from(btns)) {
      const t = b.textContent?.trim() || '';
      if (t === '跳过' || t === '关闭' || t === '取消' || t === '下一步' || t === '知道了') {
        b.click(); break;
      }
    }
  });
  await page.waitForTimeout(2000);

  // Screenshot 1: Default view
  console.log('5. Screenshot default view...');
  await page.screenshot({ path: join(OUT, '01_default.png'), fullPage: false });

  // Check debug state (correct paths)
  console.log('6. Checking debug state...');
  const dbg = await page.evaluate(() => {
    const d = window.__worldDebug;
    if (!d) return { error: '__worldDebug not found' };
    return {
      hy3dLoaded: d.hy3dTerrain?.loaded,
      hy3dIslands: d.hy3dTerrain?.islands,
      hy3dCenters: d.hy3dTerrain?.centers,
      chunkMeshCount: d.terrain?.chunkMeshCount,
      waterPlane: d.waterPlane,
      childCount: d.scene?.childCount,
      // Check if chunk meshes are hidden
      chunkSamples: (d.terrain?.samples || []).map((s) => ({
        key: s.key,
        visible: s.visible,
        worldVisible: s.worldVisible
      }))
    };
  });
  console.log('Debug:', JSON.stringify(dbg, null, 2));

  // Move camera to water view
  console.log('7. Water view...');
  await page.evaluate(() => {
    const dbg = window.__worldDebug;
    if (dbg?.camera?.position) {
      const c = dbg.camera.position;
      // Can't use Three.js .set(), so we'll set via internal ref
    }
  });
  // Use keyboard to move camera instead
  await page.keyboard.press('s'); // move back
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, '02_water_view.png'), fullPage: false });

  // Zoom out (scroll)
  console.log('8. Zoomed out view...');
  await page.mouse.wheel(0, -800); // scroll up to zoom out
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, '03_zoomed_out.png'), fullPage: false });

  // Rotate view
  console.log('9. Another angle...');
  await page.mouse.wheel(800, 0); // pan right
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, '04_angle.png'), fullPage: false });

  // Summary
  console.log('\n=== VERIFICATION SUMMARY ===');
  console.log(`HY3D loaded: ${dbg.hy3dLoaded ?? 'N/A'}`);
  console.log(`HY3D islands: ${dbg.hy3dIslands ?? 'N/A'}`);
  console.log(`Chunk meshes (total): ${dbg.chunkMeshCount ?? 'N/A'}`);
  console.log(`Chunk samples (visible?): ${JSON.stringify(dbg.chunkSamples?.slice(0, 3))}`);
  console.log(`Water plane: ${dbg.waterPlane ?? 'N/A'}`);
  console.log(`Console errors: ${errors.length}`);

  await browser.close();
}

main().catch(e => { console.error('FAIL:', e); process.exit(1); });
