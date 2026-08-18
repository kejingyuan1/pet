// 岛屿/矿产对齐验证（server-authoritative island centers 修复 2026-08-18）
// 账号：kejingyuan / abc123
// 断言：
//   1) __worldDebug.islandSource === 'server'（前端消费后端权威岛屿中心）
//   2) 前端 islCmp 与后端 islSrv 中心逐项一致（cx/cz/r 偏差 < 1.0）
//   3) 矿石悬浮率 = oresHy3dNull / oresTotal 必须 == 0（每个矿石下方都有 HY3D 岛屿）
//   4) 玩家不在水里（counts.playerInWater === 0 且 yCoord.hy3dGround != null）
// 加固：每步 stderr 进度；全局 watchdog 240s 强制写结果退出。
const { chromium } = require('C:/Users/ken/.workbuddy/binaries/node/workspace/node_modules/playwright-core');
const BASE = 'http://127.0.0.1:4200';
const OUT = 'D:/pet/tools/island_align';
require('fs').mkdirSync(OUT, { recursive: true });

const r = { consoleErrors: [], pageErrors: [], fatal: '', steps: [], screenshots: {}, serverCenters: null, cmpCenters: null, ores: null };
const log = (m) => { process.stderr.write('[STEP] ' + m + '\n'); };
const writeResult = () => { try { require('fs').writeFileSync(OUT + '/result.json', JSON.stringify(r, null, 2)); } catch (_) {} };

const WATCHDOG_MS = 240000;
const watchdog = setTimeout(() => {
  r.fatal = r.fatal || ('WATCHDOG_TIMEOUT after ' + (WATCHDOG_MS / 1000) + 's; last steps=' + JSON.stringify(r.steps));
  log('WATCHDOG_TIMEOUT -> forcing exit');
  writeResult();
  try { if (b) b.close().catch(() => {}); } catch (_) {}
  process.exit(2);
}, WATCHDOG_MS);
watchdog.unref();

const waitFrames = async (p, need, capMs) => {
  const base = await p.evaluate(() => window.__worldFrame || 0);
  const start = Date.now();
  while (Date.now() - start < capMs) {
    const f = await p.evaluate(() => window.__worldFrame || 0);
    if (f - base >= need) return true;
    await p.waitForTimeout(500);
  }
  return false;
};

let b;
(async () => {
  try {
    log('launching chromium');
    b = await chromium.launch({
      headless: true,
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
             '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling']
    });
    const ctx = await b.newContext({ viewport: { width: 1100, height: 720 } });
    // 🔴 显式开启调试钩子（publishWorldDebug 默认关闭，避免影响正常玩家性能）
    await ctx.addInitScript(() => { window.__worldDebugEnabled = true; });
    const p = await ctx.newPage();
    p.on('console', m => { if (m.type() === 'error') r.consoleErrors.push(m.text().slice(0, 200)); });
    p.on('pageerror', e => r.pageErrors.push(e.message.slice(0, 200)));

    // 1) 登录
    log('goto base');
    await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await p.evaluate(() => { try { window.sessionStorage.setItem('forceSpawnIsland', '0'); } catch (e) {} });
    await p.waitForSelector('input[placeholder="用户名"]', { timeout: 10000 });
    await p.fill('input[placeholder="用户名"]', 'kejingyuan');
    await p.fill('input[type="password"]', 'abc123');
    await p.click('button.btn-login');
    await p.waitForSelector('text=进入大世界', { timeout: 15000 });
    r.steps.push('login_ok');
    log('login_ok');

    // 2) 进入大世界（落岛 0，确定性）
    log('enter world');
    await p.click('text=进入大世界');
    await p.waitForFunction(() => {
      const d = window.__worldDebug;
      return d && (d.ready === true || (d.hy3dTerrain && d.hy3dTerrain.loaded));
    }, { timeout: 30000 }).catch(() => log('world-ready wait timed out (continuing)'));
    // 等岛屿实例 + 矿石生成（publishWorldDebug 每 8 帧刷新）
    await waitFrames(p, 60, 60000);
    r.steps.push('world_loaded');
    log('world_loaded');

    // 3) 拉调试快照
    const snap = await p.evaluate(() => {
      const d = window.__worldDebug;
      if (!d) return null;
      return {
        islandSource: d.islandSource,
        hy3dIslands: d.hy3dIslands,
        cmpCenters: (d.hy3dTerrain && d.hy3dTerrain.centerList) || [],
        ores: d.ores || [],
        counts: d.counts || {},
        player: d.player || {},
        yCoord: d.yCoord || {},
        spawnDiag: d.spawnDiag || {},
        waterLevel: d.waterLevel
      };
    });
    if (!snap) throw new Error('no __worldDebug snapshot');
    r.snap = snap;
    r.steps.push('snap_ok islandSource=' + snap.islandSource + ' ores=' + snap.ores.length + ' hy3dIslands=' + snap.hy3dIslands);
    log('snap_ok islandSource=' + snap.islandSource + ' ores=' + snap.ores.length);

    // 4) 拉后端权威中心（与前端 11913 端口 config 比对）
    const srv = await p.evaluate(async () => {
      try { const j = await (await fetch('http://127.0.0.1:8080/api/world/config')).json(); return j.data && j.data.islandCenters; } catch (e) { return null; }
    });
    r.serverCenters = srv;
    r.cmpCenters = snap.cmpCenters;

    // 5) 比对中心一致性
    let centerMaxDiff = null, centerMatch = false;
    if (srv && srv.length && snap.cmpCenters && snap.cmpCenters.length) {
      const n = Math.min(srv.length, snap.cmpCenters.length);
      let md = 0;
      for (let i = 0; i < n; i++) {
        const a = srv[i], c = snap.cmpCenters[i];
        md = Math.max(md, Math.abs(a.cx - c.cx), Math.abs(a.cz - c.cz), Math.abs(a.r - c.r));
      }
      centerMaxDiff = +md.toFixed(3);
      centerMatch = (srv.length === snap.cmpCenters.length) && centerMaxDiff < 1.0;
    }

    // 6) 矿石悬浮分析
    const oresTotal = snap.ores.length;
    const oresHy3dNull = snap.ores.filter(o => o.hy3d == null).length;
    const oresFloatingRate = oresTotal ? (oresHy3dNull / oresTotal) : null;

    // 7) 玩家是否落水
    const playerInWater = (snap.counts.playerInWater === 1) || (snap.player && snap.player.inWater === true);
    const playerHy3dGround = snap.yCoord && snap.yCoord.hy3dGround;

    // 8) 截图（俯视 + 平视）
    await p.evaluate(() => {
      const cb = document.querySelector('.world-chat-bar'); if (cb) cb.style.display = 'none';
      const ob = document.querySelector('.onboard'); if (ob) ob.style.display = 'none';
      const tb = document.querySelector('.w3d-toolbar'); if (tb) tb.style.display = 'none';
    });
    // 尝试俯视对准出生岛，便于肉眼看岛屿+矿石
    const sd = snap.spawnDiag;
    if (sd && sd.nearestIdx != null) {
      await p.evaluate(({ x, z }) => { if (window.__shoreClipAim) window.__shoreClipAim(x, 2, z, 200, 1.0, 260); }, { x: sd.playerX || 0, z: sd.playerZ || 0 });
      await waitFrames(p, 12, 20000);
    }
    await p.screenshot({ path: OUT + '/world_top.png' });
    r.screenshots.world_top = OUT + '/world_top.png';
    r.steps.push('shot_top_done');
    log('shot_top_done');

    // 9) 汇总断言
    const noErr = r.consoleErrors.length === 0 && r.pageErrors.length === 0;
    const ok =
      noErr &&
      snap.islandSource === 'server' &&
      centerMatch &&
      oresTotal > 0 &&
      oresFloatingRate === 0 &&
      !playerInWater &&
      playerHy3dGround != null;
    r.ok = ok;
    r.summary = {
      consoleErrors: r.consoleErrors.length,
      pageErrors: r.pageErrors.length,
      islandSource: snap.islandSource,
      centerMatch, centerMaxDiff,
      serverCount: srv ? srv.length : null,
      frontendCount: snap.cmpCenters ? snap.cmpCenters.length : null,
      oresTotal, oresHy3dNull, oresFloatingRate,
      playerInWater, playerHy3dGround,
      ok
    };
  } catch (e) { r.fatal = String(e?.stack || e); log('FATAL: ' + r.fatal); }
  writeResult();
  console.log('SUMMARY:', JSON.stringify(r.summary || { fatal: r.fatal }, null, 2));
  if (r.fatal) console.log('FATAL:', r.fatal);
  try { if (b) await Promise.race([b.close(), new Promise(res => setTimeout(res, 3000))]); } catch (_) {}
  clearTimeout(watchdog);
  process.exit(r.fatal ? 1 : 0);
})();
