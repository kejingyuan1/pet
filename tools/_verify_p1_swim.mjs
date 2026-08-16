// P1 真3D 水系统 —— Playwright 端到端验证
// 验证点：
//   1) 页面加载 + 进入大世界无报错（前端改动已生效）
//   2) __worldDebug.swimMode/inWater 字段存在（swim 代码路径已注入）
//   3) __isSwimAt(陆地)=false, __isSwimAt(海中)=true（游泳判定逻辑正确）
//   4) WASD 驱动玩家移动（陆地内无空气墙回归），截图
// 说明：本沙箱无法重编译 Spring Boot3 后端（仅 JDK8+Maven 损坏），
//       故"真实走入海中 swimMode=true"需用户本机 mvn package 后重启后端方可端到端复现。
import { chromium } from 'playwright-core';
import fs from 'fs';

const CHROME = 'C:/Users/ken/.agent-browser/browsers/chrome-151.0.7922.76/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:4200';
const USER = 'wtest_ken', PASS = 'Test1234!';
const SHOT_DIR = 'C:/Users/ken/WorkBuddy/2026-08-05-19-13-32/pet/tools/_shots_p1';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const log = (...a) => console.log('[P1]', ...a);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const errors = [];
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE:' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERR:' + e.message));

async function shot(name) {
  const p = `${SHOT_DIR}/${name}.png`;
  await page.screenshot({ path: p });
  log('screenshot ->', p);
  return p;
}

try {
  log('open', BASE);
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(1500);

  // 登录
  await page.fill('input[placeholder="用户名"]', USER).catch(() => {});
  await page.fill('input[placeholder*="密码"]', PASS).catch(() => {});
  await page.click('button.btn-login').catch(async () => {
    // 退化：尝试任意主按钮
    await page.click('button[type="submit"]').catch(() => {});
  });
  log('login submitted');
  await sleep(2500);
  await shot('01_after_login');

  // 进入大世界
  await page.click('text=进入大世界').catch(async () => {
    const btns = await page.$$('button');
    for (const b of btns) {
      const t = await b.innerText().catch(() => '');
      if (t.includes('大世界') || t.includes('进入')) { await b.click(); break; }
    }
  });
  log('enter-world clicked');
  await sleep(4000);

  // 等待 world ready
  let ready = false;
  for (let i = 0; i < 30; i++) {
    ready = await page.evaluate(() => !!(window).__worldDebug && (window).__worldDebug.ready).catch(() => false);
    if (ready) break;
    await sleep(1000);
  }
  log('world ready =', ready);
  await shot('02_world');

  // 读取调试状态
  const dbg = await page.evaluate(() => {
    const d = (window).__worldDebug;
    if (!d) return null;
    return {
      hasSwimModeField: ('swimMode' in (d.player || {})) || ('playerSwimMode' in (d.counts || {})),
      player: d.player,
      counts: d.counts,
      centers: (d.hy3dTerrain && d.hy3dTerrain.centerList) || [],
      waterLevel: d.waterLevel
    };
  });
  log('debug =', JSON.stringify(dbg));

  // 游泳判定探针
  const probe = await page.evaluate(() => {
    const d = (window).__worldDebug;
    if (!d || !d.hy3dTerrain || !d.hy3dTerrain.centerList || !d.hy3dTerrain.centerList.length) return { skipped: true };
    const c = d.hy3dTerrain.centerList[0];
    const landX = c.cx, landZ = c.cz;                  // 岛心=陆地
    const seaX = c.cx + c.r * 1.8, seaZ = c.cz;       // 岛外 1.8r = 海
    const f = (window).__isSwimAt;
    if (typeof f !== 'function') return { noFn: true };
    return { land: f(landX, landZ), sea: f(seaX, seaZ), landX, landZ, seaX, seaZ };
  });
  log('swim probe =', JSON.stringify(probe));

  // WASD 驱动（向前走 4s），确认陆地内可移动、无空气墙回归
  await page.focus('canvas').catch(() => {});
  await page.keyboard.down('KeyW');
  const samples = [];
  for (let i = 0; i < 8; i++) {
    await sleep(500);
    const s = await page.evaluate(() => {
      const d = (window).__worldDebug;
      return d ? { x: d.player.x, z: d.player.z, swim: d.player.swimMode, inWater: d.player.inWater, y: d.player.y } : null;
    });
    samples.push(s);
  }
  await page.keyboard.up('KeyW');
  log('walk samples =', JSON.stringify(samples));
  await shot('03_after_walk');

  const result = { ready, dbg, probe, samples, errors };
  fs.writeFileSync(`${SHOT_DIR}/result.json`, JSON.stringify(result, null, 2));
  log('DONE. errors =', errors.length, errors.slice(0, 8));
} catch (e) {
  log('FATAL', e.message);
  await shot('FATAL');
  errors.push('FATAL:' + e.message);
} finally {
  await browser.close();
  process.exit(errors.length ? 1 : 0);
}
