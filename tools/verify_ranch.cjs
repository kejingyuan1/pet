// 牧场四项打磨验证脚本
// 验证：1) 顶栏牧场按钮与 3D 工具栏不重叠；2) 围栏草地；3) 动物在栅栏内随机游走（位姿变化）；4) 渐变天空；5) 无控制台错误
const { chromium } = require('C:/Users/WIN11/.workbuddy/binaries/node/workspace/node_modules/playwright');
const BASE = 'http://127.0.0.1:4200';
const OUT = 'D:/pet/tools/ranch_verify';
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const r = { consoleErrors: [], pageErrors: [], fatal: '', steps: [], t0: null, t1: null };
  let b;
  try {
    b = await chromium.launch({
      headless: true,
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
             '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling']
    });
    // 小视口：swiftshader 软件渲染每帧很慢，缩小画布能显著提速，避免「帧率太低误判为不走」
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

    // 2) 进入大世界（验证顶栏牧场按钮 + 工具栏不重叠）
    await p.waitForSelector('text=进入大世界', { timeout: 10000 });
    await p.click('text=进入大世界');
    await p.waitForSelector('.world3d-mount', { timeout: 15000 });
    await p.waitForTimeout(7000);
    r.steps.push('world_loaded');
    await p.screenshot({ path: OUT + '/world_view.png' });

    // 检查顶栏牧场按钮 + 工具栏的几何重叠
    const overlap = await p.evaluate(() => {
      const ranch = document.querySelector('.ranch-entry');
      const tools = document.querySelector('.w3d-toolbar');
      if (!ranch || !tools) return { ranch: !!ranch, tools: !!tools, overlap: null };
      const a = ranch.getBoundingClientRect();
      const b2 = tools.getBoundingClientRect();
      const xOverlap = Math.max(0, Math.min(a.right, b2.right) - Math.max(a.left, b2.left));
      const yOverlap = Math.max(0, Math.min(a.bottom, b2.bottom) - Math.max(a.top, b2.top));
      return { ranch: { x: a.x|0, y: a.y|0, w: a.width|0, h: a.height|0 }, tools: { x: b2.x|0, y: b2.y|0, w: b2.width|0, h: b2.height|0 }, xOverlap: xOverlap|0, yOverlap: yOverlap|0, overlapArea: (xOverlap * yOverlap)|0 };
    });
    r.overlap = overlap;
    r.steps.push('overlap=' + JSON.stringify(overlap));

    // 3) 点击顶栏牧场按钮打开牧场
    await p.waitForSelector('.ranch-entry', { timeout: 5000 });
    await p.click('.ranch-entry');
    await p.waitForSelector('.ranch-overlay', { timeout: 10000 });
    await p.waitForTimeout(5000);   // 等 env + (可能的) 房屋/动物加载
    r.steps.push('ranch_opened');
    await p.screenshot({ path: OUT + '/ranch_initial.png' });

    // 4) 没有房屋就建造（先签到领金币 300，再建 120）
    let dbg = await p.evaluate(() => window.__ranchDebug || {});
    if (!dbg.animalCount || dbg.animalCount < 7) {
      const claim = await p.$('button:has-text("领取每日金币")');
      if (claim) { await claim.click().catch(() => {}); await p.waitForTimeout(600); r.steps.push('daily_claimed coins=' + (await p.evaluate(() => window.__ranchDebug?.coins))); }
      const build = await p.$('button:has-text("建造一层小屋")');
      if (build) {
        const dis = await build.isDisabled().catch(() => true);
        if (!dis) { await build.click(); r.steps.push('house_built_btn_clicked'); }
        else r.steps.push('build_disabled');
      } else r.steps.push('no_build_btn');
      await p.waitForTimeout(5000);
    }

    // 5) 等待动物到位（轮询 __ranchDebug.animalCount >= 7）
    let ready = false;
    for (let i = 0; i < 30; i++) {
      dbg = await p.evaluate(() => window.__ranchDebug || {});
      if ((dbg.animalCount || 0) >= 7) { ready = true; r.steps.push('animals_ready_i=' + i); break; }
      await p.waitForTimeout(500);
    }
    r.animalCount = (await p.evaluate(() => window.__ranchDebug?.animalCount)) || 0;

    if (ready) {
      // 帧号驱动的等待：headless + swiftshader 渲染极慢（<1fps），不能按墙钟时间判断；
      // 改为等待 __animDbg.frame 累计推进 N 帧，确保动物有足够帧数真正「走起来」
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
      const adv0 = await waitFrames(20, 40000);   // 先攒 20 帧「热身」
      // t0 位姿快照
      const t0 = await p.evaluate(() => (window.__ranchDebug?.animals || []).map(a => ({ c: a.code, x: a.x, z: a.z, y: a.y, ry: a.ry, rx: a.rx, busy: a.busy, eating: a.eating })));
      const animDbg0 = await p.evaluate(() => window.__animDbg);
      r.t0 = t0; r.animDbg0 = animDbg0;
      await p.screenshot({ path: OUT + '/ranch_t0.png' });
      const adv1 = await waitFrames(80, 90000);   // 再攒 80 帧，足以让动物游走一段
      const t1 = await p.evaluate(() => (window.__ranchDebug?.animals || []).map(a => ({ c: a.code, x: a.x, z: a.z, y: a.y, ry: a.ry, rx: a.rx, busy: a.busy, eating: a.eating })));
      const animDbg1 = await p.evaluate(() => window.__animDbg);
      r.t1 = t1; r.animDbg1 = animDbg1;
      r.framesAccum = { warmup: adv0, measured: adv1 };
      await p.screenshot({ path: OUT + '/ranch_t1.png' });

      // 统计：位移 > 0.15 单位 的动物数；俯仰变化（吃草/bob）数；是否都在围栏内
      let moved = 0, pitched = 0, inFence = 0, fishHover = 0;
      for (let i = 0; i < t0.length; i++) {
        const dx = t1[i].x - t0[i].x, dz = t1[i].z - t0[i].z;
        if (Math.hypot(dx, dz) > 0.15) moved++;
        if (Math.abs(t1[i].rx - t0[i].rx) > 0.1) pitched++;
        if (Math.hypot(t1[i].x, t1[i].z) < 4.5) inFence++;
        if (t1[i].c === 'fish' && t1[i].y > 0.2) fishHover++;
      }
      r.moved = moved; r.pitched = pitched; r.inFence = inFence; r.fishHover = fishHover;
      r.steps.push('moved=' + moved + '/7  pitched=' + pitched + '/7  inFence=' + inFence + '/7  fishHover=' + fishHover);
      r.wanderOk = moved >= 2;           // 3.5s 内至少 2 只移动
      r.fenceOk = inFence === t0.length;  // 全部在围栏内
      r.eatOk = pitched >= 1;             // 至少 1 只俯仰变化（吃草或 bob）
    } else {
      r.wanderOk = false; r.fenceOk = false; r.eatOk = false;
      r.steps.push('animals_not_ready');
    }

    // 天空 / 围栏 几何统计（sceneChildren 应该 > 7 + 环境物体）
    r.sceneStats = await p.evaluate(() => {
      const d = window.__ranchDebug || {};
      return { sceneChildren: d.sceneChildren, fenceRadius: d.fenceRadius };
    });

    r.ok = r.consoleErrors.length === 0 && r.pageErrors.length === 0 && r.wanderOk && r.fenceOk;
    r.summary = {
      consoleErrors: r.consoleErrors.length,
      pageErrors: r.pageErrors.length,
      overlap: r.overlap?.overlapArea ?? -2,
      animalCount: r.animalCount,
      moved: r.moved,
      inFence: r.inFence,
      sceneChildren: r.sceneStats?.sceneChildren,
      // 诊断：animate 帧号 + 第一只动物的 raw 位置
      animFrames: (r.animDbg1?.frame ?? -1) - (r.animDbg0?.frame ?? -1),
      firstPos_t0: r.animDbg0?.first ? `(${r.animDbg0.first.px.toFixed(3)}, ${r.animDbg0.first.pz.toFixed(3)}) -> target(${r.animDbg0.first.tx.toFixed(2)}, ${r.animDbg0.first.tz.toFixed(2)})` : 'null',
      firstPos_t1: r.animDbg1?.first ? `(${r.animDbg1.first.px.toFixed(3)}, ${r.animDbg1.first.pz.toFixed(3)})` : 'null'
    };
  } catch (e) { r.fatal = String(e?.stack || e); }
  require('fs').writeFileSync(OUT + '/result.json', JSON.stringify(r, null, 2));
  console.log('SUMMARY:', JSON.stringify(r.summary || {fatal: r.fatal}, null, 2));
  try { if (b) await Promise.race([b.close(), new Promise(res => setTimeout(res, 3000))]); } catch (_) {}
  process.exit(r.fatal ? 1 : 0);
})();
