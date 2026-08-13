// 调试：加载 GLB 后打印模型实际渲染状态
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const PW_PATH = 'C:/Users/WIN11/.workbuddy/binaries/node/workspace/node_modules/playwright';
const { chromium } = require(PW_PATH);

const URL = 'http://127.0.0.1:8099/demo_animals_skel.html';
const browser = await chromium.launch({ channel:'chrome', args:['--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport:{width:1000,height:700} });

// Capture ALL console
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[ERR] ${e.message}`));

await page.goto(URL, { waitUntil:'load', timeout:60000 });
await page.waitForTimeout(5000); // 等加载完成

// 深度诊断：模型在世界空间中的实际状态
const diag = await page.evaluate(() => {
  const a = window.__animals;
  const out = {};
  for (const k of ['cat','dog','fish']) {
    const o = a[k];
    if (!o) { out[k] = 'NOT LOADED'; continue; }
    
    // 遍历所有 Mesh/SkinnedMesh，获取世界包围盒
    const meshes = [];
    o.root.traverse(child => {
      if (!child.isMesh && !child.isSkinnedMesh) return;
      child.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(child);
      const geo = child.geometry;
      const posAttr = geo.getAttribute('position');
      meshes.push({
        type: child.isSkinnedMesh ? 'SkinnedMesh' : 'Mesh',
        visible: child.visible,
        renderOrder: child.renderOrder,
        frustumCulled: child.frustumCulled,
        material: child.material ? {
          transparent: child.material.transparent,
          opacity: child.material.opacity,
          side: child.material.side,
          depthTest: child.material.depthTest,
          colorWrite: child.material.colorWrite,
          hasMap: !!child.material.map,
          mapVisible: child.material.map ? child.material.map.image?.width : null,
        } : null,
        bboxWorld: {
          min: box.min.toArray(),
          max: box.max.toArray(),
          size: box.getSize(new THREE.Vector3()).toArray(),
        },
        posCount: posAttr ? posAttr.count : 0,
        idxCount: geo.index ? geo.index.count : 0,
      });
    });
    
    out[k] = {
      rootVisible: o.root.visible,
      skinnedExists: !!o.skinned,
      bones: o.bones ? o.bones.map(b => ({name:b.name, pos:b.position.toArray(), vis:b.visible})) : [],
      meshes,
    };
  }
  
  // 相机信息
  const cam = window.__three?.camera;
  out.camera = cam ? {
    position: cam.position.toArray(),
    target: window.__three?.controls?.target?.toArray(),
    near: cam.near,
    far: cam.far,
    fov: cam.fov,
  } : 'NO CAMERA';
  
  return out;
});

console.log('=== DIAGNOSTIC ===');
console.log(JSON.stringify(diag, null, 2));
console.log('\n=== CONSOLE LOGS ===');
logs.forEach(l => console.log(l));

await browser.close();
