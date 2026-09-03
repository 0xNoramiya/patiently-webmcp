// Grabs the approval dialog from the deployed app at 2x DPR for the Devpost
// thumbnail. Screenshot only: it opens the gate, photographs it, then clicks
// Decline, so nothing is written to the live demo.
import { chromium } from '/home/kuda/hackathon/patiently/apps/web/node_modules/playwright/index.mjs';

const B = 'https://patiently-webmcp.vercel.app';
const OUT = '/home/kuda/hackathon/patiently/video/thumb';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });

const waitTools = async (p, m) => {
  for (let i = 0; i < 240; i++) {
    const n = await p.evaluate(async () => {
      try { return document.modelContext ? (await document.modelContext.getTools()).length : 0; } catch { return 0; }
    });
    if (n >= m) return n;
    await p.waitForTimeout(150);
  }
  throw new Error('no tools');
};

// Must not be awaited before the screenshot -- execute() parks on the approval
// promise, so awaiting it here would hang until the dialog expires.
const startCall = (p, n, a = {}) => p.evaluate(async ([n, a]) => {
  const t = (await document.modelContext.getTools()).find(x => x.name === n);
  window.__p = document.modelContext.executeTool(t, JSON.stringify(a)).catch(() => {});
}, [n, a]);

const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto(B + '/dashboard', { waitUntil: 'domcontentloaded' });
await waitTools(p, 11);
const tn = await p.evaluate(async () => (await (await fetch('/api/queue/umum')).json()).waiting[0].ticket.ticket_number);
console.log('  ticket', tn);

const d = p.locator('[role="dialog"]');

for (const [name, args, decline, file] of [
  ['call_next_patient', { ticket: tn }, 'Decline', 'call'],
  ['record_vitals', { ticket: tn, systolic_bp: 168, diastolic_bp: 98, heart_rate: 104, spo2: 95, pain_score: 7 }, 'Decline', 'vitals'],
]) {
  await startCall(p, name, args);
  await d.waitFor({ timeout: 25000 });
  await p.waitForTimeout(1200);
  await d.screenshot({ path: `${OUT}/_dialog-${file}.png` });
  await p.screenshot({ path: `${OUT}/_page-${file}.png` });
  console.log(`  ✓ ${file}`);
  await d.getByRole('button', { name: decline }).click();
  await p.waitForTimeout(1500);
}

await ctx.close();
await browser.close();
