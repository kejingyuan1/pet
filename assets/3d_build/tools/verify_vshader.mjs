import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/WIN11/.workbuddy/binaries/node/workspace/node_modules/playwright');

const URL = 'http://127.0.0.1:8099/demo_animals_vshader.html';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=swiftshader'] });
const p = await b.newPage({ viewport: { width: 1000, height: 700 } });

const errors = [];
const logs = [];
p.on('console', m => { logs.push(`[${m.type()}] ${m.text()}`); if (m.type() === 'error') errors.push(m.text()); });
p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
await p.waitForFunction(() => window.__models && window.__models.cat, { timeout: 60000 }).catch(()=>{});

// 等待加载完成（status 显示就绪）
await p.waitForFunction(() => /就绪|✅/.test(document.getElementById('status')?.textContent || ''), { timeout: 60000 }).catch(()=>{});
await p.waitForTimeout(1500);

const diag = {};
// 1) uniforms 是否在推进（动画循环存活）
const u0 = await p.evaluate(() => {
  const m = window.__models.cat;
  let u = null;
  m.root.traverse(o => { if (o.isMesh && o.material.userData.shader) u = o.material.userData.shader.uniforms.uTime.value; });
  return u;
});
await p.waitForTimeout(1000);
const u1 = await p.evaluate(() => {
  const m = window.__models.cat;
  let u = null;
  m.root.traverse(o => { if (o.isMesh && o.material.userData.shader) u = o.material.userData.shader.uniforms.uTime.value; });
  return u;
});
diag.uTimeAdvancing = (u1 !== null && u0 !== null && (u1 - u0) > 0.1);
diag.uTime0 = u0; diag.uTime1 = u1;

// 3b) 屏幕像素级运动检测：鱼运动最明显，截两张图对比是否真有变化（证明 GPU 变形可见）
await p.click(`#topbar [data-animal="fish"]`);
await p.waitForTimeout(500);
const bufA = await p.screenshot();
await p.waitForTimeout(600);
const bufB = await p.screenshot();
// 简单差异：逐字节异或求和（仅抽稀采样，足够判断“有无变化”）
let diff = 0;
const len = Math.min(bufA.length, bufB.length);
const step = Math.max(1, Math.floor(len / 20000));
for (let i = 0; i < len; i += step) { if (bufA[i] !== bufB[i]) diff++; }
diag.pixelMotion = diff;
diag.pixelMotionDetected = diff > 50;

// 2) 点击交互：模拟 pointer 点击猫中心，检查 hop 被触发
await p.evaluate(() => {
  const c = document.querySelector('#viewer canvas');
  const r = c.getBoundingClientRect();
  const cx = r.left + r.width/2, cy = r.top + r.height/2;
  c.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, bubbles: true }));
  c.dispatchEvent(new PointerEvent('pointerup', { clientX: cx, clientY: cy, bubbles: true }));
});
await p.waitForTimeout(120);
const hopAfterClick = await p.evaluate(() => {
  const m = window.__models.cat;
  return { hop: m.hop, hopVel: m.hopVel };
});
diag.hopTriggered = hopAfterClick.hop > 0 || hopAfterClick.hopVel > 0;
diag.hopAfterClick = hopAfterClick;

// 3) 切换动物 + 截图
for (const n of ['cat','dog','fish']) {
  await p.click(`#topbar [data-animal="${n}"]`);
  await p.waitForTimeout(700);
  await p.screenshot({ path: `vshader_${n}.png` });
  const ok = await p.evaluate((nm) => {
    const m = window.__models[nm];
    if (!m) return false;
    let hasShader = false;
    m.root.traverse(o => { if (o.isMesh && o.material.userData.shader) hasShader = true; });
    return hasShader;
  }, n);
  diag['shader_' + n] = ok;
}

await p.waitForTimeout(500);
diag.consoleErrorCount = errors.length;
diag.errors = errors.slice(0, 10);
diag.status = await p.evaluate(() => document.getElementById('status')?.textContent);

console.log(JSON.stringify(diag, null, 2));
await b.close();
