// Clean 2x-DPR shots of the dashboard for the promotional composition:
// the chart behind, the approval dialog in front. Read-only -- selects a
// patient and screenshots; it never opens a gate or writes anything.
import { chromium } from '/home/kuda/hackathon/patiently/apps/web/node_modules/playwright/index.mjs';
const B = 'https://patiently-webmcp.vercel.app';
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const ctx = await b.newContext({ viewport:{width:1600,height:1000}, deviceScaleFactor:2 });
const p = await ctx.newPage();
await p.goto(B + '/dashboard', { waitUntil:'domcontentloaded' });
await p.waitForTimeout(4000);
// open a patient so the right pane shows a real chart, not the empty state
const row = p.locator('button, [role="button"]').filter({ hasText: 'Sarah Walters' }).first();
try { await row.click({ timeout: 8000 }); } catch { console.log('  (no row click)'); }
await p.waitForTimeout(3500);
await p.screenshot({ path:'hero-dash.png' });
console.log('  ✓ hero-dash.png');
await ctx.close(); await b.close();
