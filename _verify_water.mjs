/**
 * _verify_water.mjs — 水面着色器视觉效果验证
 * 
 * 验证项：
 * 1. 着色器水面已激活 (waterShader=true)
 * 2. HY3D 岛屿自带水面 mesh 被隐藏（控制台 [water] 日志）
 * 3. 截图水面区域确认颜色/波浪
 * 4. WASD/跳跃等基础功能未回归
 */
import { chromium } from 'playwright-core';
import WebSocket from 'ws';

const NODE = process.env.NODE_EXE || 'C:\\Users\\ken\\.workbuddy\\binaries\\node\\versions\\22.22.2\\node.exe';
const CHROME = 'C:\\Users\\ken\\.agent-browser\\browsers\\chrome-151.0.7922.76\\chrome.exe';
const URL = 'http://127.0.0.1:4200';

const results = {};
const check = (name, ok, detail) => { results[name] = { ok, detail }; console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

async function main() {
  // ---- 登录拿 token ----
  const loginRaw = await fetch(`${URL.replace('4200','8080')}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'wtest_ken', password: 'Test1234!' })
  }).then(r => r.json());
  const token = loginRaw.data?.token;
  if (!token) { check('登录', false, JSON.stringify(loginRaw).slice(0,200)); process.exit(1); }
  check('登录', true);

  // ---- 启动浏览器 ----
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--no-sandbox',
           '--disable-dev-shm-usage', '--disable-background-timer-throttling',
           '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // 收集控制台日志
  const consoleLogs = [];
  const allLogs = [];
  page.on('console', m => { const t = m.text(); allLogs.push(t); if (t.includes('[water]') || t.includes('ERROR') || t.includes('error') || t.includes('shader') || t.includes('GLSL')) consoleLogs.push(t); });

  // 注入 token → 进大世界
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate((t) => { localStorage.setItem('pp_token', t); localStorage.setItem('pp_user', JSON.stringify({ userId: 67, username: 'wtest_ken' })); }, token);
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  
  // 点「进入大世界」按钮
  try {
    const btn = await page.waitForSelector('button:has-text("进入大世界")', { timeout: 8000 });
    if (btn) await btn.click();
  } catch(e) { /* 可能自动进入 */ }

  // 关闭引导弹窗（如果有「跳过」或「下一步/关闭」按钮）
  await page.waitForTimeout(2000);
  for (const sel of ['button:has-text("跳过")', 'button:has-text("知道了")', 'button:has-text("关闭")', '[class*="close"]', 'button:has-text("下一步")']) {
    try {
      const el = await page.$(sel);
      if (el) { await el.click(); await page.waitForTimeout(500); }
    } catch(e2) {}
  }
  // 再试一次点 canvas 确保焦点
  await page.click('canvas').catch(() => {});

  // 等待 world3d 组件初始化（不强制要求 waterShader，因为 debug hook 刷新有延迟）
  let ready = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    const d = await page.evaluate(() => window.__worldDebug);
    if (d && d.player) { ready = true; break; }
  }
  check('world3d 组件就绪', ready, '');

  // 等待 HY3D 岛屿加载完成（给 DRACO 解码时间）
  await page.waitForTimeout(15000);
  const dbg = await page.evaluate(() => window.__worldDebug);
  const hy3dInfo = dbg?.hy3dTerrain ?? dbg?.hy3dIslands ?? 0;
  const hy3dLoaded = typeof hy3dInfo === 'object' ? true : Number(hy3dInfo) > 0;
  check('HY3D 岛屿加载', hy3dLoaded, JSON.stringify(hy3dInfo).slice(0,100));

  // 检查 [water] 隐藏日志
  const waterLogs = consoleLogs.filter(l => l.includes('[water]'));
  check('HY3D 自带水面隐藏', waterLogs.length > 0, waterLogs.join('; ') || '无隐藏日志（可能岛屿模型不含水 mesh）');

  // 着色器状态
  const shaderInfo = await page.evaluate(() => {
    const d = window.__worldDebug;
    return { 
      hasDebug: !!d, 
      waterPlane: d?.waterPlane, 
      waterShader: d?.waterShader,
      keys: d ? Object.keys(d).filter(k => k.startsWith('water')).join(',') : 'no-debug'
    };
  });
  check('着色器水面激活', shaderInfo.waterShader === true, JSON.stringify(shaderInfo));
  
  // 打印所有含 error/water/shader 的日志
  if (consoleLogs.length) console.log('[CONSOLE]', consoleLogs.join('\n  '));

  // ---- 截图水面区域 ----
  const shotPath = '_shot_water_shader.png';
  await page.screenshot({ path: shotPath, fullPage: false });
  check('水面截图', true, shotPath);

  // ---- 快速功能回归：WASD 能动 ----
  await page.click('canvas'); // 确保 canvas 有焦点
  await page.waitForTimeout(200);
  const p0 = await page.evaluate(() => ({ x: window.__worldDebug.player.x, z: window.__worldDebug.player.z }));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2000);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(500);
  const p1 = await page.evaluate(() => ({ x: window.__worldDebug.player.x, z: window.__worldDebug.player.z }));
  const wasdDist = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  check('WASD 移动（水面改动后回归）', wasdDist > 3, `dist=${wasdDist.toFixed(2)}`);

  // ---- 走向最近岛屿（让 HY3D LOD 加载岛屿实例）----
  // 最近岛心 ≈ (1080, -1188)，从出生点 (1256,-760) 大致方向西南
  // 持续按 S+D（朝岛心方向）走 15 秒，距离应缩短 ~100m+
  console.log('--- 向岛屿移动以触发 LOD 加载 ---');
  const pBefore = await page.evaluate(() => ({ x: window.__worldDebug.player.x, z: window.__worldDebug.player.z }));
  await page.keyboard.down('KeyS');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(15000);
  await page.keyboard.up('KeyS');
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(2000); // 等 LOD 响应 + DRACO 解码
  const pAfter = await page.evaluate(() => ({ x: window.__worldDebug.player.x, z: window.__worldDebug.player.z }));
  const walkDist = Math.hypot(pAfter.x - pBefore.x, pAfter.z - pBefore.z);
  
  // 重新检查 HY3D 岛屿状态
  const dbg2 = await page.evaluate(() => window.__worldDebug);
  const hy3d2 = dbg2?.hy3dTerrain ?? {};
  check(`走向岛屿(walk=${walkDist.toFixed(0)}m)后 HY3D 加载`, 
    (hy3d2.loaded && (hy3d2.islands > 0 || hy3d2.childCount > 0)), 
    JSON.stringify(hy3d2).slice(0,120));
  
  // 最终截图（含岛屿+水面）
  const shot2 = '_shot_water_island.png';
  await page.screenshot({ path: shot2, fullPage: false });
  check('水面+岛屿最终截图', true, shot2);

  // ---- 汇总 ----
  const pass = Object.values(results).filter(r => r.ok).length;
  const total = Object.keys(results).length;
  console.log(`\n=== ${pass}/${total} 通过 ===`);
  if (pass < total) console.log('FAILURES:', Object.entries(results).filter(([,r])=>!r.ok).map(([k])=>k));

  await browser.close();
  process.exit(pass === total ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
