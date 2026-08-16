/**
 * _verify_water_trees.mjs — v7 捕获控制台诊断日志
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

// 收集所有控制台日志
const consoleLogs = [];
page.on('console', msg => {
  const text = msg.text();
  consoleLogs.push(`[${msg.type()}] ${text}`);
  if (text.includes('spawnTrees') || text.includes('water') || text.includes('Water') || text.includes('TREE')) {
    console.log(`  📋 CONSOLE: ${text}`);
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
    const ssE = await page.screenshot();
    fs.writeFileSync('C:/Users/ken/WorkBuddy/2026-08-05-19-08-47/_ss_v7_err.png', ssE);
  } else {
    ok('B1.Canvas就绪', 'OK');
  }

  // 等待场景加载 + 树生成
  console.log('[info] 等待场景(25s)...');
  await page.waitForTimeout(25000);

  // 关闭引导弹窗（如果有）
  try {
    const skipBtn = await page.$('text=跳过');
    if (skipBtn) { await skipBtn.click(); await page.waitForTimeout(1000); }
    const nextBtn = await page.$('text=下一步');
    if (nextBtn) { await nextBtn.click(); await page.waitForTimeout(500); }
    const closeBtn = await page.$('button:has-text("跳过"), button.close');
    if (closeBtn) { await closeBtn.click(); await page.waitForTimeout(500); }
  } catch(e) {}

  // Step C: 诊断数据
  const dbg = await page.evaluate(() => {
    const d = (window).__worldDebug;
    if (!d) return { err: 'no hook' };
    return {
      treeCount: d.treeList?.length ?? 0,
      treesInWater: d.treesInWater ?? 'N/A',
      waterPlane: !!d.waterPlane,
      islandCenters: d.hy3dTerrain?.centers ?? 'N/A',
      sceneChildren: d.scene?.childCount ?? 'N/A',
    };
  });
  ok('C1.DebugHook', JSON.stringify(dbg));

  // 过滤 spawnTrees 相关日志
  const spawnLogs = consoleLogs.filter(l => l.includes('spawnTrees'));
  ok('C2.spawnTrees日志', `${spawnLogs.length}条: ${spawnLogs.slice(0,5).join(' | ')}`);

  // 所有 water 相关日志
  const waterLogs = consoleLogs.filter(l => l.toLowerCase().includes('water'));
  ok('C3.Water日志', `${waterLogs.length}条`);

  // Step D: 截图
  const s1 = await page.screenshot();
  fs.writeFileSync('C:/Users/ken/WorkBuddy/2026-08-05-19-08-47/_ss_v7_1.png', s1);
  ok('D1.默认视角', `${s1.width}x${s1.height}`);

  // 抬高看水面
  await page.evaluate(() => {
    const c = (window).__worldDebug?.camera;
    if (c?.position) { c.position.y += 60; c.position.z -= 120; }
  }).catch(() => {});
  await page.waitForTimeout(3000);
  const s2 = await page.screenshot();
  fs.writeFileSync('C:/Users/ken/WorkBuddy/2026-08-05-19-08-47/_ss_v7_2.png', s2);
  ok('D2.抬高视角', `${s2.width}x${s2.height}`);

  // 更远
  await page.evaluate(() => {
    const c = (window).__worldDebug?.camera;
    if (c?.position) { c.position.y += 100; c.position.z -= 250; }
  }).catch(() => {});
  await page.waitForTimeout(3000);
  const s3 = await page.screenshot();
  fs.writeFileSync('C:/Users/ken/WorkBuddy/2026-08-05-19-08-47/_ss_v7_3.png', s3);
  ok('D3.远眺水面', `${s3.width}x${s3.height}`);

  // 结果
  const pass = results.filter(r => r.ok).length;
  console.log(`\n═══ ${pass}/${results.length} 通过 ═══`);
  results.filter(r => !r.ok).forEach(r => console.log(`  ❌ ${r.name}: ${r.d}`));

  // 保存完整日志
  fs.writeFileSync('C:/Users/ken/WorkBuddy/2026-08-05-19-08-47/_v7_console.json', JSON.stringify(consoleLogs, null, 2));

} catch(e) {
  fail('异常', e.message?.slice(0, 400));
} finally {
  await browser.close();
}
process.exit(results.every(r => r.ok) ? 0 : 1);
