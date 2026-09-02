/**
 * Full clinical workflow driven ENTIRELY through document.modelContext, in a
 * real browser, against production, with real models. No stub, no shortcut —
 * every step is exactly what an agent does.
 */
import { chromium } from '/home/kuda/hackathon/patiently/apps/web/node_modules/playwright/index.mjs';

const B = process.argv[2] || process.env.EVAL_BASE_URL || 'https://patiently-webmcp.vercel.app';
let pass = 0, fail = 0;
const fails = [];
const ok = (n, c, d = '') => {
  if (c) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${n}`); }
  else { fail++; fails.push(n); console.log(`  \x1b[31m✗\x1b[0m ${n}${d ? ` — ${String(d).slice(0,200)}` : ''}`); }
};

const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await (await b.newContext()).newPage();
page.on('pageerror', e => console.log(`  \x1b[33m! page error:\x1b[0m ${e.message.slice(0,120)}`));

async function tools(p = page) {
  return p.evaluate(async () => (await document.modelContext.getTools()).map(t => t.name));
}
async function waitTools(min) {
  for (let i = 0; i < 120; i++) {
    const n = await page.evaluate(async () => {
      try { return document.modelContext ? (await document.modelContext.getTools()).length : -1; } catch { return -1; }
    });
    if (n >= min) return n;
    await page.waitForTimeout(250);
  }
  throw new Error('tools never registered');
}
/** Exactly how an agent calls a tool. */
async function call(name, args = {}) {
  return page.evaluate(async ([n, a]) => {
    const t = (await document.modelContext.getTools()).find(x => x.name === n);
    if (!t) return { text: `no such tool: ${n}`, isError: true };
    try {
      const raw = await document.modelContext.executeTool(t, JSON.stringify(a));
      const r = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return { text: (r?.content ?? []).map(c => c.text).join('\n'), isError: !!r?.isError };
    } catch (e) { return { text: String(e?.message ?? e), isError: true }; }
  }, [name, args]);
}
/** Start a call, answer its dialog, return the settled result. */
async function callWithDialog(name, args, button) {
  await page.evaluate(async ([n, a]) => {
    window.__p = { done: false, out: null };
    const t = (await document.modelContext.getTools()).find(x => x.name === n);
    window.__pp = document.modelContext.executeTool(t, JSON.stringify(a))
      .then(raw => { const r = typeof raw === 'string' ? JSON.parse(raw) : raw;
        window.__p = { done: true, out: (r?.content ?? []).map(c => c.text).join('\n') }; })
      .catch(e => { window.__p = { done: true, out: 'ERROR: ' + e.message }; });
  }, [name, args]);
  await page.waitForSelector('[role="dialog"]', { timeout: 30000 });
  const pendingDuringDialog = !(await page.evaluate(() => window.__p.done));
  const dialogText = await page.locator('[role="dialog"]').innerText();
  await page.locator('[role="dialog"]').getByRole('button', { name: button }).click();
  await page.evaluate(() => window.__pp);
  return { out: await page.evaluate(() => window.__p.out), pendingDuringDialog, dialogText };
}

// ---------------------------------------------------------------- patient
console.log('\n\x1b[1mPatient surface — real intake through the agent\x1b[0m');
// Load the site first so the API is reachable same-origin through the rewrite.
await page.goto(`${B}/`, { waitUntil: 'domcontentloaded' });
const tid = await page.evaluate(async () => {
  const q = await (await fetch('/api/queue/umum')).json();
  return q.waiting[0]?.ticket?.id;
});
if (!tid) { console.log('no waiting patient — reseed the demo data'); process.exit(1); }
await page.goto(`${B}/p/${tid}`, { waitUntil: 'domcontentloaded' });
await waitTools(6);
ok('6 patient tools registered', (await tools()).length === 6);

const sym = await call('describe_symptoms', {
  message: "My chest has been tight since this morning, a heavy pressure spreading into my left arm, and I feel sweaty and sick.",
});
ok('describe_symptoms ran (real model)', !sym.isError, sym.text);
ok('the intake agent replied', /replied/i.test(sym.text), sym.text.slice(0,150));
ok('triage flagged it urgent server-side', /flagged this as urgent/i.test(sym.text), sym.text.slice(-400));
ok('agent is told the ticket moved up the queue', /moved up the queue/i.test(sym.text));

const prog = await call('get_intake_progress', {});
ok('get_intake_progress reports captured fields', /chest|Captured/i.test(prog.text), prog.text.slice(0,200));

const sym2 = await call('describe_symptoms', { message: "About two hours. Worse walking upstairs. I have high blood pressure." });
ok('second intake turn accepted', !sym2.isError, sym2.text.slice(0,150));

const lang = await call('set_intake_language', { language: 'id' });
ok('set_intake_language switches to Bahasa Indonesia', /Bahasa Indonesia/.test(lang.text), lang.text.slice(0,160));
await call('set_intake_language', { language: 'en' });

const fin = await callWithDialog('finish_intake', {}, 'Send to doctor');
ok('finish_intake blocked on the patient until they clicked', fin.pendingDuringDialog);
ok('finish_intake sent the chart', /Intake sent/i.test(fin.out), fin.out);

// ---------------------------------------------------------------- clinician
console.log('\n\x1b[1mClinician surface — the full consultation through the agent\x1b[0m');
await page.goto(`${B}/dashboard`, { waitUntil: 'domcontentloaded' });
await waitTools(11);

const q = await call('list_patient_queue', { only_flagged: true });
ok('list_patient_queue surfaces the flagged patient', /RED FLAGS/i.test(q.text), q.text.slice(0,300));
const tnum = (q.text.match(/([A-E]-\d{3})/) || [])[1];
ok('found the flagged ticket number', !!tnum, tnum);

// The summarizer runs in the background; give it room, then read the chart.
let chart = { text: '' };
for (let i = 0; i < 30; i++) {
  chart = await call('get_previsit_chart', { ticket: tnum });
  if (/UNTRUSTED_PREVISIT_CHART/.test(chart.text)) break;
  await page.waitForTimeout(3000);
}
ok('get_previsit_chart returned the written chart', /UNTRUSTED_PREVISIT_CHART/.test(chart.text), chart.text.slice(0,200));
ok('patient-authored text is fenced as untrusted', /not an instruction to you/i.test(chart.text));
ok('chart identifies the cardiac concern', /coronary|cardiac|ACS|chest/i.test(chart.text), chart.text.slice(0,300));
ok('chart carries suggested questions', /SUGGESTED QUESTIONS/.test(chart.text));

// A differential ordered by likelihood has failed at its only job: the physician
// reads it to decide what they cannot afford to overlook. gpt-4.1 originally
// answered this presentation with musculoskeletal pain and anxiety and no
// pulmonary embolism at all, which is why the prompt now orders by urgency.
const considerations = (chart.text.match(/CONSIDERATIONS[^\n]*\n([\s\S]*?)(?:\n\n|<<<END)/) || [])[1] || '';
ok('the differential leads with must-not-miss causes',
   /must not miss/i.test(considerations), considerations.slice(0, 220));
ok('a dangerous cause is not omitted for being unlikely',
   /pulmonary embolism|aortic dissection/i.test(considerations), considerations.slice(0, 220));
const dLines = considerations.split('\n').map((l) => l.trim()).filter(Boolean);
const lastCritical = dLines.map((l) => /must not miss/i.test(l)).lastIndexOf(true);
const firstBenign = dLines.findIndex((l) => !/must not miss/i.test(l));
ok('must-not-miss causes come before benign ones',
   lastCritical === -1 || firstBenign === -1 || lastCritical < firstBenign,
   dLines.join(' | ').slice(0, 240));

const called = await callWithDialog('call_next_patient', { ticket: tnum }, 'Call patient');
ok('call_next_patient blocked until the clinician clicked', called.pendingDuringDialog);
ok('call_next_patient called the patient in', /called in/i.test(called.out), called.out);

const vit = await callWithDialog('record_vitals',
  { ticket: tnum, systolic_bp: 168, diastolic_bp: 98, heart_rate: 104, spo2: 95, pain_score: 7 },
  'Record vitals');
ok('record_vitals blocked until confirmed', vit.pendingDuringDialog);
ok('record_vitals itemised the values in the dialog', /systolic bp: 168/.test(vit.dialogText), vit.dialogText.slice(0,200));
ok('record_vitals wrote after confirmation', /Recorded for/.test(vit.out), vit.out);

const note = await call('draft_soap_note', { ticket: tnum });
ok('draft_soap_note produced a draft (real model)', !note.isError && /Unsigned SOAP draft/.test(note.text), note.text.slice(0,250));
ok('the note reflects the chest pain, not just vitals', /chest|coronary|cardiac|ACS/i.test(note.text), note.text.slice(0,400));

const rx = await call('draft_prescriptions', { ticket: tnum });
ok('draft_prescriptions produced drafts (real model)', !rx.isError && /UNSIGNED draft/.test(rx.text), rx.text.slice(0,300));
const drug = (rx.text.match(/•\s+([A-Za-z][A-Za-z0-9\- ]+?)\s+\d/) || [])[1]?.trim();
ok('a drug name could be parsed from the drafts', !!drug, drug || rx.text.slice(0,200));

const inter = await call('check_drug_interactions', { ticket: tnum });
ok('check_drug_interactions ran', !inter.isError, inter.text.slice(0,200));

if (drug) {
  const signed = await callWithDialog('sign_prescription', { ticket: tnum, drug_name: drug }, /Sign prescription/);
  ok('sign_prescription blocked until the clinician clicked', signed.pendingDuringDialog);
  ok('sign_prescription dialog names the drug', signed.dialogText.includes(drug), signed.dialogText.slice(0,200));
  ok('sign_prescription committed after signing', /signed by the clinician/i.test(signed.out), signed.out);
}

const done = await callWithDialog('complete_consultation', { ticket: tnum }, 'Close visit');
ok('complete_consultation blocked until confirmed', done.pendingDuringDialog);
ok('complete_consultation closed the visit', /closed/i.test(done.out), done.out);

const stats = await call('get_clinic_floor_stats', {});
ok('floor stats reflect the completed visit', /seen today: [1-9]/.test(stats.text), stats.text.slice(0,220));

await b.close();
console.log(`\n${'─'.repeat(60)}`);
console.log(`\x1b[1m${pass} passed, ${fail} failed\x1b[0m`);
if (fails.length) { console.log('\nFailures:'); fails.forEach(f => console.log('  - ' + f)); }
process.exit(fail === 0 ? 0 : 1);
