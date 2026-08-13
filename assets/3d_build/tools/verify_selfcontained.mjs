import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/WIN11/.workbuddy/binaries/node/workspace/node_modules/playwright');

const FILE = 'file:///c:/Users/WIN11/WorkBuddy/2026-08-05-11-48-42/demo_selfcontained.html';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=swiftshader', '--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1000, height: 700 } });

const errors = [], reqfail = [], logs = [];
p.on('console', m => { logs.push(`[${m.type()}] ${m.text()}`); if (m.type()==='error') errors.push(m.text()); });
p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
p.on('requestfailed', r => reqfail.push(r.url().slice(0,80) + ' :: ' + (r.failure()?.errorText)));

await p.goto(FILE, { waitUntil: 'load', timeout: 60000 });
await p.waitForFunction(() => window.__models && window.__models.cat, { timeout: 60000 }).catch(()=>{});
await p.waitForFunction(() => /就绪|✅/.test(document.getElementById('status')?.textContent || ''), { timeout: 60000 }).catch(()=>{});
await p.waitForTimeout(1500);

const diag = {};
const u0 = await p.evaluate(() => { let u=null; window.__models.cat.root.traverse(o=>{if(o.isMesh&&o.material.userData.shader)u=o.material.userData.shader.uniforms.uTime.value;}); return u; });
await p.waitForTimeout(1000);
const u1 = await p.evaluate(() => { let u=null; window.__models.cat.root.traverse(o=>{if(o.isMesh&&o.material.userData.shader)u=o.material.userData.shader.uniforms.uTime.value;}); return u; });
diag.uTimeAdvancing = (u1-u0) > 0.1; diag.u0=u0; diag.u1=u1;

// 贴图是否保留
diag.textureKept = await p.evaluate(() => {
  let ok=false; window.__models.cat.root.traverse(o=>{ if(o.isMesh && o.material.map) ok=true; });
  return ok;
});

// 屏幕像素运动
await p.click('#topbar [data-animal="fish"]'); await p.waitForTimeout(500);
const bufA = await p.screenshot(); await p.waitForTimeout(600); const bufB = await p.screenshot();
let diff=0; const len=Math.min(bufA.length,bufB.length); const step=Math.max(1,Math.floor(len/20000));
for(let i=0;i<len;i+=step){ if(bufA[i]!==bufB[i]) diff++; }
diag.pixelMotion=diff; diag.pixelMotionDetected = diff>50;

// 截图三张
for (const n of ['cat','dog','fish']) {
  await p.click(`#topbar [data-animal="${n}"]`); await p.waitForTimeout(700);
  await p.screenshot({ path: `selfcontained_${n}.png` });
}
diag.consoleErrors = errors;
diag.requestFailures = reqfail;
diag.status = await p.evaluate(() => document.getElementById('status')?.textContent);
console.log(JSON.stringify(diag, null, 2));
await b.close();
