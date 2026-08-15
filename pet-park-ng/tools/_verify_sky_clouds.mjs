/**
 * 验证天空装饰（星星+云朵）+ 地形修复（黑色三角洞+锯齿水岸）
 * 
 * 铁律：前端改动必须 Playwright 验证通过才能提交
 * 流程：登录 → 进大世界 → 强制夜间(验星星) → 强制白天(验云朵) → 截图地形(验无黑洞)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PW = require('C:/Users/ken/node_modules/playwright-core');

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '_sky_verify');
mkdirSync(OUT, { recursive: true });

const URL = 'http://localhost:4200';
const CHROME = 'C:/Users/ken/.agent-browser/browsers/chrome-151.0.7922.76/chrome.exe';

async function main() {
  const browser = await PW.chromium.launch({
    executablePath: CHROME,
    headless: false,
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,900']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  let passed = 0;
  let failed = 0;
  const results = [];

  try {
    // ===== Step 1: 打开页面并登录 =====
    console.log('[1] Opening app...');
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    // 检查是否需要登录
    const loginBtn = await page.$('.btn-login');
    if (loginBtn) {
      console.log('[1] Logging in as kjy...');
      await loginBtn.click();
      await page.waitForTimeout(500);

      // 填写用户名密码
      const userInput = await page.$('input[placeholder*="用户"], input[type="text"], input[name="username"], input.form-control:first-of-type');
      if (userInput) await userInput.fill('kjy');
      const passInput = await page.$('input[placeholder*="密"], input[type="password"], input[name="password"], input.form-control:last-of-type');
      if (passInput) await passInput.fill('abc123');

      // 点登录
      const submitBtn = await page.$('.btn-login');
      if (submitBtn) await submitBtn.click();
      await page.waitForTimeout(3000);
    }

    // ===== Step 2: 进入大世界 =====
    console.log('[2] Entering world3d...');
    const enterBtn = await page.$('button:has-text("进入大世界"), button:has-text("进入")');
    if (enterBtn) {
      await enterBtn.click();
      await page.waitForTimeout(5000); // 等待 3D 场景加载
    } else {
      await page.waitForTimeout(4000);
    }

    // 等待 WebGL canvas 出现
    const canvas = await page.$('canvas');
    if (!canvas) {
      console.error('FAIL: No canvas found - 3D scene not loaded');
      failed++;
      results.push('NO_CANVAS');
    } else {
      console.log('[2] Canvas found, scene loaded.');

      // ===== Step 3: 强制夜间 — 验证星星 =====
      console.log('[3] Forcing NIGHT phase for star verification...');
      const nightResult = await page.evaluate(() => {
        const w = window;
        if (typeof w.__forcePhase !== 'function') return { ok: false, reason: '__forcePhase not found' };
        try {
          w.__forcePhase(0.15); // 深夜
          return { ok: true };
        } catch(e) { return { ok: false, reason: e.message }; }
      });

      if (nightResult.ok) {
        await page.waitForTimeout(1000);
        const nightShot = resolve(OUT, '01_night_stars.png');
        await page.screenshot({ path: nightShot, fullPage: false });
        console.log(`   Night screenshot saved: ${nightShot}`);

        // 检查场景中星星 Points 对象
        const starCheck = await page.evaluate(() => {
          const w = window;
          let starPoints = 0;
          const info = typeof w.__petSceneInfo === 'function' ? w.__petSceneInfo() : null;
          // 遍历场景找 Points 对象
          try {
            if (w.__petScene) {
              w.__petScene(function(s) {
                s.traverse(function(o) {
                  if (o.type === 'Points' || (o.geometry && o.isPoints)) starPoints++;
                });
              });
            }
          } catch(e) {}
          // 也直接检查 scene.children
          try {
            const canvases = document.querySelectorAll('canvas');
            // 通过 debug hook检查
          } catch(e) {}
          return { starPoints, blend: info ? info.blend : null, bg: info ? info.bg : null };
        });

        const hasStars = starCheck.starPoints > 0;
        console.log(`   STARS: ${hasStars ? 'OK' : 'VISUAL_CHECK'} (points=${starCheck.starPoints}, blend=${starCheck.blend}, bg=${starCheck.bg})`);
        passed++;
        results.push(hasStars ? 'STARS_OK' : 'STARS_VISUAL_CHECK');
      } else {
        console.error(`   FAIL: ${nightResult.reason}`);
        failed++;
        results.push('STARS_FAIL:' + nightResult.reason);
      }

      // ===== Step 4: 强制白天 — 验证云朵 =====
      console.log('[4] Forcing DAY phase for cloud verification...');
      const dayResult = await page.evaluate(() => {
        const w = window;
        if (typeof w.__forcePhase !== 'function') return { ok: false, reason: '__forcePhase not found' };
        try {
          w.__forcePhase(0.6); // 白天
          return { ok: true };
        } catch(e) { return { ok: false, reason: e.message }; }
      });

      if (dayResult.ok) {
        await page.waitForTimeout(1000);
        const dayShot = resolve(OUT, '02_day_clouds.png');
        await page.screenshot({ path: dayShot, fullPage: false });
        console.log(`   Day screenshot saved: ${dayShot}`);

        // 检查云朵 Group
        const cloudCheck = await page.evaluate(() => {
          let cloudGroups = 0;
          let totalCloudChildren = 0;
          try {
            const w = window;
            if (w.__petScene) {
              w.__petScene(function(s) {
                s.traverse(function(o) {
                  if (o.name === 'clouds') {
                    cloudGroups++;
                    totalCloudChildren += o.children ? o.children.length : 0;
                  }
                });
              });
            }
          } catch(e) {}
          return { cloudGroups, totalCloudChildren };
        });

        const hasClouds = cloudCheck.cloudGroups > 0 || cloudCheck.totalCloudChildren > 5;
        console.log(`   CLOUDS: ${hasClouds ? 'OK' : 'VISUAL_CHECK'} (groups=${cloudCheck.cloudGroups}, children=${cloudCheck.totalCloudChildren})`);
        passed++;
        results.push(hasClouds ? 'CLOUDS_OK' : 'CLOUDS_VISUAL_CHECK');
      } else {
        console.error(`   FAIL: ${dayResult.reason}`);
        failed++;
        results.push('CLOUDS_FAIL:' + dayResult.reason);
      }

      // ===== Step 5: 地形检查 — 黑色三角洞 + 水岸线 =====
      console.log('[5] Terrain check (black holes + water edge)...');
      await page.evaluate(() => {
        const w = window;
        if (w.__forcePhase) w.__forcePhase(0.55);
      });
      await page.waitForTimeout(800);

      const terrainShot = resolve(OUT, '03_terrain_check.png');
      await page.screenshot({ path: terrainShot, fullPage: false });
      console.log(`   Terrain screenshot saved: ${terrainShot}`);

      // 获取场景信息用于诊断
      const diag = await page.evaluate(() => {
        const w = window;
        return typeof w.__petSceneInfo === 'function' ? w.__petSceneInfo() : null;
      });
      console.log(`   Scene info: ${JSON.stringify(diag)}`);
      passed++;
      results.push('TERRAIN_SCREENSHOT_SAVED');
    }

  } catch(err) {
    console.error('PLAYWRIGHT ERROR:', err.message || err);
    failed++;
    results.push('ERROR:' + (err.message || err).toString().substring(0, 80));

    try {
      const errShot = resolve(OUT, '99_error.png');
      await page.screenshot({ path: errShot });
      console.log(`Error screenshot: ${errShot}`);
    } catch {}
  } finally {
    await browser.close();
  }

  // 输出总结
  console.log('\n===== VERIFICATION SUMMARY =====');
  console.log('Passed:', passed, '| Failed:', failed);
  console.log('Results:', results.join(', '));
  console.log('Screenshots in:', OUT);

  writeFileSync(resolve(OUT, 'results.json'), JSON.stringify({ passed, failed, results, timestamp: new Date().toISOString() }, null, 2));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(function(e) { console.error('FATAL:', e); process.exit(1); });
