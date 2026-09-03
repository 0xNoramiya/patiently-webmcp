import { chromium } from '/home/kuda/hackathon/patiently/apps/web/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const p = await (await b.newContext({ viewport:{width:1800,height:1200}, deviceScaleFactor:1 })).newPage();
for (const n of ['3','6']) {
  // inline the markup: Chrome will not load a local .svg through <img src="file://">
  const svg = readFileSync(`gen/g${n}.svg`, 'utf8')
    .replace(/width="\d+"/, 'width="1800"').replace(/height="\d+"/, 'height="1200"');
  await p.setContent(`<style>html,body{margin:0;width:1800px;height:1200px;overflow:hidden}
    svg{display:block;width:1800px;height:1200px}</style>${svg}`, { waitUntil:'load' });
  await p.waitForTimeout(800);
  await p.screenshot({ path:`gen/g${n}.png` });
  console.log('  g'+n);
}
await b.close();
