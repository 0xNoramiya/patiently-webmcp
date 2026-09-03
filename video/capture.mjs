/**
 * Capture REAL footage of the deployed app driving real WebMCP tools.
 * One browser context per shot so each lands as its own video file.
 */
import { chromium } from '/home/kuda/hackathon/patiently/apps/web/node_modules/playwright/index.mjs';
import { readdirSync, renameSync } from 'node:fs';

const B = 'https://patiently-webmcp.vercel.app';
const OUT = '/home/kuda/hackathon/patiently/video/raw';
const SIZE = { width: 1920, height: 1080 };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });

async function shot(name, viewport, fn) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: viewport },
    ...(viewport.width < 500 ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await ctx.newPage();
  const t0 = Date.now();
  try { await fn(page); } catch (e) { console.log(`  ! ${name}: ${e.message.slice(0, 90)}`); }
  await page.waitForTimeout(1200);
  await ctx.close();                       // flush the video file
  const files = readdirSync(OUT).filter((f) => f.endsWith('.webm') && !f.startsWith('shot-'));
  if (files.length) {
    renameSync(`${OUT}/${files[0]}`, `${OUT}/shot-${name}.webm`);
    console.log(`  ✓ shot-${name}.webm  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
}

const waitTools = async (page, min = 1) => {
  for (let i = 0; i < 240; i++) {
    const n = await page.evaluate(async () => {
      try { return document.modelContext ? (await document.modelContext.getTools()).length : 0; } catch { return 0; }
    });
    if (n >= min) return n;
    await page.waitForTimeout(150);
  }
  throw new Error('tools never registered');
};
const call = (page, name, args = {}) => page.evaluate(async ([n, a]) => {
  const t = (await document.modelContext.getTools()).find((x) => x.name === n);
  const raw = await document.modelContext.executeTool(t, JSON.stringify(a));
  const r = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return (r?.content ?? []).map((c) => c.text).join('\n');
}, [name, args]);
const startCall = (page, name, args = {}) => page.evaluate(async ([n, a]) => {
  window.__r = null;
  const t = (await document.modelContext.getTools()).find((x) => x.name === n);
  window.__p = document.modelContext.executeTool(t, JSON.stringify(a))
    .then((raw) => { const r = typeof raw === 'string' ? JSON.parse(raw) : raw;
      window.__r = (r?.content ?? []).map((c) => c.text).join('\n'); });
}, [name, args]);

// ---------------------------------------------------------------- shots
let ticket;

await shot('01-landing', SIZE, async (p) => {
  await p.goto(B + '/', { waitUntil: 'domcontentloaded' });
  await waitTools(p, 2);
  await p.waitForTimeout(2500);
  await p.mouse.wheel(0, 500); await p.waitForTimeout(2000);
  await p.mouse.wheel(0, -500); await p.waitForTimeout(1200);
  ticket = await p.evaluate(async () => {
    const q = await (await fetch('/api/queue/umum')).json();
    const e = q.waiting[0]; return { id: e.ticket.id, n: e.ticket.ticket_number, name: e.patient.name };
  });
});
console.log(`  patient: ${ticket.n} ${ticket.name}`);

await shot('02-patient-intake-id', { width: 430, height: 932 }, async (p) => {
  await p.goto(`${B}/p/${ticket.id}/intake`, { waitUntil: 'domcontentloaded' });
  await waitTools(p, 6);
  const cta = p.getByRole('button', { name: /Got it/i });
  if (await cta.count()) { await cta.first().click(); await p.waitForTimeout(1500); }
  await call(p, 'set_intake_language', { language: 'id' });
  await p.waitForTimeout(2500);
  await call(p, 'describe_symptoms', {
    message: 'Dada saya terasa sesak sejak pagi tadi, nyerinya menjalar ke lengan kiri. Saya juga berkeringat dingin dan mual.',
  });
  await p.waitForTimeout(4000);
});

await shot('03-patient-escalated', { width: 430, height: 932 }, async (p) => {
  await p.goto(`${B}/p/${ticket.id}`, { waitUntil: 'domcontentloaded' });
  await waitTools(p, 6);
  await p.waitForTimeout(4500);
});

await shot('04-dashboard-queue', SIZE, async (p) => {
  await p.goto(B + '/dashboard', { waitUntil: 'domcontentloaded' });
  await waitTools(p, 11);
  await p.waitForTimeout(1500);
  await call(p, 'list_patient_queue', { only_flagged: true });
  await p.waitForTimeout(3500);
});

await shot('05-chart', SIZE, async (p) => {
  await p.goto(B + '/dashboard', { waitUntil: 'domcontentloaded' });
  await waitTools(p, 11);
  await call(p, 'get_previsit_chart', { ticket: ticket.n });
  await p.waitForTimeout(5000);
});

await shot('06-vitals-gate', SIZE, async (p) => {
  await p.goto(B + '/dashboard', { waitUntil: 'domcontentloaded' });
  await waitTools(p, 11);
  await call(p, 'call_next_patient', { ticket: ticket.n }).catch(() => {});
  const d = p.locator('[role="dialog"]');
  await d.waitFor({ timeout: 20000 }).catch(() => {});
  if (await d.count()) { await p.waitForTimeout(1500); await d.getByRole('button', { name: 'Call patient' }).click(); }
  await p.waitForTimeout(2000);
  await startCall(p, 'record_vitals', { ticket: ticket.n, systolic_bp: 168, diastolic_bp: 98, heart_rate: 104, spo2: 95, pain_score: 7 });
  await d.waitFor({ timeout: 20000 });
  await p.waitForTimeout(3500);                       // hold on the blocking dialog
  await d.getByRole('button', { name: 'Record vitals' }).click();
  await p.waitForTimeout(3000);
});

await shot('07-draft-and-sign', SIZE, async (p) => {
  await p.goto(B + '/dashboard', { waitUntil: 'domcontentloaded' });
  await waitTools(p, 11);
  await call(p, 'draft_soap_note', { ticket: ticket.n });
  await p.waitForTimeout(2500);
  const rx = await call(p, 'draft_prescriptions', { ticket: ticket.n });
  await p.waitForTimeout(2500);
  const drug = (rx.match(/•\s+([A-Za-z][A-Za-z0-9\- ]+?)\s+\d/) || [])[1]?.trim();
  if (drug) {
    await startCall(p, 'sign_prescription', { ticket: ticket.n, drug_name: drug });
    const d = p.locator('[role="dialog"]');
    await d.waitFor({ timeout: 20000 });
    await p.waitForTimeout(4000);                     // hold on interaction warning
    await d.getByRole('button', { name: /Sign prescription/ }).click();
    await p.waitForTimeout(3000);
  }
});

await browser.close();
console.log('\ndone');
