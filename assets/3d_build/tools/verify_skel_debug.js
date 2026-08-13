const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox','--disable-gpu']
  });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERR:', e.message));
  page.on('console', m => console.log('PAGE:', m.text()));
  await page.setCacheEnabled(false);
  await page.goto('http://localhost:8898/demo_skel.html?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 18000));
  const info = await page.evaluate(() => ({
    status: document.getElementById('status').textContent,
  }));
  console.log('STATUS:', info.status);
  // 走路 3 帧（骨骼动画驱动，腿应动）
  await page.click('#btnWalk');
  for (const [i, ms] of [[0, 400], [1, 1500], [2, 3000]].entries()) {
    await new Promise(r => setTimeout(r, ms));
    await page.screenshot({ path: 'C:////Users////WIN11////WorkBuddy////2026-08-05-11-48-42////verify_skel_t' + i + '.png' });
    console.log('走路帧' + i);
  }
  // 低头 1 帧
  await page.click('#btnEat');
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: 'C:////Users////WIN11////WorkBuddy////2026-08-05-11-48-42////verify_skel_eat.png' });
  console.log('低头帧');
  await browser.close();
})();
