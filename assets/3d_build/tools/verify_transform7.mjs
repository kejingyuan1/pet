import { chromium } from 'file:///C:/Users/WIN11/.workbuddy/binaries/node/workspace/node_modules/playwright/index.mjs';

const URL = 'http://127.0.0.1:8899/demo_animals_transform.html';
const ANIMALS = ['cat','dog','fish','chicken','duck','cow','sheep'];
const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[PAGEERROR] ${e.message}`));

await page.goto(URL, { waitUntil: 'load' });
// 等待所有模型加载
await page.waitForFunction(() => {
  const M = window.__models; if(!M) return false;
  return ['cat','dog','fish','chicken','duck','cow','sheep'].every(a => M[a] && M[a].root);
}, { timeout: 30000 }).catch(()=>{});
await page.waitForTimeout(800);

const report = await page.evaluate(() => {
  const M = window.__models || {};
  const out = {};
  for(const a of ['cat','dog','fish','chicken','duck','cow','sheep']){
    const m = M[a]; if(!m){ out[a] = { missing:true }; continue; }
    const box = new (window.__three.THREE.Box3)().setFromObject(m.root);
    const verts = (function(){ let v=0; m.root.traverse(o=>{ if(o.isMesh) v += o.geometry.attributes.position.count; }); return v; })();
    out[a] = {
      verts,
      visible: m.root.visible,
      worldMinY: +box.min.y.toFixed(4),
      worldMaxY: +box.max.y.toFixed(4),
      isFish: m.isFish,
      hasWalk: m.walkOn, hasShake: m.shakeOn, hasBow: m.bowOn,
    };
  }
  return out;
});

// 逐个切换 + 截图 + 非黑屏检测
const shots = {};
for(const a of ANIMALS){
  await page.click(`#topbar [data-animal="${a}"]`);
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => {
    const T = window.__three; const { scene, renderer, camera } = T;
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w*h*4);
    gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);
    let nb=0; for(let i=0;i<px.length;i+=4){ if((px[i]+px[i+1]+px[i+2])/3>8) nb++; }
    return { nonBlackPct:+(100*nb/(px.length/4)).toFixed(1) };
  });
  shots[a] = r.nonBlackPct;
  await page.screenshot({ path: `C:/Users/WIN11/WorkBuddy/2026-08-05-11-48-42/shot_${a}.png` });
}

console.log('=== CONSOLE/ERRORS ===');
console.log(logs.length ? logs.join('\n') : '(none)');
const shaderErr = logs.some(l => /Shader Error|WebGLProgram|compile|THREE.WebGL/i.test(l));
console.log('\nSHADER_ERROR:', shaderErr);
console.log('\n=== MODELS ===');
console.log(JSON.stringify(report, null, 1));
console.log('\n=== NON-BLACK % per animal ===');
console.log(JSON.stringify(shots));

await browser.close();
