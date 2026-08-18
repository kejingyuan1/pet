// 星空 + 水面 修复验证（2026-08-18）
// 账号：kejingyuan / abc123
// 使用系统 Chrome 默认 GPU（非 SwiftShader）才能真实截图夜间 WebGL 场景
// 目标：1) 强制夜晚后截图（确认星星不再铺满屏幕 / 水面更平滑）
//       2) 断言 2D 星空底图已移除、星 dome 高于地平线、水面存在
const { chromium } = require('C:/Users/ken/.workbuddy/binaries/node/workspace/node_modules/playwright-core');
const BASE = 'http://127.0.0.1:4200';
const OUT = 'D:/pet/tools/stars_water';
require('fs').mkdirSync(OUT, { recursive: true });

const r = { consoleErrors: [], pageErrors: [], fatal: '', steps: [], screenshots: {}, fps: {}, dbg: null };
const log = (m) => { process.stderr.write('[STEP] ' + m + '\n'); };
const writeResult = () => { try { require('fs').writeFileSync(OUT + '/result.json', JSON.stringify(r, null, 2)); } catch (_) {} };

const WATCHDOG_MS = 180000;
const watchdog = setTimeout(() => {
  r.fatal = r.fatal || ('WATCHDOG_TIMEOUT after ' + (WATCHDOG_MS / 1000) + 's');
  log('WATCHDOG_TIMEOUT -> forcing exit'); writeResult();
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
    await p.waitForTimeout(300);
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
      args: [
        '--no-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
        '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling'
      ]
    });
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    p.on('console', m => { if (m.type() === 'error') r.consoleErrors.push(m.text().slice(0, 200)); });
    p.on('pageerror', e => r.pageErrors.push(e.message.slice(0, 200)));

    log('goto base');
    await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await p.evaluate(() => { try { window.sessionStorage.setItem('forceSpawnIsland', '0'); } catch (e) {} });
    await p.waitForSelector('input[placeholder="用户名"]', { timeout: 10000 });
    await p.fill('input[placeholder="用户名"]', 'kejingyuan');
    await p.fill('input[type="password"]', 'abc123');
    await p.click('button.btn-login');
    await p.waitForSelector('text=进入大世界', { timeout: 15000 });
    r.steps.push('login_ok'); log('login_ok');

    log('enter world');
    await p.click('text=进入大世界');
    await p.waitForFunction(() => {
      const d = window.__worldDebug;
      return d && (d.ready === true || (d.hy3dTerrain && d.hy3dTerrain.loaded));
    }, { timeout: 30000 }).catch(() => log('world-ready wait timed out (continuing)'));
    await waitFrames(p, 60, 60000);
    r.steps.push('world_loaded'); log('world_loaded');

    // 关闭新手引导弹窗，隐藏大部分 UI，获得干净的星空/水面画面
    await p.evaluate(() => {
      const btnSkip = Array.from(document.querySelectorAll('button, span, div')).find(el => el.textContent.includes('跳过'));
      if (btnSkip) btnSkip.click();
      ['world-chat-bar','onboard','w3d-toolbar','.hud','.crosshair','app-minimap','.minimap-card','.mining-panel','.level-up-tip'].forEach(sel => {
        const el = document.querySelector(sel); if (el) el.style.display = 'none';
      });
      const hideByText = (text) => Array.from(document.querySelectorAll('button, div, span, a')).forEach(el => {
        if (el.textContent.includes(text)) el.style.display = 'none';
      });
      ['建造','养鱼','采矿','拆除','升级','收获','采集','跟随','帮助','养成','牧场','家园','大世界','学习'].forEach(hideByText);
    });
    await p.waitForTimeout(4000);

    // 强制夜晚后立即截图（SwiftShader 帧率极低，给足 20s 等画面合成）
    await p.evaluate(() => { if (window.__forcePhase) window.__forcePhase(0); });
    await p.waitForTimeout(20000);
    await p.waitForTimeout(3000);
    await p.screenshot({ path: OUT + '/overview_night.png', timeout: 120000 });
    r.screenshots.overview_night = OUT + '/overview_night.png';
    r.steps.push('shot_overview_night'); log('shot_overview_night_done');

    // 再次强制夜晚并旋转到水面方向
    await p.evaluate(() => {
      if (window.__forcePhase) window.__forcePhase(0);
      if (window.__shoreClipAim) {
        // 玩家出生岛附近，看向开阔水面
        window.__shoreClipAim(-1200, 8, -1200, Math.PI * 0.7, 0.18, 220);
      }
    });
    await p.waitForTimeout(4000);
    await p.screenshot({ path: OUT + '/water_horizon_night.png', timeout: 60000 });
    r.screenshots.water_horizon_night = OUT + '/water_horizon_night.png';
    r.steps.push('shot_water_horizon_night'); log('shot_water_horizon_night_done');

    // 读取昼夜状态 + 星空/水面诊断
    r.dbg = await p.evaluate(() => {
      const d = window.__worldDebug || {};
      const t = window.__petWorldTime || {};
      return {
        blend: d.blend, starOpacity: d.starOpacity, bg: d.bg,
        waterPlane: d.waterPlane, frac: t.frac, elevation: t.elevation, phase: t.phase
      };
    });
    r.starDiag = await p.evaluate(() => window.__starDiag ? window.__starDiag() : null);
    log('dbg=' + JSON.stringify(r.dbg));
    log('starDiag=' + JSON.stringify(r.starDiag));
    if (!r.dbg.waterPlane) throw new Error('waterPlane missing');
    if (!r.starDiag || r.starDiag.pointsMinY < 300) throw new Error('star dome too low, minY=' + (r.starDiag && r.starDiag.pointsMinY));
    // 核心断言：2D 星空背景已移除（纯色夜空），星点只来自 3D Points dome
    if (!r.starDiag || r.starDiag.bgIsSolidColor !== true) throw new Error('night background is not solid color');
    r.steps.push('assert_ok'); log('assert_ok');

  } catch (e) { r.fatal = String(e?.stack || e); log('FATAL: ' + r.fatal); }
  writeResult();
  console.log('SUMMARY:', JSON.stringify({ fps: r.fps, dbg: r.dbg, consoleErrors: r.consoleErrors.length, pageErrors: r.pageErrors.length, fatal: r.fatal }, null, 2));
  if (r.fatal) console.log('FATAL:', r.fatal);
  try { if (b) await Promise.race([b.close(), new Promise(res => setTimeout(res, 3000))]); } catch (_) {}
  clearTimeout(watchdog);
  process.exit(r.fatal ? 1 : 0);
})();
