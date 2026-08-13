import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/WIN11/.workbuddy/binaries/node/workspace/node_modules/playwright');
const b = await chromium.launch({channel:'chrome',args:['--use-gl=swiftshader']});
const p = await b.newPage({viewport:{width:1000,height:700}});
await p.goto('http://127.0.0.1:8099/demo_animals_anim.html',{waitUntil:'load',timeout:60000});
await p.waitForFunction(() => window.__models && window.__models.cat, {timeout:60000}).catch(()=>{});
await p.waitForTimeout(2000);

for (const n of ['cat','dog','fish']) {
  await p.click(`#topbar [data-animal="${n}"]`);
  await p.waitForTimeout(800);
  await p.screenshot({path:`anim_${n}.png`});
}
console.log('DONE');
await b.close();
