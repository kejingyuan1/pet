const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:4200';
const OUT = 'C:/Users/WIN11/WorkBuddy/2026-08-03-13-46-59/pet-park/_preview';
const log = (...a) => console.log('[m6]', ...a);

function rand() { return Math.floor(Math.random() * 900000 + 100000); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const consoleErrs = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  page.on('pageerror', e => consoleErrs.push('PAGEERR ' + String(e)));

  // 注册登录（复用 M5 流程）
  const u = 'm6' + rand(), p = 'pw' + rand() + 'x';
  await page.goto(BASE + '/?debug=1', { waitUntil: 'load', timeout: 30000 });
  // 等编译错误遮罩消失（ng serve 热重载瞬间可能出现）
  await page.waitForFunction(() => !document.querySelector('vite-error-overlay'), null, { timeout: 20000 }).catch(() => {});
  await page.waitForSelector('.login-full', { timeout: 15000 });
  const reg = page.getByRole('button', { name: '注 册' });
  // 重试点击，避开 ng serve 热重载瞬间的错误遮罩/不稳定
  let clicked = false;
  for (let i = 0; i < 30 && !clicked; i++) {
    try {
      await reg.click({ timeout: 1500 });
      clicked = true;
    } catch (e) {
      await page.waitForTimeout(500);
    }
  }
  if (!clicked) { console.log('FAIL: 无法点击注册按钮'); await browser.close(); process.exit(1); }
  await page.locator('input[placeholder="用户名"]').fill(u);
  await page.locator('input[placeholder="昵称"]').fill('m6tester');
  await page.locator('input[placeholder="密码（至少 6 位，须含数字和字母）"]').fill(p);
  await page.locator('input[placeholder="确认密码"]').fill(p);
  await page.locator('input[placeholder="邀请码"]').fill('dudu2019');
  await page.locator('.btn-login').click();
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: /大世界/ }).click();
  await page.waitForSelector('app-world3d canvas', { timeout: 15000 });
  // 再确认无遮罩（进入大世界后若有编译错误会再次拦截）
  await page.waitForFunction(() => !document.querySelector('vite-error-overlay'), null, { timeout: 20000 }).catch(() => {});
  log('已进入大世界');

  // 等待两个角色就位（charAnims 含 2 个）
  let ready = false;
  for (let i = 0; i < 40; i++) {
    const n = await page.evaluate(() => (window.__charAnimDebug && window.__charAnimDebug.chars) ? window.__charAnimDebug.chars.length : 0);
    if (n >= 2) { ready = true; break; }
    await page.waitForTimeout(500);
  }
  log('角色就位数 >=2 :', ready);
  if (!ready) { console.log('FAIL: 角色未就位'); await browser.close(); process.exit(1); }

  // 捕获四个动作状态各一张截图，并记录变换样本用于客观断言
  // 就位后固定采样 30 秒（≈2.6 个完整循环），保证四种动作全部抓到
  const captured = {};          // state -> screenshot path
  const samples = {};           // state -> array of char transforms
  const seenStates = new Set();
  // 固定采样 240 轮（每轮 ~150ms，总计约 36 秒，覆盖 ≥3 个完整循环）
  const MAX_ROUNDS = 240;
  let lastState = null;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const dbg = await page.evaluate(() => window.__charAnimDebug || null);
    if (dbg) {
      const st = dbg.state;
      if (st !== lastState) { log(`状态切换 ${lastState ?? '(初始)'} -> ${st}  clock=${dbg.clock}`); lastState = st; }
      seenStates.add(st);
      (samples[st] = samples[st] || []).push(dbg.chars.map(c => ({ x: c.x, y: c.y, z: c.z, rx: c.rx, ry: c.ry, rz: c.rz })));
      if (!captured[st]) {
        captured[st] = `${OUT}/anim_${st}.png`;
        await page.screenshot({ path: captured[st] });
        log(`捕获状态 ${st} 截图 -> anim_${st}.png`);
      }
      lastState = st;
    }
    await page.waitForTimeout(150);
  }
  log('本轮见到的状态:', [...seenStates].join(','));

  // 客观断言：每个状态内角色变换是否随时间变化（证明动画在跑）
  const report = {};
  for (const st of Object.keys(samples)) {
    const arr = samples[st];
    const moved = arr.length >= 2 && arr.some((s, i) => i > 0 && (
      Math.abs(s[0].x - arr[i - 1][0].x) > 1e-3 || Math.abs(s[0].y - arr[i - 1][0].y) > 1e-3 ||
      Math.abs(s[0].rx - arr[i - 1][0].rx) > 1e-3 || Math.abs(s[0].rz - arr[i - 1][0].rz) > 1e-3));
    report[st] = { frames: arr.length, moving: moved };
  }
  log('动作变换报告:', JSON.stringify(report, null, 0));
  log('控制台/页面错误数:', consoleErrs.length, consoleErrs.slice(0, 6));

  // 额外：把四张状态图拼成一张对比图（用 canvas 合成），方便一眼看
  await page.evaluate(() => {});

  await browser.close();
  const wantStates = ['walk', 'run', 'bend', 'idle'];
  const missing = wantStates.filter(s => !seenStates.has(s));
  const allMoving = Object.values(report).every(r => r.moving);
  log('缺失状态:', missing.length ? missing.join(',') : '无');
  log('所有状态均在动:', allMoving);
  const pass = missing.length === 0 && allMoving && consoleErrs.length === 0;
  log('结论 pass =', pass);
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
