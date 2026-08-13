// M4 前端采矿交互 Playwright 验证
// 流程：登录(注册) → 进入大世界 → 等待矿脉提示 → 采矿模式 → F 键采矿 → 断言能量/背包/toast → 售卖 → 断言售卖成功
// 依赖：playwright + chromium（managed node workspace，走绝对 file:// 路径以绕过 ESM NODE_PATH 限制）
import pw from 'file:///C:/Users/WIN11/.workbuddy/binaries/node/workspace/node_modules/playwright/index.js';
const { chromium } = pw;

const BASE = 'http://localhost:4200';
const INVITE = 'dudu2019';
const rand = Math.floor(100000 + Math.random() * 900000);
const USER = 'm4pw' + rand;
const PASS = 'pw' + rand + 'x'; // 6+ 含字母+数字
const NICK = 'm4tester';

const log = (...a) => console.log('[m4-pw]', ...a);
const errors = [];      // pageerror（未捕获异常，真实 bug）
const consoleErrs = []; // console.error

function parseEnergy(txt) {
  // "⚡ 96/100"
  const m = String(txt).match(/⚡\s*(\d+)\/(\d+)/);
  return m ? { energy: +m[1], max: +m[2] } : null;
}

const result = { pass: false, steps: [], errors: [], consoleErrs: [] };
function step(name, ok, detail) {
  result.steps.push({ name, ok, detail });
  log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch({
  headless: true,
  args: [
    '--ignore-gpu-blocklist',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
  ],
});
const page = await browser.newPage();
page.on('pageerror', e => { errors.push(String(e)); log('PAGEERROR:', String(e)); });
page.on('console', m => { if (m.type() === 'error') { consoleErrs.push(m.text()); log('CONSOLE.ERROR:', m.text()); } });
page.on('response', r => { if (r.status() >= 400) log('HTTP', r.status(), r.url()); });

try {
  // 1) 打开登录页
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('.login-full', { timeout: 15000 });
  step('打开登录页', true);

  // 2) 切到注册 Tab
  await page.getByRole('button', { name: '注 册' }).click();
  await page.waitForTimeout(300);

  // 3) 填写注册表单
  await page.locator('input[placeholder="用户名"]').fill(USER);
  await page.locator('input[placeholder="昵称"]').fill(NICK);
  await page.locator('input[placeholder="密码（至少 6 位，须含数字和字母）"]').fill(PASS);
  await page.locator('input[placeholder="确认密码"]').fill(PASS);
  await page.locator('input[placeholder="邀请码"]').fill(INVITE);
  // 学历默认第一项（PRIMARY_1）
  await page.locator('.btn-login').click();
  log('已提交注册：', USER, PASS);

  // 4) 等待进入主应用（登录成功 → app-shell）
  await page.waitForSelector('.app-shell', { timeout: 15000 });
  step('注册并登录成功', true, USER);

  // 5) 进入大世界
  await page.getByRole('button', { name: /大世界/ }).click();
  await page.waitForSelector('app-world3d', { timeout: 15000 });
  await page.waitForSelector('.world3d-mount', { timeout: 15000 });
  step('进入大世界模块', true);

  // 6) 等待 WS/配置/区块加载 + 矿脉扫描提示（证明出生点附近有矿 + chunk 已载入 gridCache）
  const hintSel = '.w3d-hud .hud-hint';
  let oreHint = false;
  try {
    await page.waitForFunction((sel) => {
      const el = document.querySelector(sel);
      return el && el.textContent && el.textContent.indexOf('附近有矿脉') >= 0;
    }, hintSel, { timeout: 25000 });
    oreHint = true;
  } catch (e) { oreHint = false; }
  const hintTxt = await page.locator(hintSel).innerText().catch(() => '');
  step('出生点附近检测到矿脉(scanNearbyOre)', oreHint, hintTxt);

  // 7) 采矿 HUD 渲染（miningReady）
  await page.waitForSelector('.w3d-mine', { timeout: 10000 });
  const energyBefore = parseEnergy(await page.locator('.energy-text').innerText());
  step('采矿 HUD 渲染(能量/等级/背包)', !!energyBefore, JSON.stringify(energyBefore));

  // 8) 进入采矿模式
  await page.getByRole('button', { name: /⛏️ 采矿/ }).click();
  await page.waitForTimeout(500);
  const mineOn = await page.locator('.w3d-toolbar button.on', { hasText: '采矿' }).count();
  step('进入采矿模式(mineMode)', mineOn > 0);

  // 9) 按 F 键采矿（自动锁定 nearestOre = 出生点旁铁矿）
  await page.keyboard.press('f');
  // 等 MINE_RESULT → toast 出现
  let toastTxt = '';
  try {
    await page.waitForSelector('.w3d-toast', { timeout: 8000 });
    toastTxt = await page.locator('.w3d-toast').innerText();
  } catch (e) { toastTxt = ''; }
  await page.waitForTimeout(500);
  // 等待 HUD 经 loadMiningProfile 异步刷新（能量下降至 <100）
  try {
    await page.waitForFunction(() => {
      const el = document.querySelector('.energy-text');
      if (!el) return false;
      const m = el.textContent.match(/⚡\s*([0-9]+)\//);
      return m && parseInt(m[1], 10) < 100;
    }, { timeout: 8000 });
  } catch (e) { /* 继续，下面断言会反映 */ }
  const energyAfter = parseEnergy(await page.locator('.energy-text').innerText());
  step('F 键采矿触发 MINE_RESULT(toast)', toastTxt.indexOf('采到') >= 0, toastTxt);
  step('能量扣减(<100, 已扣 4)', energyBefore && energyAfter && energyAfter.energy < energyBefore.energy,
       `before=${energyBefore?.energy} after=${energyAfter?.energy}`);

  // 10) 打开背包查看采矿所得
  await page.locator('.mine-sell-toggle').click(); // 💰 背包
  await page.waitForSelector('.mine-inv', { timeout: 5000 });
  // 等待背包条目出现（loadMiningProfile 异步刷新）
  try { await page.waitForSelector('.inv-row', { timeout: 8000 }); } catch (e) {}
  const invCount = await page.locator('.inv-row').count();
  const invName = invCount > 0 ? await page.locator('.inv-row .inv-name').first().innerText() : '';
  step('背包出现矿石条目', invCount > 0, `${invCount} 条 / ${invName}`);

  // 11) 售卖（整组）换积分
  let sellToast = '';
  if (invCount > 0) {
    await page.locator('.inv-sell').first().click();
    try {
      await page.waitForFunction(() => {
        const el = document.querySelector('.w3d-toast');
        return el && el.textContent && el.textContent.indexOf('售卖获得') >= 0;
      }, { timeout: 8000 });
      sellToast = await page.locator('.w3d-toast').innerText();
    } catch (e) { sellToast = ''; }
    // 等待背包清空（loadMiningProfile 刷新）
    try { await page.waitForFunction(() => document.querySelectorAll('.inv-row').length === 0, { timeout: 8000 }); } catch (e) {}
  }
  step('售卖矿石成功(toast)', sellToast.indexOf('售卖获得') >= 0, sellToast);
  // 背包应清空或该项消失
  const invAfterSell = await page.locator('.inv-row').count();
  step('售卖后背包清空', invAfterSell === 0, `剩余 ${invAfterSell} 条`);

  // 截图存档
  await page.screenshot({ path: 'm4_pw_verify.png', fullPage: false });
  log('截图已保存 m4_pw_verify.png');

  // 结论：以 M4 功能步骤为准；未捕获异常单独上报（若出现在 world3d 上下文需排查）
  const critical = result.steps.filter(s => !s.ok && ['注册并登录成功','进入大世界模块','采矿 HUD 渲染(能量/等级/背包)','进入采矿模式(mineMode)','F 键采矿触发 MINE_RESULT(toast)','能量扣减(100→96)','背包出现矿石条目','售卖矿石成功(toast)','售卖后背包清空'].includes(s.name));
  result.pass = critical.length === 0;
  result.errors = errors;
  result.consoleErrs = consoleErrs;
  result.criticalFail = critical.length;
  log('未捕获异常数:', errors.length, ' console.error 数:', consoleErrs.length, ' 关键步骤失败:', critical.length);
} catch (e) {
  step('异常中断', false, String(e));
  result.pass = false;
  try { await page.screenshot({ path: 'm4_pw_verify_fail.png' }); } catch {}
} finally {
  await browser.close();
  console.log('\n=== M4_PW_RESULT_JSON ===');
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.pass ? 0 : 1);
}
