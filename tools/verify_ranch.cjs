/**
 * 牧场功能在游戏内验证脚本（Playwright + 系统 Chrome）
 *
 * 验证链路（对应需求的"在游戏中检查动物模型是否可用"）：
 *   1. 登录（kejingyuan / abc123）
 *   2. 点击左上方"进入牧场"按钮
 *   3. 领取每日金币（300）→ 满足建屋 120 金门槛
 *   4. 建造一层小屋（house.owned=true 后，展厅加载 7 个动物 GLB + 房屋 GLB）
 *   5. 拦截所有 .glb / draco 网络请求，断言全部 HTTP 200、无 404、无 console / page error
 *   6. 截图保存渲染结果
 *   7. 购买一只动物，断言"已拥有"计数 +1
 *
 * 运行：node tools/verify_ranch.cjs
 */
const { chromium } = require('C:/Users/WIN11/.workbuddy/binaries/node/workspace/node_modules/playwright');

const BASE = 'http://127.0.0.1:4200';
const USER = 'kejingyuan';
const PASS = 'abc123';

// 8 个必须成功加载的 GLB（房屋 t1 + 7 个动物），路径相对站点根
const NEEDED = [
  'assets/models/houses/house_t1.glb',
  'assets/models/animals/hy3_cat_draco.glb',
  'assets/models/animals/hy3_dog_draco.glb',
  'assets/models/animals/hy3_chicken_draco.glb',
  'assets/models/animals/hy3_duck_draco.glb',
  'assets/models/animals/hy3_cow_draco.glb',
  'assets/models/animals/hy3_sheep_draco.glb',
  'assets/models/animals/hy3_fish_draco.glb'
];

(async () => {
  const result = {
    loginOk: false,
    ranchOpened: false,
    houseBuilt: false,
    dailyClaimed: false,
    glbStatus: {},
    glbAll200: false,
    any404: false,
    consoleErrors: [],
    pageErrors: [],
    ownedBefore: 0,
    ownedAfter: 0,
    buyOk: false,
    screenshot: '',
    fatal: '',
    launchError: ''
  };

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist'
      ]
    });
  } catch (e) {
    result.launchError = String(e && e.stack ? e.stack : e);
    console.log('=== RANCH VERIFY RESULT ===');
    console.log(JSON.stringify(result, null, 2));
    console.log('=== VERDICT: FAIL ❌ (browser launch failed) ===');
    process.exit(1);
  }

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    page.on('response', (r) => {
      const u = r.url();
      if (u.includes('.glb') || u.includes('draco')) {
        const rel = u.replace(BASE, '').replace(/^\//, '');
        result.glbStatus[rel] = r.status();
        if (r.status() === 404) result.any404 = true;
      }
    });
    page.on('console', (m) => {
      if (m.type() === 'error') result.consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => result.pageErrors.push(e.message));

    // 1. 打开首页（未登录 → 登录页）
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // 2. 登录
    await page.fill('input[placeholder="用户名"]', USER);
    await page.fill('input[type="password"]', PASS);
    await page.click('button.btn-login');
    await page.waitForSelector('.app-shell', { timeout: 15000 });
    result.loginOk = true;

    // 3. 点击左上方"进入牧场"
    await page.click('.enter-ranch-btn');
    await page.waitForSelector('.ranch-overlay', { timeout: 10000 });
    result.ranchOpened = true;
    await page.waitForTimeout(800);

    // 4. 若未拥有房屋：先领每日金币，再建造
    const ownedAlready = await page.$('.rh-tier');
    if (!ownedAlready) {
      const claimBtn = await page.$('.rh-claim');
      if (claimBtn) {
        await claimBtn.click();
        await page.waitForTimeout(600);
        result.dailyClaimed = true;
      }
      const buildBtn = await page.$('.rh-btn');
      if (buildBtn) {
        const txt = await buildBtn.innerText();
        if (txt.includes('建造')) {
          const disabled = await buildBtn.isDisabled();
          if (!disabled) {
            await buildBtn.click();
            await page.waitForTimeout(900);
            const tier = await page.$('.rh-tier');
            result.houseBuilt = !!tier;
          }
        }
      }
    } else {
      result.houseBuilt = true;
    }

    // 5. 等待 8 个 GLB 加载完成（轮询，最多 25s）
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      const all200 = NEEDED.every(n => result.glbStatus[n] === 200);
      if (NEEDED.every(n => n in result.glbStatus) && all200) break;
      if (result.any404) break;
      await page.waitForTimeout(500);
    }
    result.glbAll200 = NEEDED.every(n => result.glbStatus[n] === 200);
    result.any404 = NEEDED.some(n => result.glbStatus[n] === 404);

    // 6. 截图
    const shotPath = 'D:/pet/tools/ranch_verify.png';
    await page.screenshot({ path: shotPath });
    result.screenshot = shotPath;

    // 7. 购买一只动物
    result.ownedBefore = await page.$$eval('.si-owned', els => els.length).catch(() => 0);
    const buyBtn = await page.$('.si-buy:not([disabled])');
    if (buyBtn) {
      await buyBtn.click();
      await page.waitForTimeout(600);
      result.ownedAfter = await page.$$eval('.si-owned', els => els.length).catch(() => 0);
      result.buyOk = result.ownedAfter > result.ownedBefore;
    }
  } catch (err) {
    result.fatal = String(err && err.stack ? err.stack : err);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  const pass = result.loginOk && result.ranchOpened && result.houseBuilt &&
    result.glbAll200 && !result.any404 &&
    result.consoleErrors.length === 0 && result.pageErrors.length === 0 &&
    result.buyOk;
  console.log('=== RANCH VERIFY RESULT ===');
  console.log(JSON.stringify(result, null, 2));
  console.log('=== VERDICT: ' + (pass ? 'PASS ✅' : 'FAIL ❌') + ' ===');
  process.exit(pass ? 0 : 1);
})();
