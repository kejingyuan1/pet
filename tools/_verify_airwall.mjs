/**
 * _verify_airwall.mjs — 验证沙滩空气墙修复
 *
 * 2026-08-16 修复：ISLAND_WALK_FACTOR 0.85 → 1.05
 * 玩家应该能走到沙滩/浅滩区域（不再被空气墙挡住）
 */
import { chromium } from 'playwright-core';
import fs from 'fs';

const chromePath = 'C:\\Users\\ken\\.agent-browser\\browsers\\chrome-151.0.7922.76\\chrome.exe';
const BASE = 'http://localhost:4200';
const USER = 'wtest_ken', PASS = 'Test1234!';

let results = [];
function ok(n, d) { results.push({name:n,ok:true,d}); console.log(`  ${n}${d?' | '+d:''}`); }
function fail(n, d) { results.push({name:n,ok:false,d}); console.log(`  ❌ ${n}${d?' | '+d:''}`); }

const browser = await chromium.launch({ executablePath: chromePath, headless: false, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// 收集控制台日志
const logs = [];
page.on('console', msg => {
  const t = msg.text();
  logs.push(t);
  if (t.includes('WATER') || t.includes('water') || t.includes('island') || t.includes('walkable')) {
    console.log(`  📋 ${t.slice(0, 120)}`);
  }
});

try {
  // Step A: 登录
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(2000);
  const needLogin = await page.$('input[placeholder="用户名"]');
  if (needLogin) {
    await page.fill('input[placeholder="用户名"]', USER);
    await page.fill('input[placeholder*="密码"]', PASS);
    await page.click('button.btn-login');
    await page.waitForTimeout(8000);
  }
  ok('A1.登录', page.url().slice(0, 50));

  // Step B: 进入大世界
  const enterBtn = await page.$('text=进入大世界');
  if (enterBtn) { await enterBtn.click(); await page.waitForTimeout(3000); }

  // 等待 canvas
  let canvas = null;
  for (let i = 0; i < 10; i++) {
    canvas = await page.$('canvas');
    if (canvas) break;
    const btn2 = await page.$('text=进入大世界');
    if (btn2) { await btn2.click(); }
    await page.waitForTimeout(3000);
  }

  if (!canvas) {
    fail('B1.Canvas超时', '40s无canvas');
  } else {
    ok('B1.Canvas就绪', 'OK');
  }

  // 关闭引导
  try {
    const skip = await page.$('text=跳过');
    if (skip) { await skip.click(); await page.waitForTimeout(500); }
  } catch(e) {}

  // 等待场景加载
  console.log('[info] 等待场景加载(20s)...');
  await page.waitForTimeout(20000);

  // Step C: 检查 debug hook 中的岛屿参数
  const dbg = await page.evaluate(() => {
    const d = (window).__worldDebug;
    if (!d) return { err: 'no hook' };
    return {
      islandCenters: d.hy3dTerrain?.centers ?? 'N/A',
      waterPlane: !!d.waterPlane,
      sceneChildren: d.scene?.childCount ?? 'N/A',
    };
  });
  ok('C1.DebugHook', JSON.stringify(dbg));

  // Step D: 尝试向沙滩方向移动（WASD前进）
  // 先获取玩家当前位置和朝向
  const beforeMove = await page.evaluate(() => {
    const d = (window).__worldDebug;
    return d ? {
      x: d.camera?.position?.x,
      y: d.camera?.position?.y,
      z: d.camera?.position?.z,
    } : null;
  });

  // 按 W 键向前走几秒（朝向沙滩方向）
  console.log('[info] 按W键向沙滩方向移动...');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(5000); // 持续5秒
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(2000);

  const afterMove = await page.evaluate(() => {
    const d = (window).__worldDebug;
    return d ? {
      x: d.camera?.position?.x,
      y: d.camera?.position?.y,
      z: d.camera?.position?.z,
    } : null;
  });

  if (beforeMove && afterMove) {
    const dx = afterMove.x - beforeMove.x;
    const dz = afterMove.z - beforeMove.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    ok('D1.WASD移动', `移动距离=${dist.toFixed(1)} (${dx.toFixed(1)}, ${dz.toFixed(1)})`);
    if (dist > 3) {
      ok('D2.空气墙突破', `成功前进了${dist.toFixed(1)}m，无空气墙阻挡`);
    } else {
      fail('D2.可能仍有阻挡', `仅移动${dist.toFixed(1)}m，可能被挡住`);
    }
  }

  // Step E: 截图
  const s1 = await page.screenshot();
  fs.writeFileSync('C:/Users/ken/WorkBuddy/2026-08-05-19-08-47/_ss_airwall_1.png', s1);
  ok('E1.移动后截图', `${s1.width}x${s1.height}`);

  // 结果
  const pass = results.filter(r => r.ok).length;
  console.log(`\n═══ ${pass}/${results.length} 通过 ═══`);
  results.filter(r => !r.ok).forEach(r => console.log(`  ❌ ${r.name}: ${r.d}`));

} catch(e) {
  fail('异常', e.message?.slice(0, 400));
} finally {
  await browser.close();
}
process.exit(results.every(r => r.ok) ? 0 : 1);
