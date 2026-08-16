import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

const URL = 'http://localhost:4200';
const CHROME = 'C:/Users/ken/.agent-browser/browsers/chrome-151.0.7922.76/chrome.exe';
const OUT = '_verify_diag';

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  const warns = [];
  page.on('console', msg => {
    const t = msg.text();
    if (msg.type() === 'error') errors.push(t);
    else if (msg.type() === 'warning' || (msg.type() === 'log' && /WATER|water|落水|hy3d/i.test(t))) warns.push(t);
  });
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
    console.log('Clicked enter world, waiting 25s for HY3D load...');
    await page.waitForTimeout(25000); // 足够 4 个 draco GLB 异步加载
  }

  // Dismiss guide
  for (const txt of ['下一步', '知道了', '关闭', '跳过']) {
    const btn = page.locator(`text=${txt}`);
    for (let i = 0; i < 3; i++) {
      if (await btn.count() > 0) { await btn.first().click(); await page.waitForTimeout(400); }
      else break;
    }
  }

  // 读取完整调试数据
  const dbg = await page.evaluate(() => {
    const d = window.__worldDebug;
    if (!d) return { error: '__worldDebug not set' };
    return {
      hy3dTerrain: d.hy3dTerrain,
      chunkMeshCount: d.terrain?.chunkMeshCount,
      playerPos: d.player,
      sceneChildren: d.scene?.childCount,
    };
  });
  console.log('\n=== worldDebug ===');
  console.log(JSON.stringify(dbg, null, 2));

  // 检查 HY3D group 是否在 scene 中
  const hy3dInfo = await page.evaluate(() => {
    const scene = window.__worldDebug?._scene;
    if (!scene) return { error: 'no scene ref' };
    const hy3d = scene.children.find(c => c.name === 'hy3d_terrain');
    if (!hy3d) return { found: false, children: scene.children.map(c => ({ name: c.name, type: c.type, visible: c.visible })) };
    return {
      found: true,
      childCount: hy3d.children.length,
      visible: hy3d.visible,
      worldPos: hy3d.position,
      first3Kids: hy3d.children.slice(0, 3).map(c => ({
        name: c.name, pos: c.position, scale: c.scale, visible: c.visible
      }))
    };
  });
  console.log('\n=== hy3dGroup in scene ===');
  console.log(JSON.stringify(hy3dInfo, null, 2));

  // 截图
  if (!existsSync(OUT)) mkdirSync(OUT);
  await page.screenshot({ path: `${OUT}/01_default.png`, fullPage: false });

  // 摄像机拉远看全局
  await page.evaluate(() => {
    const d = window.__worldDebug;
    if (d?.camera) {
      d.camera.position.set(0, 500, 0);
      d.camera.lookAt(0, 0, 0);
    }
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/02_topdown.png`, fullPage: false });

  // 控制台汇总
  console.log('\n=== Errors (' + errors.length + ') ===');
  errors.slice(0, 15).forEach(e => console.log('  ERR:', e));
  console.log('\n=== Water/HY3D Warnings (' + warns.length + ') ===');
  warns.slice(0, 20).forEach(w => console.log('  WARN:', w));
  // 去重后显示唯一警告类型
  const uniqueWarns = [...new Set(warns)];
  console.log('\nUnique warning types:', uniqueWarns.length);
  uniqueWarns.slice(0, 10).forEach(w => console.log('  -', w.substring(0, 120)));

  writeFileSync(`${OUT}/diag.json`, JSON.stringify({ dbg, hy3dInfo, errorCount: errors.length, warnCount: warns.length, uniqueWarnings: uniqueWarns.slice(0, 30) }, null, 2));
  console.log('\nDiag saved to', OUT + '/diag.json');

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
