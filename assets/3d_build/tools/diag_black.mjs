import { chromium } from 'file:///C:/Users/WIN11/.workbuddy/binaries/node/workspace/node_modules/playwright/index.mjs';

const URL = process.argv[2] || 'http://127.0.0.1:8899/demo_selfcontained.html';
const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });

const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[PAGEERROR] ${e.message}`));

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(2500);

const diag = await page.evaluate(() => {
  const out = {};
  const T = window.__three;
  if (!T) { out.noThree = true; return out; }
  const { scene, renderer, camera } = T;
  // renderer info
  out.renderer = { isWebGL2: renderer.capabilities.isWebGL2,
                   maxTextures: renderer.capabilities.maxTextures,
                   programs: renderer.info.programs?.length };
  // lights
  out.lights = scene.children.filter(c => c.isLight).map(l => ({ type: l.type, intensity: l.intensity }));
  // meshes + materials
  const meshes = [];
  scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  out.meshCount = meshes.length;
  out.materials = meshes.map(m => {
    const mat = m.material;
    return { name: m.name, type: mat.type,
             side: mat.side, // 0=front,1=back,2=double
             hasMap: !!(mat.map || (mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorTexture)),
             color: mat.color ? mat.color.getHexString?.() : null,
             emissive: mat.emissive ? mat.emissive.getHexString?.() : null,
             visible: m.visible, frustumCulled: m.frustumCulled };
  });
  // bounding box of model (first standard-material mesh = animal)
  const animal = meshes.find(m => m.material && m.material.isMeshStandardMaterial) || meshes[0];
  if (animal) {
    const box = new T.THREE.Box3().setFromObject(animal);
    out.modelBox = { min: box.min.toArray().map(n=>+n.toFixed(2)), max: box.max.toArray().map(n=>+n.toFixed(2)) };
    // texture decode check
    const mat = animal.material;
    const map = mat.map;
    out.texture = map ? {
      hasImage: !!(map.image),
      width: map.image?.width, height: map.image?.height,
      isReady: map.isReady || (map.source && map.source.data ? true : false),
      needsUpdate: map.needsUpdate
    } : 'NO MAP';
  }
  // force a render then read pixels in the same frame (reliable brightness)
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w*h*4);
  gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);
  let nonBlack=0, bright=0, sum=0;
  for (let i=0;i<px.length;i+=4){
    const r=px[i],g=px[i+1],b=px[i+2];
    const lum=(r+g+b)/3;
    sum+=lum;
    if (lum>8) nonBlack++;
    if (lum>60) bright++;
  }
  const total=px.length/4;
  out.pixels = { total, nonBlack, bright,
                 nonBlackPct:+(100*nonBlack/total).toFixed(2),
                 brightPct:+(100*bright/total).toFixed(2),
                 avgLum:+(sum/total).toFixed(2) };
  return out;
});

console.log('=== CONSOLE/ERRORS ===');
console.log(logs.length ? logs.join('\n') : '(none)');
console.log('\n=== DIAG ===');
console.log(JSON.stringify(diag, null, 2));

await browser.close();
