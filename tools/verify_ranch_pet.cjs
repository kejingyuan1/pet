// 阶段 F QA：牧场鼠标小手 + 点击抚摸低头 + 去掉随机低头
// 真实浏览器 e2e，复用 stage_e 登录流程
const PW = require('C:/Users/WIN11/.workbuddy/binaries/node/versions/22.22.2/node_modules/@playwright/cli/node_modules/playwright');
const fs = require('fs');

const FRONTEND = 'http://127.0.0.1:4200';
const USER = 'kejingyuan';
const PASS = 'abc123';
const OUT = 'D:/pet/tools/ranch_pet';
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await PW.chromium.launch({
    executablePath: 'C:/Users/WIN11/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',
    args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); else if (m.text().includes('[pet-debug]')) log('  >>', m.text()); });
  page.on('pageerror', e => errors.push('PAGEERR: ' + e.message));

  // 1) 登录
  await page.goto(FRONTEND + '/', { waitUntil: 'networkidle', timeout: 60000 });
  const inputs = await page.locator('input');
  await inputs.nth(0).fill(USER);
  await inputs.nth(1).fill(PASS);
  await page.click('.btn-login');
  await page.waitForSelector('nav.nav', { timeout: 20000 });

  // 2) 进大世界（页面内触发 Angular click，绕过 canvas 覆盖导致的动作卡死）
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('nav.nav button')].find(x => x.textContent.includes('大世界'));
    if (b) b.click();
  });
  await page.waitForSelector('app-world3d .world3d-mount canvas', { timeout: 30000 });
  await sleep(2500);

  // 3) 进牧场
  await page.evaluate(() => { const b = document.querySelector('.ranch-btn'); if (b) b.click(); });
  await page.waitForSelector('.ranch-stage canvas', { timeout: 20000 });
  await sleep(3000); // 等模型加载 + 动物就位

  // D1：鼠标小手
  const cursor = await page.evaluate(() => {
    const c = document.querySelector('.ranch-stage canvas');
    return c ? getComputedStyle(c).cursor : 'NO_CANVAS';
  });
  log('D1 cursor =', cursor);

  const dbg0 = await page.evaluate(() => (window).__ranchDebug || null);
  const animalCount = dbg0 ? dbg0.animalCount : 0;
  log('animalCount =', animalCount);

  // D2：基线无随机低头（连续采样 rx，取最大 |rx|）
  let maxAbsRx = 0;
  for (let i = 0; i < 18; i++) {
    const d = await page.evaluate(() => (window).__ranchDebug || null);
    if (d && d.animals) for (const a of d.animals) maxAbsRx = Math.max(maxAbsRx, Math.abs(a.rx || 0));
    await sleep(150);
  }
  log('D2 baseline maxAbsRx =', maxAbsRx.toFixed(3));

  // D3：点击抚摸触发低头
  // 用 __ranchDebug 里每只动物的世界坐标 + 已知相机参数，在 node 端重建针孔投影，
  // 精确算出动物在 canvas 上的屏幕坐标，再派发 click（避免粗网格漏掉细网格动物）。
  const box = await page.locator('.ranch-stage canvas').boundingBox();
  const W = box.width, H = box.height, L = box.x, T = box.y;
  const fovY = 45 * Math.PI / 180, ty = Math.tan(fovY / 2), aspect = W / H;
  // 相机：position(0,5.2,13) lookAt(0,2.6,0) up(0,1,0)（与 initThree 一致）
  const C = [0, 5.2, 13], Tg = [0, 2.6, 0], Up = [0, 1, 0];
  const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const norm = a => { const l = Math.hypot(a[0],a[1],a[2]) || 1; return [a[0]/l,a[1]/l,a[2]/l]; };
  const zAxis = norm(sub(C, Tg));               // 指向相机后方
  const xAxis = norm(cross(Up, zAxis));
  const yAxis = cross(zAxis, xAxis);
  const project = (p) => {
    const v = sub(p, C);
    const camX = dot(v, xAxis), camY = dot(v, yAxis), camZ = dot(v, zAxis);
    const dist = -camZ;                       // Three 相机空间：前方点 camZ 为负，距离取 -camZ
    if (dist <= 0.01) return null;
    const ndcX = camX / (dist * ty * aspect);
    const ndcY = camY / (dist * ty);
    return { sx: L + (ndcX + 1) / 2 * W, sy: T + (1 - ndcY) / 2 * H };
  };

  const clickAtScreen = async (sx, sy) => {
    await page.evaluate(([x, y]) => {
      const c = document.querySelector('.ranch-stage canvas');
      c.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
    }, [sx, sy]);
  };

  let petHit = null;
  const dbgA = await page.evaluate(() => (window).__ranchDebug || null);
  if (dbgA && dbgA.animals) {
    for (let i = 0; i < dbgA.animals.length && !petHit; i++) {
      const a = dbgA.animals[i];
      const P = [a.x, (a.y || 0) + 0.9, a.z];   // 用身体中部高度投影
      const sp = project(P);
      if (!sp) continue;
      log('  click animal', i, a.code, '-> screen', sp.sx.toFixed(0), sp.sy.toFixed(0));
      await clickAtScreen(sp.sx, sp.sy);
      for (let k = 0; k < 8; k++) {              // 轮询 ~1.2s，检查「任意」动物是否进入 petting
        await sleep(150);
        const d = await page.evaluate(() => (window).__ranchDebug || null);
        if (d && d.animals) {
          const now = (await page.evaluate(() => performance.now() * 0.001));
          log('    t=', now.toFixed(1), 'petUntil=', d.animals.map(a => a.petUntil).join(','));
          const hitIdx = d.animals.findIndex(a => a.petting === true);
          if (hitIdx !== -1) {
            const ha = d.animals[hitIdx];
            petHit = { rx: ha.rx, code: ha.code, idx: hitIdx, clicked: i }; break;
          }
        }
      }
    }
  }
  log('D3 petHit =', JSON.stringify(petHit));

  let rxDuringPet = null;
  if (petHit) {
    // 抓住低头窗口内的 rx
    for (let k = 0; k < 8; k++) {
      await sleep(150);
      const d = await page.evaluate(() => (window).__ranchDebug || null);
      if (d && d.animals && d.animals[petHit.idx]) {
        const a = d.animals[petHit.idx];
        if (a.petting) rxDuringPet = a.rx;
      }
    }
    // 等 2.2s 看是否回落
    await sleep(2200);
    const d2 = await page.evaluate(() => (window).__ranchDebug || null);
    const after = (d2 && d2.animals && d2.animals[petHit.idx]) ? { rx: d2.animals[petHit.idx].rx, petting: d2.animals[petHit.idx].petting } : null;
    log('D3 rxDuringPet =', rxDuringPet, 'after =', JSON.stringify(after));
    petHit.rxDuringPet = rxDuringPet;
    petHit.after = after;
  }

  await page.screenshot({ path: OUT + '/ranch_view.png' });

  const result = {
    allPass: cursor === 'pointer' && animalCount > 0 && maxAbsRx < 0.15 && !!petHit && (petHit.rxDuringPet ?? 0) > 0.3,
    cursor,
    animalCount,
    baselineMaxAbsRx: +maxAbsRx.toFixed(3),
    petHit,
    errors
  };
  fs.writeFileSync(OUT + '/result.json', JSON.stringify(result, null, 2));
  log('RESULT', JSON.stringify(result, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
