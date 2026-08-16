import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

const URL = 'http://localhost:4200';
const CHROME = 'C:/Users/ken/.agent-browser/browsers/chrome-151.0.7922.76/chrome.exe';
const OUT = '_verify_diag2';

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const warns = [];
  page.on('console', msg => { const t = msg.text(); if (/WATER|落水|hy3d|error/i.test(t)) warns.push(t.substring(0, 150)); });

  console.log('Login + enter world...');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[placeholder="用户名"]', 'kjy');
  await page.fill('input[placeholder*="密码"]', 'abc123');
  await page.click('.btn-login');
  await page.waitForTimeout(3000);

  const enterBtn = page.locator('text=进入大世界');
  if (await enterBtn.count() > 0) {
    await enterBtn.first().click();
    await page.waitForTimeout(25000);
  }

  // Dismiss guide
  for (const txt of ['下一步', '知道了', '关闭', '跳过']) {
    const btn = page.locator(`text=${txt}`);
    for (let i = 0; i < 3; i++) { if (await btn.count() > 0) { await btn.first().click(); await page.waitForTimeout(400); } else break; }
  }

  // 获取摄像机当前位置 + 场景信息
  const info = await page.evaluate(() => {
    const d = window.__worldDebug;
    if (!d) return null;
    // 找到 hy3d_terrain group
    let hy3d = null;
    const search = (obj) => {
      if (!obj) return;
      if (obj.name === 'hy3d_terrain') { hy3d = obj; return; }
      if (obj.children) obj.children.forEach(search);
    };
    // 尝试从 debug 信息获取
    return {
      player: d.player,
      camera: d.camera ? { x: d.camera.position?.x ?? d.camera.position?.x, y: d.camera.position?.y ?? d.camera.position?.y, z: d.camera.position?.z ?? d.camera.position?.z } : null,
      hy3d: d.hy3dTerrain,
      terrain: d.terrain,
    };
  });
  console.log('\n=== Scene Info ===');
  console.log(JSON.stringify(info, null, 2));

  // 截图1: 默认视角
  if (!existsSync(OUT)) mkdirSync(OUT);
  await page.screenshot({ path: `${OUT}/01_default.png` });

  // 截图2: 用 Three.js 命令拉远摄像机
  await page.evaluate(() => {
    // 通过 DOM 找 canvas 的 parent 然后找 Angular component
    const canvas = document.querySelector('canvas');
    if (canvas && canvas.__threeCamera) {
      const cam = canvas.__threeCamera;
      cam.position.set(0, 800, 800);
      cam.lookAt(0, 0, 0);
    }
  }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/02_far.png` });

  // 尝试通过 exposeFunction 操作摄像机
  // 直接用 evaluate 在 Three.js scene 中操作
  await page.evaluate(() => {
    // 遍历 scene 找 camera
    const findCam = (obj) => {
      if (obj.isCamera) return obj;
      if (obj.children) for (const c of obj.children) { const r = findCam(c); if (r) return r; }
      return null;
    };
    // worldDebug 可能暴露了 _scene
    const d = window.__worldDebug;
    const scene = d?._scene;
    if (scene) {
      const cam = findCam(scene);
      if (cam) {
        cam.position.set(0, 600, 600);
        cam.lookAt(0, 0, 0);
        window.__foundCam = true;
      }
    }
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/03_topdown_attempt.png` });

  // Water warnings summary
  console.log('\n=== Water/HY3D warnings (' + warns.length + ') ===');
  const unique = [...new Set(warns)];
  unique.slice(0, 15).forEach(w => console.log('  ', w));
  writeFileSync(`${OUT}/warnings.json`, JSON.stringify({ count: warns.length, unique: unique.slice(0, 30) }, null, 2));

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
