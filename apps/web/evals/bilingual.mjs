/**
 * Bilingual intake evals — real models, real runtime.
 *
 * "A patient does intake in their own language" is claimed on the landing page,
 * in the tool descriptions, in the README and in the submission text, and until
 * now nothing tested it. Three properties matter, and only the first is obvious:
 *
 *   1. The conversation actually happens in Indonesian.
 *   2. The triage classifier fires on Indonesian symptom descriptions. A red-flag
 *      classifier that only works in English is worse than no classifier, because
 *      the queue looks screened.
 *   3. The clinician's chart comes back in English. The patient's language is the
 *      patient's; the doctor should not have to translate a chart to read it.
 *
 * Usage: npm run eval:bilingual [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || process.env.EVAL_BASE_URL || 'https://patiently-webmcp.vercel.app';

let passed = 0, failed = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { failed++; failures.push(name); console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${String(detail).slice(0, 240)}` : ''}`); }
};
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

// Function words that are distinctive enough to identify the language of a
// clinical reply without pulling in a language-detection dependency.
const IND = /\b(saya|Ibu|Bu|yang|sudah|dada|apakah|terima kasih|bagaimana|nyeri|sejak|dengan)\b/i;
const ENG = /\b(the|patient|with|reports|presents|and the|history)\b/i;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });

async function open(path) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 200; i++) {
    const n = await page.evaluate(async () => {
      try { return document.modelContext ? (await document.modelContext.getTools()).length : 0; } catch { return 0; }
    });
    if (n > 0) return page;
    await page.waitForTimeout(150);
  }
  throw new Error(`tools never registered on ${path}`);
}
const call = (page, name, args = {}) =>
  page.evaluate(async ([n, a]) => {
    const tool = (await document.modelContext.getTools()).find((t) => t.name === n);
    if (!tool) return `no such tool: ${n}`;
    try {
      const raw = await document.modelContext.executeTool(tool, JSON.stringify(a));
      const r = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return (r?.content ?? []).map((c) => c.text).join('\n');
    } catch (e) { return 'ERR ' + e.message; }
  }, [name, args]);

const home = await open('/');
const ticket = await home.evaluate(async () => {
  const q = await (await fetch('/api/queue/umum')).json();
  const e = q.waiting[0];
  return e ? { id: e.ticket.id, n: e.ticket.ticket_number } : null;
});
check('a waiting patient to work with', !!ticket, JSON.stringify(ticket));

// ---------------------------------------------------------------------------
section('The conversation happens in the patient’s language');
const patient = await open(`/p/${ticket.id}`);
const switched = await call(patient, 'set_intake_language', { language: 'id' });
check('set_intake_language reports the switch', /Bahasa Indonesia/.test(switched), switched.slice(0, 140));
check('the agent greets in Indonesian, not English', IND.test(switched) && !/^How are you/i.test(switched), switched.slice(0, 200));

const turn1 = await call(patient, 'describe_symptoms', {
  message: 'Dada saya terasa sesak sejak pagi tadi, nyerinya menjalar ke lengan kiri. Saya juga berkeringat dingin dan mual.',
});
check('the reply is in Indonesian', IND.test(turn1), turn1.slice(0, 220));

// ---------------------------------------------------------------------------
section('Triage works on Indonesian, not just English');
check('the red flag fires on an Indonesian description',
  /flagged this as urgent/i.test(turn1), turn1.slice(-300));
const priority = await home.evaluate(async (id) =>
  (await (await fetch(`/api/tickets/${id}`)).json()).priority, ticket.id);
check('the ticket is escalated server-side', priority > 0, `priority=${priority}`);

const turn2 = await call(patient, 'describe_symptoms', {
  message: 'Sekitar dua jam. Makin parah kalau naik tangga. Saya punya darah tinggi.',
});
check('the conversation stays in Indonesian across turns', IND.test(turn2), turn2.slice(0, 200));

const progress = await call(patient, 'get_intake_progress', {});
check('Indonesian answers are still extracted into structured fields',
  /main problem|where it is|how long/i.test(progress), progress.slice(0, 260));

// ---------------------------------------------------------------------------
section('The clinician reads English');
const finishing = call(patient, 'finish_intake', {});
try {
  await patient.waitForSelector('[role="dialog"]', { timeout: 20000 });
  await patient.locator('[role="dialog"]').getByRole('button', { name: 'Send to doctor' }).click();
} catch { /* already complete */ }
await finishing;

const dash = await open('/dashboard');
let chart = '';
for (let i = 0; i < 40; i++) {
  chart = await call(dash, 'get_previsit_chart', { ticket: ticket.n });
  if (/UNTRUSTED_PREVISIT_CHART/.test(chart)) break;
  await dash.waitForTimeout(3000);
}
check('the chart was written', /UNTRUSTED_PREVISIT_CHART/.test(chart), chart.slice(0, 160));
const hpi = (chart.match(/HPI:([\s\S]{0,400})/) || [])[1] || '';
check('the chart is in English', ENG.test(hpi), hpi.slice(0, 200));
check('the chart is not left in Indonesian', !/\b(saya|dada|nyeri|sejak)\b/i.test(hpi), hpi.slice(0, 200));
check('the cardiac concern survived translation',
  /coronary|cardiac|ACS/i.test(chart), (chart.match(/TRIAGE ASSESSMENT:[^\n]*/) || [''])[0].slice(0, 180));

await browser.close();
console.log(`\n${'─'.repeat(60)}`);
console.log(`\x1b[1m${passed} passed, ${failed} failed\x1b[0m`);
failures.forEach((f) => console.log('  - ' + f));
process.exit(failed === 0 ? 0 : 1);
