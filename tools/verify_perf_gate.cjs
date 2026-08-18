// 性能修复验证：确认调试钩子默认关闭（正常玩家不会每 8 帧跑全量 chunk 顶点遍历 + 多次 raycast），
// 且仅在显式开启 window.__worldDebugEnabled 时才运行。
// 账号：kejingyuan / abc123
const { chromium } = require('C:/Users/ken/.workbuddy/binaries/node/workspace/node_modules/playwright-core');
const BASE = 'http://127.0.0.1:4200';
const log = (m) => process.stderr.write('[STEP] ' + m + '\n');

const waitFrames = async (p, need, capMs) => {
  const base = await p.evaluate(() => window.__worldFrame || 0);
  const start = Date.now();
  while (Date.now() - start < capMs) {
    const f = await p.evaluate(() => window.__worldFrame || 0);
    if (f - base >= need) return true;
    await p.waitForTimeout(300);
  }
  return false;
};

(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
           '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']
  });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  // 关键：不开启 __worldDebugEnabled（模拟正常玩家）
  const p = await ctx.newPage();
  let consoleErr = 0, pageErr = 0;
  p.on('console', m => { if (m.type() === 'error') consoleErr++; });
  p.on('pageerror', e => pageErr++);

  await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.evaluate(() => { try { window.sessionStorage.setItem('forceSpawnIsland', '0'); } catch (e) {} });
  await p.waitForSelector('input[placeholder="用户名"]', { timeout: 10000 });
  await p.fill('input[placeholder="用户名"]', 'kejingyuan');
  await p.fill('input[type="password"]', 'abc123');
  await p.click('button.btn-login');
  await p.waitForSelector('text=进入大世界', { timeout: 15000 });
  await p.click('text=进入大世界');
  // 等待世界加载 + 远超 8 帧周期的大量帧（验证正常玩家路径下调试钩子从不执行）
  await waitFrames(p, 150, 60000);

  // 正常玩家：调试钩子被门控关闭 → 不应存在 publishWorldDebug 每 8 帧构建的 ores/counts/player 重型字段
  // （注意：computeIslandCenters 等一次性初始化会创建空 {} 并写 islandSource，故不能简单判断 undefined）
  const gatedOff = await p.evaluate(() => {
    const d = window.__worldDebug;
    return !d || (d.ores === undefined && d.counts === undefined && d.player === undefined);
  });
  log('phase1 gatedOff(heavy debug fields absent for normal user) = ' + gatedOff);

  // 显式开启调试钩子（playwright/调试场景）
  await p.evaluate(() => { window.__worldDebugEnabled = true; });
  await waitFrames(p, 40, 30000);
  const enabledWorks = await p.evaluate(() => {
    const d = window.__worldDebug;
    return !!(d && Array.isArray(d.ores) && d.counts && d.player);
  });
  log('phase2 enabledWorks = ' + enabledWorks);

  const ok = gatedOff && enabledWorks && consoleErr === 0 && pageErr === 0;
  console.log('SUMMARY:', JSON.stringify({ gatedOff, enabledWorks, consoleErr, pageErr, ok }, null, 2));
  await b.close().catch(() => {});
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
