import { chromium } from '/home/kuda/hackathon/patiently/apps/web/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const p = await (await b.newContext({ viewport:{width:1800,height:1200}, deviceScaleFactor:2 })).newPage();
for (const [tag, file] of [['A','cand-A.html'],['B','cand-B.html'],['C','cand-C.html'],['D','cand-D.html']]) {
  await p.goto('file://' + process.cwd() + '/' + file, { waitUntil:'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(600);
  await p.screenshot({ path:`_cand-${tag}@2x.png` });
  console.log('  ' + tag);
}
await b.close();
