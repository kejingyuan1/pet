const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox','--disable-gpu'] });
  const page = await browser.newPage();
  page.on('console', m => console.log('PAGE:', m.text()));
  await page.setCacheEnabled(false);
  await page.goto('http://localhost:8898/demo_skel.html?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 18000));
  // 手动 set leg_l rotation 1 rad，看像素是否变
  await page.evaluate(() => {
    const b = window.__bones;
    b[1].rotation.set(1.0, 0, 0);
    b[2].rotation.set(-1.0, 0, 0);
    b[0].rotation.set(0, 0, 0);
    window.__skinned.skeleton.update();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: 'C:////Users////WIN11////WorkBuddy////2026-08-05-11-48-42////verify_skel_extreme.png' });
  console.log('extreme shot done');
  await browser.close();
})();
