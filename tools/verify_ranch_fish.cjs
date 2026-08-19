// RANCH-FISH-DB-001 前端视觉验证：鱼必须在鱼池（~8,4，围栏外），围栏内只有 6 只陆生动物
// 复用 v51 QA 的浏览器启动 + 登录 + 进牧场流程
const PW = require('C:/Users/WIN11/.workbuddy/binaries/node/versions/22.22.2/node_modules/@playwright/cli/node_modules/playwright');
const fs = require('fs');

const FRONTEND = 'http://127.0.0.1:4200';
const USER = 'kejingyuan';
const PASS = 'abc123';
const OUT = 'D:/pet/tools/ranch_fish';
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
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERR: ' + e.message));

  // 1) 登录
  await page.goto(FRONTEND + '/', { waitUntil: 'networkidle', timeout: 60000 });
  const inputs = await page.locator('input');
  await inputs.nth(0).fill(USER);
  await inputs.nth(1).fill(PASS);
  await page.click('.btn-login');
  await page.waitForSelector('nav.nav', { timeout: 20000 });

  // 2) 进大世界
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('nav.nav button')].find(x => x.textContent.includes('大世界'));
    if (b) b.click();
  });
  await page.waitForSelector('app-world3d .world3d-mount canvas', { timeout: 30000 });
  await sleep(2500);

  // 3) 进牧场
  await page.evaluate(() => { const b = document.querySelector('.ranch-btn'); if (b) b.click(); });
  await page.waitForSelector('.ranch-stage canvas', { timeout: 20000 });

  // 4) 等动物就位（animalCount===7：6 陆生 + 1 鱼）
  let dbg = null;
  for (let i = 0; i < 40; i++) {
    dbg = await page.evaluate(() => (window).__ranchDebug || null);
    if (dbg && dbg.animalCount >= 7) break;
    await sleep(300);
  }
  await sleep(1500); // 让鱼游动几帧，确认稳定在水池圆周
  dbg = await page.evaluate(() => (window).__ranchDebug || null);
  log('animalCount =', dbg && dbg.animalCount);

  const animals = (dbg && dbg.animals) ? dbg.animals : [];
  const fish = animals.filter(a => a.code === 'fish');
  const land = animals.filter(a => a.code !== 'fish');
  const dist = (a) => Math.hypot(a.x || 0, a.z || 0);
  const distPond = (a) => Math.hypot((a.x || 0) - (-6), (a.z || 0) - 5);  // 鱼池中心 (-6, 5)

  const fishInPond = fish.length === 1 && dist(fish[0]) > 5 && distPond(fish[0]) < 2.2; // 在池周半径1.6附近
  const landInPaddock = land.length === 6 && land.every(a => dist(a) <= 4.85 + 0.01);
  const noPaddockFish = fish.length === 1 && dist(fish[0]) > 4.85; // 鱼绝不在围栏内

  log('fish count =', fish.length, 'land count =', land.length);
  if (fish[0]) log('fish pos =', fish[0].x, fish[0].z, 'distCenter=', dist(fish[0]).toFixed(2), 'distPond=', distPond(fish[0]).toFixed(2));
  land.forEach(a => log('  land', a.code, 'dist=', dist(a).toFixed(2)));

  // 关键控制台错误（排除无关噪声）：聚焦与渲染/模型/着色器相关的报错
  const fatal = errors.filter(e => /shader|webgl|three|model|gltf|loadModel|undefined|TypeError|ReferenceError|NG0|Failed to compile/i.test(e));
  log('console errors total =', errors.length, 'fatal-ish =', fatal.length);
  fatal.slice(0, 10).forEach(e => log('  ERR:', e));

  const result = {
    allPass: animals.length === 7 && fishInPond && landInPaddock && noPaddockFish && fatal.length === 0,
    animalCount: dbg ? dbg.animalCount : 0,
    fishCount: fish.length,
    landCount: land.length,
    fishInPond, landInPaddock, noPaddockFish,
    fatalErrors: fatal,
    allErrors: errors
  };
  // 先写判定结果（最关键），截图放最后且尽力而为 —— 受限环境下 WebGL 截图可能崩溃导致结果丢失
  fs.writeFileSync(OUT + '/result.json', JSON.stringify(result, null, 2));
  log('RESULT', JSON.stringify(result, null, 2));

  try { await page.screenshot({ path: OUT + '/ranch_view.png' }); } catch (e) { log('screenshot skipped:', e && e.message); }
  await browser.close().catch(() => {});
  process.exit(result.allPass ? 0 : 1);
})().catch(e => { console.error('FATAL', e && e.stack || e); try { require('fs').writeFileSync('D:/pet/tools/ranch_fish/result.json', JSON.stringify({ fatal: String(e && e.stack || e) }, null, 2)); } catch {} process.exit(1); });
