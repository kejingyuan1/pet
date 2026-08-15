import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

const URL = 'http://localhost:4200';
const CHROME = 'C:/Users/ken/.agent-browser/browsers/chrome-151.0.7922.76/chrome.exe';
const OUT = '_verify_no_blue_tris';

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  console.log('=== 1. Login ===');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[placeholder="用户名"]', 'kjy');
  await page.fill('input[placeholder*="密码"]', 'abc123');
  await page.click('.btn-login');
  await page.waitForTimeout(3000);

  console.log('=== 2. Enter World ===');
  const enterBtn = page.locator('text=进入大世界');
  if (await enterBtn.count() > 0) {
    await enterBtn.first().click();
    console.log('Clicked enter world');
    await page.waitForTimeout(15000); // 等地形加载
  }

  // Dismiss guide dialog if present
  for (const txt of ['下一步', '知道了', '关闭']) {
    const btn = page.locator(`text=${txt}`);
    for (let i = 0; i < 3; i++) {
      if (await btn.count() > 0) { await btn.first().click(); await page.waitForTimeout(500); }
      else break;
    }
  }
  const skipBtn = page.locator('text=跳过');
  if (await skipBtn.count() > 0) await skipBtn.first().click();

  // Force daytime for clear visibility
  await page.waitForTimeout(2000);

  if (!existsSync(OUT)) mkdirSync(OUT);

  // === Screenshot 1: Default view ===
  const shot1 = `${OUT}/01_default_view.png`;
  await page.screenshot({ path: shot1, fullPage: false });
  console.log(`Screenshot 1: ${shot1}`);

  // === Screenshot 2: Rotate camera to see terrain slopes ===
  // Use keyboard to rotate camera or access Three.js camera
  await page.evaluate(() => {
    // Try to find the world3d component's camera and reposition
    var canvas = document.querySelector('canvas');
    if (canvas) {
      // Dispatch key events to trigger camera movement
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW' }));
    }
  });
  await page.waitForTimeout(100);

  // Hold W key for a few seconds to move forward (change view angle)
  await page.keyboard.down('w');
  await page.waitForTimeout(3000);
  await page.keyboard.up('w');

  const shot2 = `${OUT}/02_after_move.png`;
  await page.screenshot({ path: shot2, fullPage: false });
  console.log(`Screenshot 2: ${shot2}`);

  // === Screenshot 3: Look downward at terrain ===
  await page.keyboard.down('s');
  await page.waitForTimeout(2000);
  await page.keyboard.up('s');

  const shot3 = `${OUT}/03_look_terrain.png`;
  await page.screenshot({ path: shot3, fullPage: false });
  console.log(`Screenshot 3: ${shot3}`);

  // === Visual analysis: check for bright blue fragments ===
  const analysis = await page.evaluate(() => {
    var canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'no canvas' };
    var ctx = canvas.getContext('2d') || canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!ctx || !ctx.readPixels) return { error: 'cannot read pixels - WebGL context' };

    // For WebGL we need preserveDrawingBuffer - try screenshot approach instead
    return { note: 'will analyze via screenshot image' };
  });

  console.log('Analysis:', analysis);

  // === Screenshot 4: Zoom out for wide view ===
  // Scroll to zoom out
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(1500);

  const shot4 = `${OUT}/04_zoomed_out.png`;
  await page.screenshot({ path: shot4, fullPage: false });
  console.log(`Screenshot 4: ${shot4}`);

  await browser.close();
  console.log('\nDone! Check screenshots in', OUT);
  console.log('Expected: NO bright blue triangular fragments scattered on terrain.');
  console.log('Water areas should be dark blue (0x2f7fd6) as part of terrain mesh, not bright cyan overlay.');
}

main().catch(e => { console.error(e); process.exit(1); });
