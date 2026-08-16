import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'fs';

const URL = 'http://localhost:4200';
const CHROME = 'C:/Users/ken/.agent-browser/browsers/chrome-151.0.7922.76/chrome.exe';
const OUT = '_verify_hy3d_terrain';

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));

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
    await page.waitForTimeout(20000); // 等 HY3D 岛屿异步加载（4×5MB + draco 解码）
  }

  // Dismiss guide
  for (const txt of ['下一步', '知道了', '关闭', '跳过']) {
    const btn = page.locator(`text=${txt}`);
    for (let i = 0; i < 3; i++) {
      if (await btn.count() > 0) { await btn.first().click(); await page.waitForTimeout(400); }
      else break;
    }
  }

  // 读取调试数据
  const dbg = await page.evaluate(() => {
    const d = window.__worldDebug;
    return d ? {
      hy3dLoaded: d.hy3dTerrain?.loaded,
      hy3dIslands: d.hy3dTerrain?.islands,
      hy3dCenters: d.hy3dTerrain?.centers,
      sceneChildren: d.hy3dTerrain?.childCount,
      chunkMeshCount: d.terrain?.chunkMeshCount,
    } : null;
  });
  console.log('worldDebug:', JSON.stringify(dbg));

  await page.waitForTimeout(1000);
  if (!existsSync(OUT)) mkdirSync(OUT);
  await page.screenshot({ path: `${OUT}/01_world.png`, fullPage: false });
  console.log('Screenshot saved');

  console.log('Console errors (' + errors.length + '):');
  errors.slice(0, 20).forEach(e => console.log('  -', e));

  // 断言
  const ok = dbg && dbg.hy3dLoaded === true && dbg.hy3dIslands >= 20 && errors.length === 0;
  console.log('\nVERIFY:', ok ? 'PASS ✅' : 'FAIL ❌');

  await browser.close();
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
