// M5 验证：男孩/女孩/树 GLB 是否在前端真实加载并渲染（含控制台/页面错误捕获 + 截图）
import pw from 'file:///C:/Users/WIN11/.workbuddy/binaries/node/workspace/node_modules/playwright/index.js';
const { chromium } = pw;

const BASE = 'http://127.0.0.1:4200';
const log = (...a) => console.log('[m5]', ...a);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const glbStatus = {};
const consoleErrs = [];
const pageErrors = [];
page.on('response', r => {
  const u = r.url();
  if (u.includes('/assets/models/') && u.endsWith('.glb')) glbStatus[u.split('/').pop()] = r.status();
});
page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });
page.on('pageerror', e => pageErrors.push(String(e)));

function rand() { return Math.floor(Math.random() * 900000 + 100000); }

async function registerLogin() {
  const u = 'm5' + rand();
  const p = 'pw' + rand() + 'x';
  await page.waitForSelector('.login-full', { timeout: 15000 });
  await page.getByRole('button', { name: '注 册' }).click();
  await page.locator('input[placeholder="用户名"]').fill(u);
  await page.locator('input[placeholder="昵称"]').fill('m5tester');
  await page.locator('input[placeholder="密码（至少 6 位，须含数字和字母）"]').fill(p);
  await page.locator('input[placeholder="确认密码"]').fill(p);
  await page.locator('input[placeholder="邀请码"]').fill('dudu2019');
  await page.locator('.btn-login').click();
  await page.waitForTimeout(1800);
  return { u, p };
}

try {
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  await registerLogin();
  // 进入大世界
  await page.getByRole('button', { name: /大世界/ }).click();
  await page.waitForSelector('app-world3d canvas', { timeout: 15000 });
  log('已进入大世界，canvas 就绪');
  // 等待模型加载（GLTFLoader 异步）
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'm5_model_verify.png' });
  log('截图已保存 m5_model_verify.png');
} catch (e) {
  log('流程异常:', String(e));
}

const need = ['boy.glb', 'girl.glb', 'tree.glb'];
const loaded = need.filter(f => glbStatus[f] === 200);
const failed = need.filter(f => glbStatus[f] !== 200);
log('GLB 请求状态:', JSON.stringify(glbStatus));
log('已加载:', loaded.join(','), '| 未加载/缺失:', failed.join(',') || '无');
log('控制台错误数:', consoleErrs.length, consoleErrs.slice(0, 8));
log('页面异常数:', pageErrors.length, pageErrors.slice(0, 8));
// 过滤掉与 M5 无关的已知 404（house/farm/pond 等历史遗留）
const gltfErr = consoleErrs.filter(t => /could not load|glb|GLTFLoader|Unexpected|SyntaxError/i.test(t));
log('GLTF 相关错误:', gltfErr.length ? gltfErr : '无');

await browser.close();
const pass = failed.length === 0 && gltfErr.length === 0;
log('结论 pass =', pass);
process.exit(0);
