// 大世界三项打磨验证脚本（world polish）
// 验证：
//   1) 修复1 - 星空：夜晚用 CanvasTexture 底图（无地平环弧线），Points 压缩到上 1/3 cap；
//   2) 修复2 - w3d-toolbar 已无「已连接」连接徽章（DOM + CSS 已删）；
//   3) 修复3 - 牧场入口真正进入 w3d-toolbar（🐮牧场 按钮，点击进入牧场 overlay）；
//   4) 0 console error / 0 page error；
//   5) 牧场回归：__ranchDebug.animalCount >= 7 且 moved >= 2。
//
// 参考 verify_ranch.cjs：帧号驱动等待（headless + swiftshader ~0.86fps，不能按墙钟），
// 视口 900×650，抗节流 args。
const { chromium } = require('C:/Users/WIN11/.workbuddy/binaries/node/workspace/node_modules/playwright');
const BASE = 'http://127.0.0.1:4200';
const OUT = 'D:/pet/tools/ranch_verify';
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const r = { consoleErrors: [], pageErrors: [], fatal: '', steps: [], screenshots: {}, dayChecks: null, starDiag: null, ranch: null };
  let b;
  try {
    b = await chromium.launch({
      headless: true,
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
             '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling']
    });
    const ctx = await b.newContext({ viewport: { width: 900, height: 650 } });
    const p = await ctx.newPage();
    p.on('console', m => { if (m.type() === 'error') r.consoleErrors.push(m.text()); });
    p.on('pageerror', e => r.pageErrors.push(e.message));

    // 1) 登录
    await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await p.waitForSelector('input[placeholder="用户名"]', { timeout: 10000 });
    await p.fill('input[placeholder="用户名"]', 'kejingyuan');
    await p.fill('input[type="password"]', 'abc123');
    await p.click('button.btn-login');
    await p.waitForSelector('.app-shell', { timeout: 15000 });
    r.steps.push('login_ok');

    // 2) 进入大世界
    await p.waitForSelector('text=进入大世界', { timeout: 10000 });
    await p.click('text=进入大世界');
    await p.waitForSelector('.world3d-mount', { timeout: 15000 });
    // 等世界初始化（调试钩子就绪）
    await p.waitForFunction(() => typeof window.__starDiag === 'function' && typeof window.__forcePhase === 'function', { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(6000);
    r.steps.push('world_loaded');

    // 隐藏聊天面板（900×650 视口下 chat-bar 跳到 top:8px 遮挡工具栏；隐藏后截图清晰）
    await p.evaluate(() => {
      const cb = document.querySelector('.world-chat-bar');
      if (cb) cb.style.display = 'none';
    });
    // 关闭新手引导卡片（遮挡底部区域）
    await p.evaluate(() => {
      const ob = document.querySelector('.onboard');
      if (ob) ob.style.display = 'none';
    });
    r.steps.push('chat_hidden');

    // 帧号驱动等待（world 用 __worldFrame）
    const getWorldFrame = () => p.evaluate(() => window.__worldFrame || 0);
    const waitWorldFrames = async (need, capMs) => {
      const start = Date.now();
      const base = await getWorldFrame();
      while (Date.now() - start < capMs) {
        const f = await getWorldFrame();
        if (f - base >= need) return f - base;
        await p.waitForTimeout(400);
      }
      return (await getWorldFrame()) - base;
    };

    // ===== 修复2 + 修复3：白天工具栏检查 =====
    // 强制白天（确定性截图），等若干帧让新背景渲染
    await p.evaluate(() => window.__forcePhase(0.6));
    await waitWorldFrames(14, 40000);
    r.steps.push('forced_day');

    const dayChecks = await p.evaluate(() => {
      const ranchBtn = Array.from(document.querySelectorAll('.w3d-toolbar button')).find(b => b.textContent && b.textContent.includes('牧场'));
      const hudConn = document.querySelector('.hud-conn');
      const ranchEntry = document.querySelector('.ranch-entry'); // 旧顶栏按钮应已删除
      const connDot = document.querySelector('.conn-dot');
      return {
        ranchBtnInToolbar: !!ranchBtn,
        ranchBtnText: ranchBtn ? (ranchBtn.textContent || '').trim() : null,
        hudConnAbsent: !hudConn,
        connDotAbsent: !connDot,
        ranchEntryAbsent: !ranchEntry
      };
    });
    r.dayChecks = dayChecks;
    r.steps.push('day_checks=' + JSON.stringify(dayChecks));
    await p.screenshot({ path: OUT + '/world_day.png' });
    r.screenshots.world_day = OUT + '/world_day.png';

    // ===== 修复1：夜晚星空（CanvasTexture 底图 + Points 压缩） =====
    await p.evaluate(() => window.__forcePhase(0.0)); // 深夜晚
    await waitWorldFrames(14, 40000);
    r.steps.push('forced_night');

    const starDiag = await p.evaluate(() => window.__starDiag ? window.__starDiag() : null);
    r.starDiag = starDiag;
    r.steps.push('star_diag=' + JSON.stringify(starDiag));
    await p.screenshot({ path: OUT + '/world_night.png' });
    r.screenshots.world_night = OUT + '/world_night.png';

    // ===== 修复3：点击 🐮 牧场 → 进入牧场 overlay =====
    // 用 DOM click 绕过可能的 pointer-events 遮挡（聊天面板等）
    await p.evaluate(() => {
      const btn = document.querySelector('.w3d-toolbar button.ranch-btn');
      if (btn) btn.click();
    });
    await p.waitForSelector('.ranch-overlay', { timeout: 10000 });
    await p.waitForTimeout(5000); // 等 env + 房屋/动物加载
    r.steps.push('ranch_opened');
    await p.screenshot({ path: OUT + '/ranch_after.png' });
    r.screenshots.ranch_after = OUT + '/ranch_after.png';

    // 牧场就绪：没有房屋就签到领金币 + 建造一层小屋
    let dbg = await p.evaluate(() => window.__ranchDebug || {});
    if (!dbg.animalCount || dbg.animalCount < 7) {
      const claim = await p.$('button:has-text("领取每日金币")');
      if (claim) { await claim.click().catch(() => {}); await p.waitForTimeout(600); r.steps.push('daily_claimed'); }
      const build = await p.$('button:has-text("建造一层小屋")');
      if (build) {
        const dis = await build.isDisabled().catch(() => true);
        if (!dis) { await build.click(); r.steps.push('house_built'); }
        else r.steps.push('build_disabled');
      } else r.steps.push('no_build_btn');
      await p.waitForTimeout(5000);
    }

    // 轮询 __ranchDebug.animalCount >= 7
    let ready = false;
    for (let i = 0; i < 30; i++) {
      dbg = await p.evaluate(() => window.__ranchDebug || {});
      if ((dbg.animalCount || 0) >= 7) { ready = true; r.steps.push('animals_ready_i=' + i); break; }
      await p.waitForTimeout(500);
    }
    r.animalCount = (await p.evaluate(() => window.__ranchDebug?.animalCount)) || 0;

    const ranch = { ready, animalCount: r.animalCount, moved: 0, inFence: 0, wanderOk: false, fenceOk: false };
    if (ready) {
      const getFrame = () => p.evaluate(() => (window.__animDbg && window.__animDbg.frame) || 0);
      const waitFrames = async (need, capMs) => {
        const start = Date.now();
        const base = await getFrame();
        while (Date.now() - start < capMs) {
          const f = await getFrame();
          if (f - base >= need) return f - base;
          await p.waitForTimeout(400);
        }
        return (await getFrame()) - base;
      };
      const adv0 = await waitFrames(20, 40000);
      const t0 = await p.evaluate(() => (window.__ranchDebug?.animals || []).map(a => ({ c: a.code, x: a.x, z: a.z, y: a.y, ry: a.ry, rx: a.rx })));
      await p.screenshot({ path: OUT + '/ranch_after.png' });
      const adv1 = await waitFrames(80, 90000);
      const t1 = await p.evaluate(() => (window.__ranchDebug?.animals || []).map(a => ({ c: a.code, x: a.x, z: a.z, y: a.y, ry: a.ry, rx: a.rx })));
      let moved = 0, inFence = 0;
      for (let i = 0; i < t0.length; i++) {
        const dx = t1[i].x - t0[i].x, dz = t1[i].z - t0[i].z;
        if (Math.hypot(dx, dz) > 0.15) moved++;
        if (Math.hypot(t1[i].x, t1[i].z) < 4.5) inFence++;
      }
      ranch.moved = moved; ranch.inFence = inFence;
      ranch.wanderOk = moved >= 2;
      ranch.fenceOk = inFence === t0.length;
      ranch.framesAccum = { warmup: adv0, measured: adv1 };
      r.steps.push('moved=' + moved + '/' + t0.length + ' inFence=' + inFence + '/' + t0.length);
    } else {
      r.steps.push('animals_not_ready');
    }
    r.ranch = ranch;

    // ===== 汇总 =====
    const starOk = !!(starDiag && starDiag.hasStarTexture && starDiag.bgIsStarTexture && starDiag.pointsCount === 1500 && starDiag.pointsMinY >= 200 && starDiag.starOpacity > 0.5);
    const badgeOk = !!(dayChecks && dayChecks.hudConnAbsent && dayChecks.connDotAbsent && dayChecks.ranchEntryAbsent);
    const btnOk = !!(dayChecks && dayChecks.ranchBtnInToolbar);
    r.ok = r.consoleErrors.length === 0 && r.pageErrors.length === 0 && starOk && badgeOk && btnOk && ranch.wanderOk && ranch.fenceOk;
    r.summary = {
      consoleErrors: r.consoleErrors.length,
      pageErrors: r.pageErrors.length,
      fix1_star_ok: starOk,
      fix2_badge_removed: badgeOk,
      fix3_ranch_btn_in_toolbar: btnOk,
      starDiag: starDiag,
      dayChecks: dayChecks,
      animalCount: r.animalCount,
      moved: ranch.moved,
      inFence: ranch.inFence,
      wanderOk: ranch.wanderOk,
      fenceOk: ranch.fenceOk,
      screenshots: r.screenshots
    };
  } catch (e) { r.fatal = String(e?.stack || e); }
  require('fs').writeFileSync(OUT + '/world_polish_result.json', JSON.stringify(r, null, 2));
  console.log('SUMMARY:', JSON.stringify(r.summary || { fatal: r.fatal }, null, 2));
  try { if (b) await Promise.race([b.close(), new Promise(res => setTimeout(res, 3000))]); } catch (_) {}
  process.exit(r.fatal ? 1 : 0);
})();
