// SHORE-CLIP 验证脚本（湖岛岸边穿模黑坑 · 方案 A 不透明湖底盘）
// 账号：kejingyuan / abc123（用户提供）
// 流程：无参登录 → sessionStorage.forceSpawnIsland=1 落湖岛（variant=idx%4=1=湖岛，确定性）
//      → 等 __worldDebug.shoreClip.shoreClipFixAdded===true（盘已加）
//      → 截图"修复后"（夜+昼）→ __shoreClipDisable() 移除盘 → 等刷新 → 截图"修复前"（夜+昼）
// 断言：shoreClipFixAdded===true && 0 console/page error
// 🔴 加固：每步打 stderr 进度；全局 watchdog 240s 强制写出部分结果并退出，杜绝静默卡死。
const { chromium } = require('C:/Users/ken/.workbuddy/binaries/node/workspace/node_modules/playwright-core');
const BASE = 'http://127.0.0.1:4200';
const OUT = 'D:/pet/tools/shore_clip';
require('fs').mkdirSync(OUT, { recursive: true });

const r = { consoleErrors: [], pageErrors: [], fatal: '', steps: [], screenshots: {}, shoreFix: null, shoreBefore: null, diskToggle: null };
const log = (m) => { process.stderr.write('[STEP] ' + m + '\n'); };
const writeResult = () => { try { require('fs').writeFileSync(OUT + '/result.json', JSON.stringify(r, null, 2)); } catch (_) {} };

// 🔴 全局看门狗：240s 后强制写结果并退出
const WATCHDOG_MS = 240000;
const watchdog = setTimeout(() => {
  r.fatal = r.fatal || ('WATCHDOG_TIMEOUT after ' + (WATCHDOG_MS / 1000) + 's; last steps=' + JSON.stringify(r.steps));
  log('WATCHDOG_TIMEOUT -> forcing exit');
  writeResult();
  try { if (b) b.close().catch(() => {}); } catch (_) {}
  process.exit(2);
}, WATCHDOG_MS);
watchdog.unref();

// 读 __worldDebug.shoreClip（正确嵌套路径）
const getShore = (p) => p.evaluate(() => {
  const d = window.__worldDebug;
  if (!d || !d.shoreClip) return null;
  const s = d.shoreClip;
  return {
    shoreClipFixAdded: s.shoreClipFixAdded,
    waterPlaneY: s.waterPlaneY,
    lakeBasinYMin: s.lakeBasinYMin,
    lakeBasinVsWater: s.lakeBasinVsWater,
    lakeFloorYMin: s.lakeFloorYMin,
    lakeFloorVsWater: s.lakeFloorVsWater,
    lakeVariantLoaded: s.lakeVariantLoaded,
    lakeIsland: s.lakeIsland
  };
});

// 帧号驱动等待（headless swiftshader 帧率极低，必须按帧号等，不能按墙钟）
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

// 进入大世界并落湖岛，等湖底盘加上，返回 shore 诊断
async function enterWorldAsLake(p) {
  await p.evaluate(() => { try { window.sessionStorage.setItem('forceSpawnIsland', '1'); } catch (e) {} });
  await p.waitForSelector('text=进入大世界', { timeout: 10000 });
  log('enter-world button found');
  await p.click('text=进入大世界');
  // 等世界初始化：__worldDebug 出现且 ready
  await p.waitForFunction(() => {
    const d = window.__worldDebug;
    return d && (d.ready === true || (d.hy3dTerrain && d.hy3dTerrain.loaded));
  }, { timeout: 20000 }).catch(() => log('world-ready wait timed out (continuing)'));
  log('world init wait done');
  // 等湖底盘加上（publishWorldDebug 低频刷新，轮询间隔放大）
  let shore = null;
  for (let i = 0; i < 50; i++) {
    shore = await getShore(p);
    if (shore && shore.shoreClipFixAdded === true) break;
    await p.waitForTimeout(600);
  }
  log('shore poll done; shoreClipFixAdded=' + (shore ? shore.shoreClipFixAdded : 'null') + ' lakeVariantLoaded=' + (shore ? shore.lakeVariantLoaded : 'null'));
  return shore;
}

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
    const p = await ctx.newPage();
    p.on('console', m => { if (m.type() === 'error') r.consoleErrors.push(m.text().slice(0, 200)); });
    p.on('pageerror', e => r.pageErrors.push(e.message.slice(0, 200)));

    // 1) 登录（无参 URL，避免 ?spawnIsland 触发初始化异常）
    log('goto base');
    await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await p.evaluate(() => { try { window.sessionStorage.setItem('forceSpawnIsland', '1'); } catch (e) {} });
    await p.waitForSelector('input[placeholder="用户名"]', { timeout: 10000 });
    await p.fill('input[placeholder="用户名"]', 'kejingyuan');
    await p.fill('input[type="password"]', 'abc123');
    await p.click('button.btn-login');
    // 登录成功 → 家园主界面（出现"进入大世界"）
    await p.waitForSelector('text=进入大世界', { timeout: 15000 });
    r.steps.push('login_ok');
    log('login_ok');

    // 2) 进入大世界（落湖岛），等湖底盘
    const shoreFix = await enterWorldAsLake(p);
    r.shoreFix = shoreFix;
    r.steps.push('world_loaded');
    r.steps.push('shoreFix=' + JSON.stringify(shoreFix));

    // 隐藏 UI 干扰元素
    await p.evaluate(() => {
      const cb = document.querySelector('.world-chat-bar'); if (cb) cb.style.display = 'none';
      const ob = document.querySelector('.onboard'); if (ob) ob.style.display = 'none';
      const tb = document.querySelector('.w3d-toolbar'); if (tb) tb.style.display = 'none';
    });

    // 若有湖岛信息，俯视对准湖岛（黑坑在岸边水面处）
    if (shoreFix && shoreFix.lakeIsland) {
      const li = shoreFix.lakeIsland;
      await p.evaluate(({ x, z, r }) => {
        if (window.__shoreClipAim) window.__shoreClipAim(x, 1, z, 0, 1.1, r * 1.4);
      }, { x: li.x, z: li.z, r: li.r });
      await waitFrames(p, 10, 20000);
    }
    log('aim done');

    // 3) 修复后截图：夜 + 昼
    await p.evaluate(() => { if (window.__forcePhase) window.__forcePhase(0.0); });
    await waitFrames(p, 12, 20000);
    await p.screenshot({ path: OUT + '/shore_fixed_night.png' });
    r.screenshots.shore_fixed_night = OUT + '/shore_fixed_night.png';
    await p.evaluate(() => { if (window.__forcePhase) window.__forcePhase(0.6); });
    await waitFrames(p, 12, 20000);
    await p.screenshot({ path: OUT + '/shore_fixed_day.png' });
    r.screenshots.shore_fixed_day = OUT + '/shore_fixed_day.png';
    r.steps.push('fixed_shots_done');
    log('fixed_shots_done');

    // 4) 移除湖底盘 → 截"修复前"（黑坑）夜 + 昼
    const beforeDisable = (await getShore(p))?.shoreClipFixAdded;
    await p.evaluate(() => { if (window.__shoreClipDisable) window.__shoreClipDisable(); });
    // 等 publishWorldDebug 刷新（低频）反映 _shoreClipFixAdded=false
    let afterDisable = null;
    for (let i = 0; i < 30; i++) {
      const s = await getShore(p);
      afterDisable = s?.shoreClipFixAdded;
      if (afterDisable === false) break;
      await p.waitForTimeout(600);
    }
    r.diskToggle = { beforeDisable, afterDisable };
    r.steps.push('diskToggle=' + JSON.stringify(r.diskToggle));
    log('diskToggle=' + JSON.stringify(r.diskToggle));

    await p.evaluate(() => { if (window.__forcePhase) window.__forcePhase(0.0); });
    await waitFrames(p, 12, 20000);
    await p.screenshot({ path: OUT + '/shore_before_night.png' });
    r.screenshots.shore_before_night = OUT + '/shore_before_night.png';
    await p.evaluate(() => { if (window.__forcePhase) window.__forcePhase(0.6); });
    await waitFrames(p, 12, 20000);
    await p.screenshot({ path: OUT + '/shore_before_day.png' });
    r.screenshots.shore_before_day = OUT + '/shore_before_day.png';
    r.steps.push('before_shots_done');
    log('before_shots_done');

    // 5) 汇总断言
    const fixAdded = r.shoreFix && r.shoreFix.shoreClipFixAdded === true;
    const floorYMin = r.shoreFix && r.shoreFix.lakeFloorYMin;
    const waterY = r.shoreFix && r.shoreFix.waterPlaneY;
    const lakeFloorBelowWater = floorYMin != null && waterY != null && floorYMin < waterY;
    const diskRemovable = r.diskToggle && r.diskToggle.beforeDisable === true && r.diskToggle.afterDisable === false;
    const noErr = r.consoleErrors.length === 0 && r.pageErrors.length === 0;
    r.ok = noErr && fixAdded && diskRemovable;
    r.summary = {
      consoleErrors: r.consoleErrors.length,
      pageErrors: r.pageErrors.length,
      shoreClipFixAdded: fixAdded,
      lakeFloorYMin: floorYMin,
      waterPlaneY: waterY,
      lakeFloorVsWater: r.shoreFix && r.shoreFix.lakeFloorVsWater,
      lakeBasinVsWater: r.shoreFix && r.shoreFix.lakeBasinVsWater,
      lakeFloorBelowWater,
      diskRemovable,
      ok: r.ok,
      screenshots: r.screenshots
    };
  } catch (e) { r.fatal = String(e?.stack || e); log('FATAL: ' + r.fatal); }
  writeResult();
  console.log('SUMMARY:', JSON.stringify(r.summary || { fatal: r.fatal }, null, 2));
  if (r.fatal) console.log('FATAL:', r.fatal);
  try { if (b) await Promise.race([b.close(), new Promise(res => setTimeout(res, 3000))]); } catch (_) {}
  clearTimeout(watchdog);
  process.exit(r.fatal ? 1 : 0);
})();
