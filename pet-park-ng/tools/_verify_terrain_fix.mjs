import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'fs';

const URL = 'http://localhost:4200';
const CHROME = 'C:/Users/ken/.agent-browser/browsers/chrome-151.0.7922.76/chrome.exe';
const OUT = '_terrain_fix_verify';

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
    await page.waitForTimeout(12000);
  }

  // Dismiss guide dialog if present
  const nextBtn = page.locator('text=下一步');
  for (let i = 0; i < 5; i++) {
    if (await nextBtn.count() > 0) { await nextBtn.first().click(); await page.waitForTimeout(500); }
    else break;
  }
  const closeBtn = page.locator('text=跳过, text=关闭');
  if (await closeBtn.count() > 0) await closeBtn.first().click();

  // Force daytime
  await page.evaluate(() => {
    var canvas = document.querySelector('canvas');
    if (canvas && canvas.parentElement) {
      window['__canvas'] = canvas;
    }
  });
  await page.waitForTimeout(1000);

  if (!existsSync(OUT)) mkdirSync(OUT);

  // Try to access scene via the canvas's __ngContext__ or similar
  const sceneInfo = await page.evaluate(() => {
    var canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'no canvas' };

    // Search all objects in window for anything with a "scene" property
    var keys = Object.keys(window).filter(function(k) {
      try {
        var v = window[k];
        return v && typeof v === 'object' && v.scene && v.scene.isScene;
      } catch(e) { return false; }
    });

    // Also try common Angular patterns
    var ngKeys = Object.keys(window).filter(function(k) {
      return k.indexOf('ng') >= 0 || k.indexOf('angular') >= 0;
    });

    return { hasCanvas: !!canvas, keys: keys.slice(0, 10), ngKeys: ngKeys.slice(0, 10) };
  });
  console.log('Scene info:', JSON.stringify(sceneInfo));

  // Screenshot 1: default view (after entering world)
  console.log('=== Screenshot 1: Default view ===');
  await page.screenshot({ path: OUT + '/01_default.png' });

  // Screenshot 2: Use keyboard to rotate camera (WASD/arrow keys)
  console.log('=== Screenshot 2: After key input ===');
  await page.keyboard.press('d'); // look right
  await page.waitForTimeout(500);
  await page.keyboard.press('s'); // look down  
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + '/02_look_right_down.png' });

  // Screenshot 3: Move toward water (check minimap for water location)
  console.log('=== Screenshot 3: Walk toward water ===');
  // Press W to move forward several times
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('w');
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: OUT + '/03_walk_forward.png' });

  // Screenshot 4: Check from high angle
  console.log('=== Screenshot 4: High angle ===');
  // Try mouse drag to change view
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(640, 200, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + '/04_high_angle.png' });

  // Final: analyze canvas pixels for dark spots (black holes)
  console.log('=== 5. Pixel analysis ===');
  const pixelData = await page.evaluate(() => {
    var canvas = document.querySelector('canvas');
    if (!canvas) return null;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    var w = canvas.width, h = canvas.height;
    var imgData = ctx.getImageData(0, 0, w, h).data;
    let darkPixels = 0, totalPixels = w * h;
    let bluePixels = 0; // water-colored
    let greenPixels = 0; // land-colored
    for (var i = 0; i < imgData.length; i += 4) {
      var r = imgData[i], g = imgData[i+1], b = imgData[i+2];
      var brightness = (r + g + b) / 3;
      if (brightness < 30) darkPixels++;       // near-black
      if (b > 150 && g < 120 && r < 120) bluePixels++;  // blue-ish (water)
      if (g > 140 && b < 130 && r > 100) greenPixels++; // green-ish (land)
    }
    return {
      total: totalPixels,
      darkPct: ((darkPixels / totalPixels) * 100).toFixed(2) + '%',
      bluePct: ((bluePixels / totalPixels) * 100).toFixed(2) + '%',
      greenPct: ((greenPixels / totalPixels) * 100).toFixed(2) + '%',
      darkCount: darkPixels
    };
  });
  console.log('Pixel analysis:', JSON.stringify(pixelData));

  console.log('=== Done ===');
  await browser.close();

  // Verdict
  var darkPct = parseFloat(pixelData.darkPct || '0');
  if (darkPct < 0.5) {
    console.log('\n✅ PASS: No significant dark holes detected (' + pixelData.darkPct + ')');
  } else {
    console.log('\n⚠️ WARN: Dark pixels detected (' + pixelData.darkPct + ') - may have remaining holes');
  }
}

main().catch(function(e) { console.error('ERR', e.message); process.exit(1); });
