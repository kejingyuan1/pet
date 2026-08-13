// 调试脚本：在页面内执行（通过 evaluate 注入，不依赖 THREE 全局）
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const PW_PATH = 'C:/Users/WIN11/.workbuddy/binaries/node/workspace/node_modules/playwright';
const { chromium } = require(PW_PATH);

const URL = 'http://127.0.0.1:8099/demo_animals_skel.html';
const browser = await chromium.launch({ channel:'chrome', args:['--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport:{width:1000,height:700} });

const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[PAGE_ERR] ${e.message}`));

await page.goto(URL, { waitUntil:'load', timeout:60000 });

// 等待加载 + 注入诊断
await page.evaluate(() => new Promise(resolve => {
  const check = () => {
    if (window.__animals && window.__animals.cat && window.__animals.cat.skinned) {
      // 在模块作用域内做诊断
      const diag = {};
      for (const k of ['cat','dog','fish']) {
        const a = window.__animals[k];
        if (!a) { diag[k] = 'NOT LOADED'; continue; }
        
        // 用 skinned mesh 的 geometry 属性检查
        const sm = a.skinned;
        if (!sm) { diag[k] = 'NO SKINNED'; continue; }
        const geo = sm.geometry;
        const pos = geo.getAttribute('position');
        const idx = geo.getIndex();
        const mat = sm.material;
        
        diag[k] = {
          visible: sm.visible,
          frustumCulled: sm.frustumCulled,
          posCount: pos ? pos.count : 0,
          idxCount: idx ? idx.count : 0,
          drawRange: JSON.stringify(geo.drawRange),
          material: mat ? {
            transparent: mat.transparent,
            opacity: mat.opacity,
            depthTest: mat.depthTest,
            colorWrite: mat.colorWrite,
            side: mat.side,  // 0=FrontSide 2=DoubleSide
            hasMap: !!mat.map,
            mapSize: mat.map ? (mat.map.image ? `${mat.map.image.width}x${mat.map.image.height}` : 'no-image') : null,
            alphaMode: mat.alphaMode,
            vertexColors: !!geo.getAttribute('color'),
          } : null,
          bones: a.bones.length,
          boneNames: a.bones.map(b=>b.name),
        };
      }
      
      // 相机
      const t = window.__three;
      diag.camera = t?.camera ? {
        pos: [t.camera.x,t.camera.y,t.camera.z],
      } : null;
      
      console.log('=== RENDER DIAG ===');
      console.log(JSON.stringify(diag, null, 2));
      resolve();
    } else {
      setTimeout(check, 500);
    }
  };
  check();
}));

await page.waitForTimeout(3000);
logs.forEach(l => console.log(l));
await browser.close();
