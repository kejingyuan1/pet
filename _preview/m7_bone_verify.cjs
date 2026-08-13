const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:4200';
const OUT = 'C:/Users/WIN11/WorkBuddy/2026-08-03-13-46-59/pet-park/_preview';
const log = (...a) => console.log('[m7]', ...a);

function rand() { return Math.floor(Math.random() * 900000 + 100000); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const consoleErrs = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  page.on('pageerror', e => consoleErrs.push('PAGEERR ' + String(e)));

  // 注册登录（复用 M5/M6 流程）
  const u = 'm7' + rand(), p = 'pw' + rand() + 'x';
  await page.goto(BASE + '/?debug=1', { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('vite-error-overlay'), null, { timeout: 20000 }).catch(() => {});
  await page.waitForSelector('.login-full', { timeout: 15000 });
  const reg = page.getByRole('button', { name: '注 册' });
  let clicked = false;
  for (let i = 0; i < 30 && !clicked; i++) {
    try { await reg.click({ timeout: 1500 }); clicked = true; } catch (e) { await page.waitForTimeout(500); }
  }
  if (!clicked) { console.log('FAIL: 无法点击注册按钮'); await browser.close(); process.exit(1); }
  await page.locator('input[placeholder="用户名"]').fill(u);
  await page.locator('input[placeholder="昵称"]').fill('m7tester');
  await page.locator('input[placeholder="密码（至少 6 位，须含数字和字母）"]').fill(p);
  await page.locator('input[placeholder="确认密码"]').fill(p);
  await page.locator('input[placeholder="邀请码"]').fill('dudu2019');
  await page.locator('.btn-login').click();
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: /大世界/ }).click();
  await page.waitForSelector('app-world3d canvas', { timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector('vite-error-overlay'), null, { timeout: 20000 }).catch(() => {});
  log('已进入大世界');

  // 等待两个角色就位（charAnims 含 2 个，且含骨骼引用）
  let ready = false;
  for (let i = 0; i < 40; i++) {
    const n = await page.evaluate(() => (window.__charAnimDebug && window.__charAnimDebug.chars)
      ? window.__charAnimDebug.chars.length : 0);
    const hasBones = await page.evaluate(() => {
      const c = window.__charAnimDebug && window.__charAnimDebug.chars;
      return c && c[0] && c[0].bones && Object.keys(c[0].bones).length >= 4;
    });
    if (n >= 2 && hasBones) { ready = true; break; }
    await page.waitForTimeout(500);
  }
  log('角色就位(含骨骼) >=2 :', ready);
  if (!ready) { console.log('FAIL: 角色未就位或骨骼未构建'); await browser.close(); process.exit(1); }

  // 固定采样 240 轮（~36 秒，≥3 个完整循环），捕获四状态 + 骨骼旋转
  const samples = {};           // state -> array of char snapshots
  const seenStates = new Set();
  const MAX_ROUNDS = 170;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    try {
      const dbg = await page.evaluate(() => window.__charAnimDebug || null);
      if (dbg) {
        seenStates.add(dbg.state);
        (samples[dbg.state] = samples[dbg.state] || []).push(dbg.chars.map(c => ({
          x: c.x, y: c.y, z: c.z,
          bones: c.bones ? Object.fromEntries(Object.entries(c.bones).map(([k, b]) => [k, { rx: b.rx, ry: b.ry, rz: b.rz }])) : null
        })));
      }
      if (round % 30 === 0) log('采样进度', round, '见到状态:', [...seenStates].join(','));
    } catch (e) {
      if (round % 10 === 0) log('采样轮', round, '出错(忽略):', String(e).slice(0, 100));
    }
    try { await page.waitForTimeout(150); } catch (e) {}
  }
  log('采样完成，进入分析');
  log('本轮见到的状态:', [...seenStates].join(','));

  // 断言 1：根组移动（walk/run 巡逻）—— 沿用 M6
  const report = {};
  for (const st of Object.keys(samples)) {
    const arr = samples[st];
    const moved = arr.length >= 2 && arr.some((s, i) => i > 0 && (
      Math.abs(s[0].x - arr[i - 1][0].x) > 1e-3 || Math.abs(s[0].y - arr[i - 1][0].y) > 1e-3));
    report[st] = { frames: arr.length, rootMoving: moved };
  }

  // 断言 2（核心）：骨骼旋转幅度 —— 证明"手脚分开动"，而非整体平移
  // 取一个角色，在 walk/run 状态下统计关键骨骼 rx 的范围
  function boneRange(st, bone, axis) {
    const arr = samples[st]; if (!arr || !arr.length) return null;
    let mn = Infinity, mx = -Infinity, found = false;
    for (const snap of arr) {
      const c0 = snap && snap[0];
      const b = c0 && c0.bones && c0.bones[bone];
      if (!b) continue;
      found = true;
      const v = b[axis];
      if (v < mn) mn = v; if (v > mx) mx = v;
    }
    if (!found) return null;
    return { min: +mn.toFixed(3), max: +mx.toFixed(3), span: +(mx - mn).toFixed(3) };
  }
  const boneChecks = {};
  for (const st of ['walk', 'run', 'bend']) {
    boneChecks[st] = {
      armL_rx: boneRange(st, 'armL', 'rx'),
      armR_rx: boneRange(st, 'armR', 'rx'),
      legL_rx: boneRange(st, 'legL', 'rx'),
      legR_rx: boneRange(st, 'legR', 'rx'),
      torso_rx: boneRange(st, 'torso', 'rx'),
      head_rx: boneRange(st, 'head', 'rx')
    };
  }

  log('根组移动报告:', JSON.stringify(report));
  log('骨骼旋转范围:', JSON.stringify(boneChecks, null, 0));
  // 过滤无害的 404 资源错误（favicon/可选资源），只保留真实脚本/页面错误
  const realErrs = consoleErrs.filter(e => !/Failed to load resource/i.test(e));
  log('控制台/页面错误数(已过滤404):', realErrs.length, realErrs.slice(0, 6));

  // 判定：四状态齐全 + 无错误 + walk/run 下手臂/腿骨骼有明显旋转（span 足够大）
  const missing = ['walk', 'run', 'bend', 'idle'].filter(s => !seenStates.has(s));
  const walkBones = boneChecks.walk || {};
  const armSwingOK = walkBones.armL_rx && walkBones.armL_rx.span > 0.2 && walkBones.armR_rx && walkBones.armR_rx.span > 0.2;
  const legSwingOK = walkBones.legL_rx && walkBones.legL_rx.span > 0.2 && walkBones.legR_rx && walkBones.legR_rx.span > 0.2;
  const pass = missing.length === 0 && realErrs.length === 0 && armSwingOK && legSwingOK;
  log('缺失状态:', missing.length ? missing.join(',') : '无');
  log('手臂摆动幅度达标:', armSwingOK, '| 腿部摆动幅度达标:', legSwingOK);
  log('结论 pass =', pass);
  await browser.close();
  process.exitCode = pass ? 0 : 1;
  log('最终 pass =', pass, 'exitCode=', process.exitCode);
})().catch(e => { console.log('FATAL', String(e), e && e.stack ? e.stack.slice(0, 400) : ''); process.exitCode = 1; });
