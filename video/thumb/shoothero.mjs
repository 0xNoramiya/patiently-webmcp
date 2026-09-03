import { chromium } from '/home/kuda/hackathon/patiently/apps/web/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const p = await (await b.newContext({ viewport:{width:1800,height:1200}, deviceScaleFactor:2 })).newPage();
for (const t of (process.argv.slice(2).length ? process.argv.slice(2) : ['H'])) {
  await p.goto('file://' + process.cwd() + `/cand-${t}.html`, { waitUntil:'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(700);
  await p.screenshot({ path:`_cand-${t}@2x.png` });
  console.log('  ' + t);
}
await b.close();
