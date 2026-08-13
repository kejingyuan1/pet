const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox','--disable-gpu']
  });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERR:', e.message));
  page.on('console', m => console.log('LOG:', m.text()));
  await page.setCacheEnabled(false);
  await page.goto('http://localhost:8898/demo_skel.html?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 20000));
  const info = await page.evaluate(() => {
    status: document.getElementById('status').textContent,
  }));
  console.log('STATUS:', info.status);
  page.on('console', m => console.log('PAGE:', m.text()));
  const dbg = await page.evaluate(() => {
    const m = window.__mixer, d = window.__duck;
    if (!m || !d) return 'no mixer';
    const out = { actions: [], time: 0 };
    m._actions.forEach(a => out.actions.push({name: a._clip.name, time: a.time, timeScale: a.timeScale, isRunning: a.isRunning()}));
    return out;
  });
  console.log('调试:', JSON.stringify(dbg, null, 2));
  // 播放走路骨骼动画，截 3 帧（腿位置应不同 → 证明骨骼真的在动）
  await page.click('#btnWalk');
  for (const [i, ms] of [[0, 400], [1, 1200], [2, 2500]].entries()) {
    await new Promise(r => setTimeout(r, ms));
    await page.screenshot({ path: `C:\\Users\\WIN11\\WorkBuddy\\2026-08-05-11-48-42\\verify_skel_walk${i}.png` });
    console.log(`走路帧${i} 截图 (${ms}ms)`);
  }
  // 低头
  await page.click('#btnEat');
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: 'C:\\Users\\WIN11\\WorkBuddy\\2026-08-05-11-48-42\\verify_skel_eat.png' });
  console.log('低头帧截图');
  await browser.close();
})();
