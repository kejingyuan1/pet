import { chromium } from 'file:///C:/Users/WIN11/.workbuddy/binaries/node/workspace/node_modules/playwright/index.mjs';

const URL = 'http://127.0.0.1:8899/demo_animals_draco.html';
const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[PAGEERROR] ${e.message}`));

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(2800);

const r1 = await page.evaluate(() => {
  const T = window.__three; if(!T) return { noThree:true };
  const { scene, renderer, camera } = T;
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w*h*4);
  gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);
  let nonBlack=0, sum=0;
  for(let i=0;i<px.length;i+=4){ const l=(px[i]+px[i+1]+px[i+2])/3; sum+=l; if(l>8) nonBlack++; }
  const total=px.length/4;
  // model transform snapshot (current animal)
  const M = window.__models || {};
  const cur = M[ (document.querySelector('#topbar .btn.active')||{}).dataset?.animal ] || M['cat'];
  let tr = null;
  if(cur){ const r=cur.root; tr = { px:+r.position.x.toFixed(4), py:+r.position.y.toFixed(4), pz:+r.position.z.toFixed(4),
                                     ry:+r.rotation.y.toFixed(4), rz:+r.rotation.z.toFixed(4), sy:+r.scale.y.toFixed(4) }; }
  let head = null;
  if(cur && cur.head){ const h=cur.head; head = { rx:+h.rotation.x.toFixed(4), ry:+h.rotation.y.toFixed(4), rz:+h.rotation.z.toFixed(4) }; }
  return { nonBlackPct:+(100*nonBlack/total).toFixed(2), avgLum:+(sum/total).toFixed(1), transform: tr, head,
           vertCount: (function(){ let v=0; scene.traverse(o=>{ if(o.isMesh) v += o.geometry.attributes.position.count; }); return v; })() };
});
await page.waitForTimeout(500);
const r2 = await page.evaluate(() => {
  const M = window.__models || {};
  const cur = M[ (document.querySelector('#topbar .btn.active')||{}).dataset?.animal ] || M['cat'];
  if(!cur) return null;
  const r=cur.root;
  const h = cur.head ? { rx:+cur.head.rotation.x.toFixed(4), ry:+cur.head.rotation.y.toFixed(4), rz:+cur.head.rotation.z.toFixed(4) } : null;
  return { px:+r.position.x.toFixed(4), py:+r.position.y.toFixed(4), pz:+r.position.z.toFixed(4),
           ry:+r.rotation.y.toFixed(4), rz:+r.rotation.z.toFixed(4), sy:+r.scale.y.toFixed(4), head:h };
});

console.log('=== CONSOLE/ERRORS ===');
console.log(logs.length ? logs.join('\n') : '(none)');
const shaderErr = logs.some(l => /Shader Error|WebGLProgram|compile/i.test(l));
console.log('\nSHADER_ERROR:', shaderErr);
console.log('\n=== RENDER 1 (brightness) ===');
console.log(JSON.stringify(r1));
console.log('\n=== TRANSFORM 2 (500ms later) ===');
console.log(JSON.stringify(r2));
if(r1.transform && r2){
  const keys=['px','py','pz','ry','rz','sy'];
  const moved = keys.filter(k=>Math.abs(r1.transform[k]-r2[k])>1e-4);
  console.log('\nMOVED_AXES(body):', moved.join(',') || '(none)');
  if(r1.head && r2.head){
    const hk=['rx','ry','rz'];
    const hm = hk.filter(k=>Math.abs(r1.head[k]-r2.head[k])>1e-4);
    console.log('MOVED_AXES(head):', hm.join(',') || '(none)');
  } else { console.log('MOVED_AXES(head): NO_HEAD_MESH'); }
}

await browser.close();
