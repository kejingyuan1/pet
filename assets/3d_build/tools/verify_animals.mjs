// Playwright 验证：加载 demo_animals_skel.html，检查无报错、SkinnedMesh 存在、
// 骨骼随时间旋转（真动）、PBR 颜色存在，并对三种动物截图。
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const PW_PATH = 'C:/Users/WIN11/.workbuddy/binaries/node/workspace/node_modules/playwright';
const { chromium } = require(PW_PATH);

const URL = process.argv[2] || 'http://localhost:8099/demo_animals_skel.html';
const OUT = process.argv[3] || '.';
const errors = [];

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on('console', m => { if (m.type() === 'error' && !/favicon/i.test(m.text())) errors.push(m.text()); });
page.on('requestfailed', r => { if (!/favicon/i.test(r.url())) errors.push('REQFAIL: ' + r.url()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'load', timeout: 60000 });

// 等待三种动物加载完成（window.__animals 含 3 个 skinned）
await page.waitForFunction(() => {
  const a = window.__animals;
  return a && a.cat && a.cat.skinned && a.dog && a.dog.skinned && a.fish && a.fish.skinned;
}, { timeout: 60000 }).catch(() => {});

const summary = await page.evaluate(() => {
  const a = window.__animals || {};
  const out = {};
  for (const k of ['cat','dog','fish']) {
    const o = a[k];
    out[k] = o ? {
      bones: o.bones.map(b => b.name),
      hasSkinned: !!o.skinned,
      hasPBR: !!(o.skinned && o.skinned.material && o.skinned.material.map),
    } : null;
  }
  return out;
});
console.log('ANIMALS:', JSON.stringify(summary, null, 2));

// 验证"真动"：切换动物，读取当前 active 动物骨骼 rotation 在 0.4s 前后的变化
async function checkMotion(name){
  await page.click(`#topbar [data-animal="${name}"]`);
  await page.waitForTimeout(300);
  const vals = await page.evaluate(async () => {
    function grab(){
      const a = window.__animals;
      const cur = document.querySelector('#topbar [data-animal].active').dataset.animal;
      const o = a[cur];
      return o.bones.map(b => ({ name: b.name, rx: +b.rotation.x.toFixed(4), ry: +b.rotation.y.toFixed(4) }));
    }
    const t0 = grab();
    await new Promise(r => setTimeout(r, 400));
    const t1 = grab();
    return { t0, t1 };
  });
  let maxDelta = 0;
  for (let i=0;i<vals.t0.length;i++){
    const d = Math.abs(vals.t1[i].rx - vals.t0[i].rx) + Math.abs(vals.t1[i].ry - vals.t0[i].ry);
    if (d > maxDelta) maxDelta = d;
  }
  return { name, bones: vals.t0.length, maxDelta: +maxDelta.toFixed(4) };
}

const motion = {};
for (const name of ['cat','dog','fish']) {
  motion[name] = await checkMotion(name);
}
console.log('MOTION:', JSON.stringify(motion, null, 2));

// 截图三种动物
for (const name of ['cat','dog','fish']) {
  await page.click(`#topbar [data-animal="${name}"]`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/verify_${name}.png` });
  console.log('截图:', `${OUT}/verify_${name}.png`);
}

console.log('CONSOLE_ERRORS:', JSON.stringify(errors, null, 2));
await browser.close();

// 结论
const ok = Object.values(summary).every(s => s && s.hasSkinned && s.hasPBR)
  && Object.values(motion).every(m => m.maxDelta > 0.05)
  && errors.length === 0;
console.log('RESULT:', ok ? 'PASS' : 'CHECK');
process.exit(ok ? 0 : 1);
