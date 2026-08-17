import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:4200';
const INVITE = 'dudu2019';

const sentInputs = [];      // 发出的 /app/ws.input 帧
const recvSnaps = [];       // 收到的 POSITION_SNAPSHOT 帧（含本地玩家 gx/gz）
let consoleErrors = [];
let pageErrors = [];

function extractJson(text) {
  const i = text.indexOf('{');
  const j = text.lastIndexOf('}');
  if (i < 0 || j < 0) return null;
  try { return JSON.parse(text.slice(i, j + 1)); } catch { return null; }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage',
           '--use-gl=angle', '--use-angle=swiftshader',
           '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
           '--disable-background-timer-throttling',
           '--disable-renderer-backgrounding',
           '--disable-backgrounding-occluded-windows',
           '--disable-features=CalculateNativeWinOcclusion']
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' || t.includes('[animate]')) consoleErrors.push(`[${m.type()}] ${t}`);
  });
  page.on('pageerror', e => pageErrors.push(String(e)));
  page.on('websocket', ws => {
    ws.on('framesent', f => {
      const d = typeof f.payload === 'string' ? f.payload : f.payload.toString();
      if (d.includes('/app/ws.input')) sentInputs.push(d);
    });
    ws.on('framereceived', f => {
      const d = typeof f.payload === 'string' ? f.payload : f.payload.toString();
      if (d.includes('POSITION_SNAPSHOT')) {
        const j = extractJson(d);
        if (j && Array.isArray(j.bodies)) recvSnaps.push(j);
      }
    });
  });

  // 1) 打开首页
  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  // 2) 注册测试账号（通过前端代理 /api → 后端）
  const uname = 'wt' + (Date.now() % 100000);
  const reg = await page.evaluate(async (args) => {
    const r = await fetch('/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: args.u, password: 'Test1234', nickname: args.u,
        confirmPassword: 'Test1234', inviteCode: args.inv,
        education: 'PRIMARY_1', gender: 'M'
      })
    });
    return await r.json();
  }, { u: uname, inv: INVITE });
  console.log('REG resp:', JSON.stringify(reg).slice(0, 300));

  if (!reg || !reg.data || !reg.data.token) {
    console.log('REGISTER FAILED —— 无法进入世界，终止。');
    await browser.close();
    return;
  }
  const uid = reg.data.userId;

  // 3) 写入 localStorage 凭证并刷新
  await page.evaluate((args) => {
    localStorage.setItem('pp_token', args.token);
    localStorage.setItem('pp_user', JSON.stringify({
      userId: args.userId, username: args.u, nickname: args.u,
      role: 'user', coins: 0, education: 'PRIMARY_1', gender: 'M'
    }));
  }, { token: reg.data.token, userId: uid, u: uname });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1500);

  // 3.5) 点击「进入大世界」按钮（world3d 组件由 *ngIf=mod==='world' 控制，必须进入）
  try {
    const btn = await page.getByRole('button', { name: /进入大世界|大世界/ }).first();
    await btn.click({ timeout: 8000 });
    console.log('clicked 进入大世界 button');
  } catch (e) {
    console.log('click 进入大世界 failed:', String(e).slice(0, 120));
  }
  await sleep(2000);

  // 4) 等待世界初始化（__worldDebug.player 出现）
  let ready = false;
  try {
    await page.waitForFunction(() => {
      const d = window.__worldDebug;
      return d && d.player && typeof d.player.x === 'number';
    }, { timeout: 25000 });
    ready = true;
  } catch (e) {
    console.log('等待 __worldDebug.player 超时');
  }
  if (!ready) {
    console.log('WORLD NOT READY. errors=', pageErrors.slice(0,5));
    await browser.close();
    return;
  }

  // 读取初始位置
  const p0 = await page.evaluate(() => ({ ...window.__worldDebug.player }));
  console.log('P0 (before W):', JSON.stringify(p0));

  // 截图：进入世界初始画面（肉眼看树/岛/玩家）
  await sleep(1500);
  await page.screenshot({ path: 'C:/Users/ken/WorkBuddy/2026-08-05-19-13-32/pet/_shot_initial.png' });
  console.log('SAVED _shot_initial.png');

  // 聚焦页面（确保键盘事件进入 window）
  await page.mouse.click(640, 400);
  await sleep(300);

  // 5) 按住 W 6 秒，每 1 秒采样一次轨迹（确认位置是否持续累积）
  await page.keyboard.down('w');
  const traj = [];
  for (let i = 0; i < 6; i++) {
    await sleep(1000);
    const pp = await page.evaluate(() => ({ ...window.__worldDebug.player }));
    traj.push({ t: i + 1, x: +pp.x.toFixed(2), z: +pp.z.toFixed(2) });
    console.log(`  t=${i + 1}s  pos=(${pp.x.toFixed(2)}, ${pp.z.toFixed(2)})`);
  }
  await page.keyboard.up('w');
  // 截图：按 W 移动后画面
  await page.screenshot({ path: 'C:/Users/ken/WorkBuddy/2026-08-05-19-13-32/pet/_shot_after_w.png' });
  console.log('SAVED _shot_after_w.png');
  const p1 = traj[traj.length - 1];
  console.log('TRAJ:', JSON.stringify(traj));

  const dx = (p1.x - p0.x), dz = (p1.z - p0.z);
  const moved = Math.hypot(dx, dz);
  console.log(`TOTAL DELTA over 6s = (${dx.toFixed(2)}, ${dz.toFixed(2)})  dist=${moved.toFixed(2)}`);
  console.log('MOVED? ', moved > 1.0 ? 'YES ✅' : 'NO ❌');

  // 6) 诊断信息
  console.log('--- DIAG ---');
  console.log('sent /app/ws.input frames:', sentInputs.length);
  if (sentInputs.length) console.log('  sample:', sentInputs[0].slice(0, 160));
  console.log('received POSITION_SNAPSHOT frames:', recvSnaps.length);
  if (recvSnaps.length) {
    // 找本地玩家在快照里的 gx/gz 变化
    const mine = recvSnaps.map(s => {
      const b = s.bodies.find(b => Number(b.uid) === Number(uid));
      return b ? { gx: +b.gx.toFixed(2), gz: +b.gz.toFixed(2) } : null;
    }).filter(Boolean);
    const first = mine[0], last = mine[mine.length - 1];
    console.log('  snapshot player first:', JSON.stringify(first), 'last:', JSON.stringify(last));
    if (first && last) {
      const sd = Math.hypot(last.gx - first.gx, last.gz - first.gz);
      console.log('  server-side player moved dist=', sd.toFixed(2));
    }
  }
  console.log('pageErrors:', pageErrors.length, pageErrors.slice(0, 5));
  console.log('consoleErrors(animated/err):', consoleErrors.length, consoleErrors.slice(0, 8));

  await browser.close();
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(1); });
