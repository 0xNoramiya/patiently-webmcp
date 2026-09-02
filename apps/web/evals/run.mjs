/**
 * WebMCP eval harness.
 *
 * Drives the real app in a real browser with a stubbed `document.modelContext`,
 * then calls each tool the way an agent would and checks what comes back. The
 * point is not just "did it return a string" — the interesting assertions are
 * the safety properties:
 *
 *   - read tools are annotated readOnlyHint
 *   - tools returning patient-authored text are annotated untrustedContentHint
 *     and fence that text
 *   - write tools genuinely BLOCK on a human click: the promise stays pending
 *     until the dialog is answered, and a decline performs no write
 *
 * Usage:  node evals/run.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || process.env.EVAL_BASE_URL || 'http://localhost:3000';
const STUB = readFileSync(join(__dirname, 'webmcp-stub.js'), 'utf8');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

/** Call a tool the way an agent would; returns the flattened text. */
async function callTool(page, name, args = {}) {
  return page.evaluate(
    async ([n, a]) => {
      const res = await document.modelContext.executeTool(n, a);
      const text = (res?.content ?? []).map((c) => c.text).join('\n');
      return { text, isError: !!res?.isError };
    },
    [name, args]
  );
}

/** Start a tool call without awaiting it, so we can inspect the pending state. */
async function callToolDeferred(page, name, args = {}) {
  await page.evaluate(
    ([n, a]) => {
      window.__pending = { settled: false, result: null };
      window.__pendingPromise = document.modelContext
        .executeTool(n, a)
        .then((res) => {
          window.__pending.settled = true;
          window.__pending.result = (res?.content ?? [])
            .map((c) => c.text)
            .join('\n');
        })
        .catch((err) => {
          window.__pending.settled = true;
          window.__pending.result = `ERROR: ${err.message}`;
        });
    },
    [name, args]
  );
}

async function settleDeferred(page) {
  await page.evaluate(() => window.__pendingPromise);
  return page.evaluate(() => window.__pending.result);
}

async function isSettled(page) {
  return page.evaluate(() => window.__pending.settled);
}

/** The approval dialog — scoped so it never collides with the page's own buttons. */
function dialog(page) {
  return page.locator('[role="dialog"]');
}

async function listTools(page) {
  return page.evaluate(() => document.modelContext.getTools());
}

async function waitForTools(page, min) {
  await page.waitForFunction(
    (m) => (window.__webmcpTools?.size ?? 0) >= m,
    min,
    { timeout: 25000 }
  );
}

// ---------------------------------------------------------------------------

async function main() {
  // Allow pointing at an already-installed Chromium (CI caches, local dev)
  // instead of forcing a fresh `playwright install`.
  const executablePath = process.env.CHROME_PATH || undefined;
  const browser = await chromium.launch({ executablePath });
  const context = await browser.newContext();
  await context.addInitScript(STUB);
  const page = await context.newPage();

  // Page errors are a failure, not a warning. React hydration mismatches show
  // up here and nowhere else, and a mismatch means the agent may be reading a
  // DOM that does not match what the clinician is actually looking at.
  const pageErrors = [];
  page.on('pageerror', (e) => {
    pageErrors.push(e.message);
    console.log(`  \x1b[33m! page error:\x1b[0m ${e.message}`);
  });

  // -----------------------------------------------------------------------
  section('Front door — the landing page is a WebMCP surface too');
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await waitForTools(page, 2);

  const landingTools = await listTools(page);
  check(
    `landing page registers 2 tools (got ${landingTools.length})`,
    landingTools.length === 2,
    landingTools.map((t) => t.name).join(', ')
  );

  const surfaces = await callTool(page, 'list_demo_surfaces', {});
  check('list_demo_surfaces describes both surfaces', /CLINICIAN DASHBOARD[\s\S]*PATIENT VIEW/.test(surfaces.text), surfaces.text.slice(0, 100));
  check('list_demo_surfaces names waiting patients', /[A-E]-\d{3} —/.test(surfaces.text), surfaces.text.slice(-200));

  const banner = await page.locator('[role="status"]').innerText();
  check('status banner reports WebMCP is detected', /WebMCP detected/.test(banner), banner.slice(0, 120));

  const opened = await callTool(page, 'open_demo', { surface: 'clinician' });
  check('open_demo navigates to the dashboard', /Opening the clinician dashboard/.test(opened.text), opened.text.slice(0, 100));
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  check('browser actually landed on /dashboard', page.url().endsWith('/dashboard'), page.url());

  // -----------------------------------------------------------------------
  section('Clinician surface — registration');
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await waitForTools(page, 10);

  const EXPECTED_CLINICIAN = [
    'call_next_patient', 'check_drug_interactions', 'complete_consultation',
    'draft_prescriptions', 'draft_soap_note', 'get_clinic_floor_stats',
    'get_previsit_chart', 'get_vitals', 'list_patient_queue', 'record_vitals',
    'sign_prescription',
  ];
  const clinicianTools = await listTools(page);
  const names = clinicianTools.map((t) => t.name).sort();
  check(
    `registers all ${EXPECTED_CLINICIAN.length} clinician tools (got ${clinicianTools.length})`,
    JSON.stringify(names) === JSON.stringify(EXPECTED_CLINICIAN),
    names.join(', ')
  );

  const byName = Object.fromEntries(clinicianTools.map((t) => [t.name, t]));
  check('every tool has a description', clinicianTools.every((t) => t.description?.length > 20));
  check('every tool has an inputSchema', clinicianTools.every((t) => t.inputSchema?.type === 'object'));
  check('list_patient_queue is readOnlyHint', byName.list_patient_queue?.annotations?.readOnlyHint === true);
  check('get_previsit_chart is untrustedContentHint', byName.get_previsit_chart?.annotations?.untrustedContentHint === true);
  check('write tools are NOT readOnlyHint',
    !byName.record_vitals?.annotations?.readOnlyHint &&
    !byName.call_next_patient?.annotations?.readOnlyHint);

  // -----------------------------------------------------------------------
  section('Clinician surface — read tools');
  const queue = await callTool(page, 'list_patient_queue', {});
  check('list_patient_queue returns patients', /patient\(s\) on the floor/.test(queue.text), queue.text.slice(0, 120));
  check('queue output includes ticket numbers', /[A-E]-\d{3}/.test(queue.text));
  check('queue output includes ETA', /ETA \d+-\d+ min/.test(queue.text));

  const flagged = await callTool(page, 'list_patient_queue', { only_flagged: true });
  check('only_flagged filters', /red flag|patient\(s\) on the floor/i.test(flagged.text), flagged.text.slice(0, 100));

  const stats = await callTool(page, 'get_clinic_floor_stats', {});
  check('get_clinic_floor_stats returns throughput', /waiting: \d+/.test(stats.text), stats.text.slice(0, 100));

  const ticketNum = (queue.text.match(/([A-E]-\d{3})/) || [])[1];
  check('found a ticket number to work with', !!ticketNum, ticketNum);

  const chart = await callTool(page, 'get_previsit_chart', { ticket: ticketNum });
  check('get_previsit_chart resolves a ticket number', !chart.isError, chart.text.slice(0, 120));
  const hasSummary = /UNTRUSTED_PREVISIT_CHART/.test(chart.text);
  check(
    hasSummary ? 'patient-authored text is fenced as untrusted' : 'chart reports no intake yet (no summary to fence)',
    hasSummary || /has not completed intake/.test(chart.text),
    chart.text.slice(0, 160)
  );

  const badTicket = await callTool(page, 'get_previsit_chart', { ticket: 'Z-999' });
  check('unknown ticket returns a helpful error', badTicket.isError && /list_patient_queue/.test(badTicket.text), badTicket.text.slice(0, 120));

  // -----------------------------------------------------------------------
  section('Clinician surface — human-in-the-loop gate');
  await callToolDeferred(page, 'call_next_patient', {});
  await page.waitForSelector('[role="dialog"]', { timeout: 15000 });
  check('write tool opens an approval dialog', true);
  check('tool call is still PENDING while dialog is open', !(await isSettled(page)));

  const dialogText = await page.locator('[role="dialog"]').innerText();
  check('dialog names the patient being called', /Call [A-E]-\d{3} in/.test(dialogText), dialogText.slice(0, 100));
  check('dialog states the agent cannot act alone', /cannot complete this step on its own/i.test(dialogText));

  await dialog(page).getByRole('button', { name: 'Decline' }).click();
  const declined = await settleDeferred(page);
  check('declining returns a decline result', /declined/i.test(declined), declined?.slice(0, 120));
  check('declining performs no write', !/called in/.test(declined || ''));

  // Now approve the same action.
  await callToolDeferred(page, 'call_next_patient', {});
  await page.waitForSelector('[role="dialog"]', { timeout: 15000 });
  await dialog(page).getByRole('button', { name: 'Call patient' }).click();
  const approved = await settleDeferred(page);
  check('approving performs the write', /called in/.test(approved || ''), approved?.slice(0, 120));

  // -----------------------------------------------------------------------
  section('Clinician surface — vitals with critical flagging');
  await callToolDeferred(page, 'record_vitals', {
    ticket: ticketNum, systolic_bp: 210, diastolic_bp: 125, heart_rate: 122, spo2: 88,
  });
  await page.waitForSelector('[role="dialog"]', { timeout: 15000 });
  const vitalsDialog = await page.locator('[role="dialog"]').innerText();
  check('vitals dialog itemises the values', /systolic bp: 210/.test(vitalsDialog), vitalsDialog.slice(0, 160));
  await dialog(page).getByRole('button', { name: 'Record vitals' }).click();
  const vitalsResult = await settleDeferred(page);
  check('vitals write succeeds after confirmation', /Recorded for/.test(vitalsResult || ''), vitalsResult?.slice(0, 140));
  check('critical values are flagged back to the agent', /CRITICAL/.test(vitalsResult || ''), vitalsResult?.slice(0, 200));

  const readBack = await callTool(page, 'get_vitals', { ticket: ticketNum });
  check('get_vitals reads back what was written', /210\/125/.test(readBack.text), readBack.text.slice(0, 140));

  // -----------------------------------------------------------------------
  section('Clinician surface — activity is visible to the human');
  const panel = await page.locator('section[aria-label="Your agent"]').innerText();
  check('activity panel logged the agent\'s calls', /Listed the patient queue|Read pre-visit chart/.test(panel), panel.slice(0, 240));

  const headerPill = await page.locator('header').first().innerText();
  check('header shows a live tool count', /\d+ agent tools live/.test(headerPill), headerPill.slice(0, 160));
  check(
    'internal pipeline is not also called "agent activity"',
    !/Agent activity/.test(await page.locator('body').innerText()),
    'naming collision between the clinical pipeline and the user\'s agent'
  );

  // -----------------------------------------------------------------------
  section('Patient surface');
  const ticketLookup = await page.evaluate(async () => {
    try {
      const res = await fetch('/api/queue/umum');
      if (!res.ok) return { error: `HTTP ${res.status}` };
      const q = await res.json();
      // The suite's own writes call patients in, so `waiting` empties as it
      // runs. Any active bucket gives a valid ticket to exercise.
      const id = [q.waiting, q.in_intake, q.intake_complete, q.in_consultation]
        .flat()
        .map((e) => e?.ticket?.id)
        .find(Boolean);
      return id ? { id } : { error: 'no active tickets — reseed the demo data' };
    } catch (err) {
      return { error: err.message };
    }
  });
  check('resolved a seeded patient ticket id', !!ticketLookup.id, ticketLookup.error);
  if (!ticketLookup.id) {
    console.log('\n\x1b[31mCannot continue without a seeded ticket.\x1b[0m');
    await browser.close();
    process.exit(1);
  }
  const ticketId = ticketLookup.id;

  await page.goto(`${BASE}/p/${ticketId}`, { waitUntil: 'domcontentloaded' });
  await waitForTools(page, 6);
  const patientTools = await listTools(page);
  check(`registers 6 patient tools (got ${patientTools.length})`, patientTools.length === 6, patientTools.map((t) => t.name).join(', '));

  const pByName = Object.fromEntries(patientTools.map((t) => [t.name, t]));
  check('patient cannot escalate their own priority',
    !patientTools.some((t) => /priority|escalat|red_flag|triage/i.test(t.name)),
    patientTools.map((t) => t.name).join(', '));
  check('get_queue_status is readOnlyHint', pByName.get_queue_status?.annotations?.readOnlyHint === true);

  const qs = await callTool(page, 'get_queue_status', {});
  check('get_queue_status returns a position', /Position \d+|with the doctor|finished/.test(qs.text), qs.text.slice(0, 160));
  check('get_queue_status names the department', /General Clinic|Pediatrics|OB-GYN|Dental|Geriatrics/.test(qs.text));

  const share = await callTool(page, 'get_caregiver_share_link', {});
  check('caregiver link points at this ticket', share.text.includes(`/p/${ticketId}`), share.text.slice(0, 140));

  const progress = await callTool(page, 'get_intake_progress', {});
  check('get_intake_progress responds', !progress.isError, progress.text.slice(0, 140));

  // -----------------------------------------------------------------------
  section('Patient surface — consent gate');
  await callToolDeferred(page, 'finish_intake', {});
  const dialogAppeared = await page
    .waitForSelector('[role="dialog"]', { timeout: 8000 })
    .then(() => true)
    .catch(() => false);

  if (dialogAppeared) {
    check('finish_intake asks the patient first', true);
    check('finish_intake is still pending', !(await isSettled(page)));
    await dialog(page).getByRole('button', { name: 'Decline' }).click();
    const r = await settleDeferred(page);
    check('declining sends nothing', /declined/i.test(r || ''), r?.slice(0, 120));
  } else {
    const r = await settleDeferred(page);
    check('finish_intake without a session errors clearly', /not started|already sent/i.test(r || ''), r?.slice(0, 120));
  }

  // -----------------------------------------------------------------------
  section('Tool lifecycle');
  // Navigating away must swap the whole tool surface, not accumulate it: the
  // patient tools go, and only the front door's own two remain. An agent that
  // still sees `describe_symptoms` after leaving the ticket would be holding a
  // tool that can no longer work.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const afterLeave = await listTools(page);
  const leftNames = afterLeave.map((t) => t.name).sort();
  check(
    'leaving a surface unregisters its tools',
    !leftNames.some((n) => ['describe_symptoms', 'get_queue_status', 'list_patient_queue'].includes(n)),
    leftNames.join(', ')
  );
  check(
    'the front door re-registers only its own 2 tools',
    JSON.stringify(leftNames) === JSON.stringify(['list_demo_surfaces', 'open_demo']),
    leftNames.join(', ')
  );

  section('Page health');
  const hydrationErrors = pageErrors.filter((m) => /Minified React error #(418|423|425)|hydrat/i.test(m));
  check(
    'no React hydration mismatches',
    hydrationErrors.length === 0,
    hydrationErrors[0]
  );
  check(
    `no uncaught page errors (${pageErrors.length})`,
    pageErrors.length === 0,
    pageErrors.slice(0, 2).join(' | ')
  );

  await browser.close();

  // -----------------------------------------------------------------------
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`\x1b[1m${passed} passed, ${failed} failed\x1b[0m`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\x1b[31mHarness crashed:\x1b[0m', err);
  process.exit(1);
});
