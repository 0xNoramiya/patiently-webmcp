/**
 * WebMCP eval harness.
 *
 * Drives the real app in a real browser against the REAL `document.modelContext`
 * the site installs, calling every tool exactly the way an agent does:
 * `executeTool(toolObject, JSON.stringify(args))`, result parsed back from the
 * JSON string the runtime returns.
 *
 * This used to inject a stub. The stub was more forgiving than the real runtime
 * and hid three genuine bugs — tools that threw before their body ran because
 * the runtime passes one argument where the spec passes two, tools that
 * unregistered themselves mid-call, and the fact that nothing registered at all
 * in a browser without native WebMCP. Testing against a convenient fiction is
 * worse than not testing. The interesting assertions are the safety
 * properties:
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

const BASE = process.argv[2] || process.env.EVAL_BASE_URL || 'http://localhost:3000';

const EXPECTED_CLINICIAN = [
  'call_next_patient', 'check_drug_interactions', 'complete_consultation',
  'draft_prescriptions', 'draft_soap_note', 'get_clinic_floor_stats',
  'get_previsit_chart', 'get_vitals', 'list_patient_queue', 'record_vitals',
  'sign_prescription',
];

const EXPECTED_PATIENT = [
  'describe_symptoms', 'finish_intake', 'get_caregiver_share_link',
  'get_intake_progress', 'get_queue_status', 'set_intake_language',
];

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

/**
 * Call a tool exactly as an agent does.
 *
 * The runtime takes the RegisteredTool object (not its name) plus a JSON
 * *string* of arguments, and returns the result JSON-serialized to a string.
 * Getting any part of that wrong looks like a broken tool, so the harness
 * speaks the real protocol.
 */
async function callTool(page, name, args = {}) {
  return page.evaluate(
    async ([n, a]) => {
      const tools = await document.modelContext.getTools();
      const tool = tools.find((t) => t.name === n);
      if (!tool) return { text: `no such tool: ${n}`, isError: true };
      try {
        const raw = await document.modelContext.executeTool(tool, JSON.stringify(a));
        const res = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return {
          text: (res?.content ?? []).map((c) => c.text).join('\n'),
          isError: !!res?.isError,
        };
      } catch (err) {
        return { text: String(err?.message ?? err), isError: true };
      }
    },
    [name, args]
  );
}

/** Start a tool call without awaiting it, so we can inspect the pending state. */
async function callToolDeferred(page, name, args = {}) {
  await page.evaluate(
    async ([n, a]) => {
      window.__pending = { settled: false, result: null };
      const tools = await document.modelContext.getTools();
      const tool = tools.find((t) => t.name === n);
      window.__pendingPromise = document.modelContext
        .executeTool(tool, JSON.stringify(a))
        .then((raw) => {
          const res = typeof raw === 'string' ? JSON.parse(raw) : raw;
          window.__pending.settled = true;
          window.__pending.result = (res?.content ?? []).map((c) => c.text).join('\n');
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

/**
 * Wait until at least `min` tools are registered.
 *
 * Polls from Node rather than via page.waitForFunction: getTools() is async,
 * and an async predicate handed to waitForFunction returns a Promise — which is
 * always truthy, so it would resolve immediately and wait for nothing.
 */
async function waitForTools(page, min, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let count = 0;
  while (Date.now() < deadline) {
    count = await page.evaluate(async () => {
      try {
        return document.modelContext ? (await document.modelContext.getTools()).length : -1;
      } catch {
        return -1;
      }
    });
    if (count >= min) return count;
    await page.waitForTimeout(250);
  }
  throw new Error(
    `timed out waiting for ${min} tools on ${page.url()} (last saw ${count === -1 ? 'no modelContext' : count})`
  );
}

// ---------------------------------------------------------------------------

async function main() {
  // Allow pointing at an already-installed Chromium (CI caches, local dev)
  // instead of forcing a fresh `playwright install`.
  const executablePath = process.env.CHROME_PATH || undefined;
  const browser = await chromium.launch({ executablePath });
  const context = await browser.newContext();
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
  const patientNames = patientTools.map((t) => t.name).sort();
  check(
    `registers all ${EXPECTED_PATIENT.length} patient tools (got ${patientTools.length})`,
    JSON.stringify(patientNames) === JSON.stringify(EXPECTED_PATIENT),
    patientNames.join(', ')
  );

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
  section('Discovery surface');
  // The manifest and llms.txt are served from a hand-written catalogue, so the
  // only thing keeping them honest is this: what the site *claims* to expose
  // must equal what it actually registers.
  const manifest = await page.evaluate(async () => {
    const r = await fetch('/.well-known/webmcp');
    return r.ok ? r.json() : { error: `HTTP ${r.status}` };
  });
  check('/.well-known/webmcp is served as JSON', !manifest.error, manifest.error);
  check(
    'manifest declares document.modelContext',
    manifest?.runtime?.api === 'document.modelContext',
    JSON.stringify(manifest?.runtime)?.slice(0, 100)
  );

  const bySurface = Object.fromEntries(
    (manifest.surfaces || []).map((s) => [s.path, s.tools.map((t) => t.name).sort()])
  );
  check(
    'manifest matches the tools registered on the front door',
    JSON.stringify(bySurface['/']) === JSON.stringify(['list_demo_surfaces', 'open_demo']),
    JSON.stringify(bySurface['/'])
  );
  check(
    'manifest matches the tools registered on the dashboard',
    JSON.stringify(bySurface['/dashboard']) === JSON.stringify(EXPECTED_CLINICIAN),
    JSON.stringify(bySurface['/dashboard'])
  );
  check(
    'manifest matches the tools registered on a patient page',
    JSON.stringify(bySurface['/p/{ticket}']) === JSON.stringify(EXPECTED_PATIENT),
    JSON.stringify(bySurface['/p/{ticket}'])
  );
  check(
    'manifest tool_count equals the sum of its surfaces',
    manifest.tool_count === Object.values(bySurface).flat().length,
    `${manifest.tool_count} vs ${Object.values(bySurface).flat().length}`
  );
  check(
    'every commit-tier tool is marked as requiring human confirmation',
    (manifest.surfaces || [])
      .flatMap((s) => s.tools)
      .every((t) => (t.tier === 'commit') === (t.requiresHumanConfirmation === true)),
    'tier and requiresHumanConfirmation disagree'
  );

  const llms = await page.evaluate(async () => {
    const r = await fetch('/llms.txt');
    return r.ok ? r.text() : `HTTP ${r.status}`;
  });
  check('/llms.txt is served', llms.startsWith('# Patiently'), llms.slice(0, 80));
  check(
    '/llms.txt documents every registered tool',
    EXPECTED_CLINICIAN.concat(EXPECTED_PATIENT).every((n) => llms.includes(n)),
    'a registered tool is missing from llms.txt'
  );
  check(
    '/llms.txt states the no-self-escalation property',
    /cannot talk its way up the queue/i.test(llms)
  );

  const robots = await page.evaluate(async () => (await fetch('/robots.txt')).text());
  check('robots.txt allows GPTBot', /User-Agent: GPTBot/i.test(robots), robots.slice(0, 80));
  check('robots.txt keeps crawlers out of patient pages', /Disallow: \/p\//.test(robots));

  const head = await page.evaluate(() => ({
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    og: document.querySelector('meta[property="og:title"]')?.getAttribute('content'),
    ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content'),
    twitter: document.querySelector('meta[name="twitter:card"]')?.getAttribute('content'),
    jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((n) => n.textContent),
    manifestLink: document.querySelector('link[href="/.well-known/webmcp"]')?.getAttribute('type'),
  }));
  check('canonical URL is present', !!head.canonical, String(head.canonical));
  check('Open Graph title is present', !!head.og, String(head.og));
  check('Open Graph image is present', !!head.ogImage, String(head.ogImage));
  check('Twitter card is present', head.twitter === 'summary_large_image', String(head.twitter));
  check('JSON-LD is present and parses', (() => {
    try { return head.jsonld.length > 0 && !!JSON.parse(head.jsonld[0])['@graph']; }
    catch { return false; }
  })(), 'JSON-LD missing or malformed');
  check('the manifest is advertised from the document head', head.manifestLink === 'application/json', String(head.manifestLink));

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
