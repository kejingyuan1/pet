const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox','--disable-gpu'] });
  const page = await browser.newPage();
  page.on('console', m => console.log('PAGE:', m.text()));
  await page.setCacheEnabled(false);
  await page.goto('http://localhost:8898/demo_skel.html?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 18000));
  const probe = await page.evaluate(() => {
    const s = window.__skinned; if (!s) return 'no skinned';
    const idx = s.geometry.attributes.skinIndex.array;
    const wt = s.geometry.attributes.skinWeight.array;
    // 抽样: 0-10 + 9260-9270 + 290000-290010
    const samples = {};
    [0, 9262, 9265, 9266, 9267, 100000, 200000, 300000].forEach(i => {
      samples['v' + i] = {
        skinIndex: [idx[i*4], idx[i*4+1], idx[i*4+2], idx[i*4+3]],
        skinWeight: [wt[i*4], wt[i*4+1], wt[i*4+2], wt[i*4+3]],
      };
    });
    return { len: idx.length, samples };
  });
  console.log(JSON.stringify(probe, null, 2));
  await browser.close();
})();
