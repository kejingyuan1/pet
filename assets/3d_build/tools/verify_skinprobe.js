const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox','--disable-gpu'] });
  const page = await browser.newPage();
  page.on('console', m => console.log('PAGE:', m.text()));
  await page.setCacheEnabled(false);
  await page.goto('http://localhost:8898/demo_skel.html?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 18000));
  const probe = await page.evaluate(() => {
    const duck = window.__duck; const s = window.__skinned; if (!s) return 'no skinned';
    const idx = s.geometry.attributes.skinIndex; const wt = s.geometry.attributes.skinWeight;
    return {
      hasSkinIndex: !!idx, skinIndexType: idx ? idx.array.constructor.name : null,
      hasSkinWeight: !!wt,
      skinIndexArr0: idx ? Array.from(idx.array.slice(0, 12)) : null,
      skinWeightArr0: wt ? Array.from(wt.array.slice(0, 16)) : null,
      bonesCount: s.skeleton.bones.length,
    };
  });
  console.log(JSON.stringify(probe, null, 2));
  await browser.close();
})();
