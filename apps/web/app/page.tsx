import Link from 'next/link';

import { LandingAgentSurface, type DemoEntry } from './webmcp-landing';

const POLI_LABEL: Record<string, string> = {
  umum: 'General Clinic',
  anak: 'Pediatrics',
  kia: 'OB-GYN',
  gigi: 'Dental',
  lansia: 'Geriatrics',
};

/** Read the live waiting room so the demo links point at real tickets. */
async function fetchWaitingPatients(): Promise<DemoEntry[]> {
  const base = process.env.INTERNAL_API_URL || 'http://api:8000';
  const polis = ['umum', 'anak', 'kia', 'gigi', 'lansia'] as const;
  const out: DemoEntry[] = [];

  for (const p of polis) {
    try {
      const res = await fetch(`${base}/api/queue/${p}`, { cache: 'no-store' });
      if (!res.ok) continue;
      const q = (await res.json()) as {
        waiting: {
          ticket: { id: string; ticket_number: string; is_followup: boolean };
          patient: { name: string };
        }[];
      };
      for (const e of q.waiting) {
        out.push({
          id: e.ticket.id,
          ticket_number: e.ticket.ticket_number,
          patient_name: e.patient.name,
          poli_label: POLI_LABEL[p] ?? p,
          is_followup: e.ticket.is_followup,
        });
      }
    } catch {
      /* a department being unreachable shouldn't blank the page */
    }
  }
  return out;
}

const TRUST_TIERS = [
  {
    tier: 'Read',
    title: 'Your agent sees the whole floor',
    body: 'Who is waiting, how long, who has a red flag, what the intake agents already wrote in their chart, and what their last visit was for. Five read-only tools, answered from the session the clinician is already signed into.',
  },
  {
    tier: 'Draft',
    title: 'It can write, but nothing is signed',
    body: 'It drafts a SOAP note from the intake, proposes prescriptions with a rationale for each drug, and screens them against home medications and last visit’s script. Everything it produces is explicitly marked unsigned.',
  },
  {
    tier: 'Commit',
    title: 'Then it stops and waits for you',
    body: 'Recording vitals, signing a prescription, calling a patient in, closing a visit — each one opens a dialog and blocks. The agent’s own execute() is parked on your click, so the write does not exist unless you approve it.',
  },
];

export default async function Home() {
  const patients = await fetchWaitingPatients();
  const followup = patients.find((p) => p.is_followup) ?? null;
  const fresh = patients.find((p) => !p.is_followup) ?? null;
  const primaryPatient = followup ?? fresh;
  const altPatient = followup && fresh ? fresh : null;

  return (
    <main className="relative flex min-h-screen flex-col">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-brand-50 via-white to-ink-50" />

      <header className="flex items-center justify-between px-6 py-6 md:px-12">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-600 shadow-soft">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 21s-7-4.3-7-10a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 5.7-7 10-7 10h-4z"
                stroke="white"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path d="M9 11h6M12 8v6" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="font-display text-lg font-bold text-ink-900">Patiently</div>
            <div className="text-xs text-ink-500">An agent-native clinic</div>
          </div>
        </div>
        <a
          href="https://github.com/0xNoramiya/patiently-webmcp"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost text-xs"
        >
          GitHub ↗
        </a>
      </header>

      <section className="flex-1 px-6 py-8 md:px-12">
        <div className="mx-auto w-full max-w-3xl text-center">
          <LandingAgentSurface patients={patients} />

          <h1 className="mt-10 font-display text-4xl font-bold leading-[1.1] text-ink-900 text-balance md:text-6xl">
            A clinic your agent
            <br />
            <span className="text-brand-700">can actually use.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-500 text-pretty">
            Patiently exposes a working outpatient clinic — its queue, its
            charts, its prescriptions — as <strong className="font-semibold text-ink-700">20 WebMCP tools</strong>.
            A doctor runs their floor by talking. A patient does intake in their
            own language. Each through the agent they already have, in the tab
            they are already signed into.
          </p>

          <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-ink-500 text-pretty">
            And every action that touches a patient&rsquo;s care stops and waits
            for a human to click.
          </p>

          {/* The trust model is the product, so it leads. */}
          <div className="mt-12 grid grid-cols-1 gap-4 text-left md:grid-cols-3">
            {TRUST_TIERS.map((t) => (
              <div key={t.tier} className="card-padded flex flex-col">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-brand-700">
                  {t.tier}
                </div>
                <h2 className="mt-1.5 font-display font-semibold text-ink-900 text-balance">
                  {t.title}
                </h2>
                <p className="mt-2 text-sm leading-snug text-ink-500">{t.body}</p>
              </div>
            ))}
          </div>

          <p className="mt-8 text-xs text-ink-400">
            Built on <span className="font-semibold">WebMCP</span> ·{' '}
            <span className="font-semibold">OpenAI</span> ·{' '}
            <span className="font-semibold">FastAPI</span> ·{' '}
            <span className="font-semibold">Next.js 14</span> ·{' '}
            <span className="font-semibold">PostgreSQL</span>
          </p>

          <hr className="my-10 border-ink-100" />

          <h2 className="font-display text-2xl font-bold text-ink-900 text-balance md:text-3xl">
            Try it from either side
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-ink-500 text-pretty">
            The same live queue, seen from both ends of the visit. No sign-in —
            open one in each tab and watch them move together.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-4 text-left md:grid-cols-2">
            <DemoCard
              href="/dashboard"
              eyebrow="Clinician · 11 tools"
              title="Run the clinic floor"
              body="The live queue across five departments, pre-visit charts written before the patient walks in, and drafting that stops at your signature."
              tags={['Queue + red flags', 'SOAP drafting', 'Rx + interactions', 'Approval gate']}
            />

            {primaryPatient ? (
              <DemoCard
                href={`/p/${primaryPatient.id}`}
                eyebrow={`Patient · ${primaryPatient.ticket_number} · 6 tools`}
                title={`Wait as ${primaryPatient.patient_name.split(' ')[0]}`}
                body={
                  primaryPatient.is_followup
                    ? `${primaryPatient.poli_label} follow-up. Intake greets by name and picks up from last week's prescription.`
                    : `${primaryPatient.poli_label}, new complaint. Describe symptoms and watch triage read every turn independently.`
                }
                tags={['Live queue', 'Voice + photo', 'EN ↔ ID', 'Caregiver link']}
              />
            ) : (
              <div className="card-padded flex flex-col justify-center text-center">
                <h3 className="font-display font-semibold text-ink-900">
                  The waiting room is empty
                </h3>
                <p className="mt-2 text-sm leading-snug text-ink-500">
                  Every patient has been seen. Open the clinician dashboard to
                  look at the floor, or reseed the demo data to start a fresh
                  clinic day.
                </p>
              </div>
            )}
          </div>

          {altPatient && (
            <p className="mt-6 text-xs text-ink-400">
              Or jump straight to a new-complaint ticket:{' '}
              <Link
                href={`/p/${altPatient.id}`}
                className="font-semibold text-brand-700 underline-offset-2 hover:underline"
              >
                {altPatient.ticket_number} · {altPatient.patient_name}
              </Link>
            </p>
          )}
        </div>
      </section>

      <footer className="px-6 py-8 text-center text-xs text-ink-400 md:px-12">
        Built for the OpenAI WebMCP Challenge, 2026. The clinical platform
        pre-dates the challenge; the entire WebMCP layer is new —{' '}
        <a
          href="https://github.com/0xNoramiya/patiently-webmcp#provenance--what-is-new-and-what-is-not"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-ink-500 underline-offset-2 hover:underline"
        >
          see the breakdown
        </a>
        .
      </footer>
    </main>
  );
}

function DemoCard({
  href,
  eyebrow,
  title,
  body,
  tags,
}: {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  tags: string[];
}) {
  return (
    <Link
      href={href}
      className="group card relative overflow-hidden p-6 transition-shadow hover:shadow-card"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-50/0 to-brand-50/60 opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-brand-700">
            {eyebrow}
          </span>
          <span
            className="text-xs text-ink-400 transition-colors group-hover:text-brand-700"
            aria-hidden
          >
            →
          </span>
        </div>
        <h3 className="font-display text-xl font-bold text-ink-900 text-balance">
          {title}
        </h3>
        <p className="mt-2 text-sm leading-snug text-ink-500">{body}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-ink-100 px-2 py-1 text-[10px] font-medium text-ink-700"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
