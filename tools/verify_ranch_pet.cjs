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
    args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
           '--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu-sandbox']
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
  // 等模型加载 + 动物就位（轮询 animalCount，避免固定 sleep 的时序竞态）
  for (let i = 0; i < 50; i++) {
    const d = await page.evaluate(() => (window).__ranchDebug || null);
    if (d && d.animalCount > 0) break;
    await sleep(300);
  }
  await sleep(2000); // 额外稳一下，让鱼游到稳定相位、贴图就位

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
  const fovY = 50 * Math.PI / 180, ty = Math.tan(fovY / 2), aspect = W / H;
  // 相机（与 ranch.component.initThree 一致；v52 改为高位 3/4 俯视以容纳围栏外鱼池）：
  // position(0,9,12) lookAt(-2,1.5,1) up(0,1,0) fov=50°
  const C = [0, 9, 12], Tg = [-2, 1.5, 1], Up = [0, 1, 0];
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
    // 高位 3/4 俯视相机下，动物 mesh 在屏幕上的"足迹"比 pivot 地面投影点更高：
    // 陆生动物高 ~1.7（身体中心 y≈0.85）、鱼高 ~1.0，若只投影 pivot(y≈0, 脚) 会打到 mesh 下方的空地而 miss。
    // 故对每只动物在多个 y 高度投影，并在投影点附近做小幅像素扰动，命中即停（petUntil 是 2s 窗口，命中立即可见）。
    const yCandidates = [0.3, 0.7, 1.1, 1.5];
    const jitter = [[0,0],[9,0],[-9,0],[0,9],[0,-9],[13,13],[-13,-13]];
    for (let i = 0; i < dbgA.animals.length && !petHit; i++) {
      const a = dbgA.animals[i];
      for (const yOff of yCandidates) {
        const sp = project([a.x, yOff, a.z]);
        if (!sp) continue;
        let hitThis = false;
        for (const [jx, jy] of jitter) {
          const sx = sp.sx + jx, sy = sp.sy + jy;
          await clickAtScreen(sx, sy);
          await sleep(70);                       // 命中后 petUntil 立即可见，无需长等
          const d = await page.evaluate(() => (window).__ranchDebug || null);
          if (d && d.animals) {
            const hitIdx = d.animals.findIndex(x => x.petting === true);
            if (hitIdx !== -1) {
              const ha = d.animals[hitIdx];
              petHit = { rx: ha.rx, code: ha.code, idx: hitIdx, clicked: i, yOff };
              log('  HIT animal', i, a.code, 'yOff', yOff, 'jitter', jx + '/' + jy,
                  '-> screen', sx.toFixed(0), sy.toFixed(0), 'petIdx', hitIdx, '(' + ha.code + ')');
              hitThis = true; break;
            }
          }
        }
        if (hitThis) break;
      }
    }
  }
  log('D3 petHit =', JSON.stringify(petHit));

  let rxDuringPet = null;
  if (petHit) {
    // 抓住低头窗口内的 rx（命中后 2s 窗口内持续低头，此处采样 8×150ms≈1.2s 足够）
    for (let k = 0; k < 8; k++) {
      await sleep(150);
      const d = await page.evaluate(() => (window).__ranchDebug || null);
      if (d && d.animals && d.animals[petHit.idx]) {
        const a = d.animals[petHit.idx];
        if (a.petting) rxDuringPet = a.rx;
      }
    }
    petHit.rxDuringPet = rxDuringPet;
  }

  // 先写判定结果（最关键），截图/关浏览器放最后且尽力而为，避免受限环境下 WebGL 崩溃导致结果丢失
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

  try { await page.screenshot({ path: OUT + '/ranch_view.png' }); } catch (e) { log('screenshot skipped:', e && e.message); }
  await browser.close().catch(() => {});
})().catch(e => { console.error('FATAL', e && e.stack || e); try { require('fs').writeFileSync('D:/pet/tools/ranch_pet/result.json', JSON.stringify({ fatal: String(e && e.stack || e) }, null, 2)); } catch {} process.exit(1); });
