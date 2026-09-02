'use client';

/**
 * WebMCP on the landing page itself.
 *
 * The first question a visitor has is "does my browser actually do this?" —
 * and the most convincing possible answer is a page that already has tools
 * registered when they arrive. So the front door is a WebMCP surface too:
 * a judge can land here and say "open the clinician demo" without touching
 * the keyboard, and the status banner tells them plainly whether their
 * browser is set up before they go looking for a problem that isn't there.
 */
import { useRouter } from 'next/navigation';

import { AgentSessionProvider, useAgentSession } from '@/lib/webmcp/agent-session';
import { useWebMCPTools, type AppToolDefinition } from '@/lib/webmcp/use-webmcp-tool';
import { cn } from '@/lib/utils';

export interface DemoEntry {
  id: string;
  ticket_number: string;
  patient_name: string;
  poli_label: string;
  is_followup: boolean;
}

function LandingTools({ patients }: { patients: DemoEntry[] }) {
  const router = useRouter();

  const tools: AppToolDefinition<any>[] = [
    {
      name: 'list_demo_surfaces',
      description:
        'List the demo surfaces of this clinic that can be opened, and what each one lets an agent do. Call this first to see what is available.',
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: { type: 'object', properties: {} },
      label: () => 'Listed the demo surfaces',
      execute: async () => {
        const lines = [
          'Patiently exposes two agent-facing surfaces:',
          '',
          '1. CLINICIAN DASHBOARD (/dashboard) — 11 tools.',
          '   Read the live patient queue, pull a pre-visit chart, check drug',
          '   interactions, draft SOAP notes and prescriptions. Writing vitals,',
          '   signing a prescription, calling a patient in and closing a visit',
          '   each require the clinician to confirm on screen first.',
          '',
          '2. PATIENT VIEW (/p/<ticket>) — 6 tools.',
          '   Check queue position, do pre-visit intake by voice in English or',
          '   Bahasa Indonesia, switch language, share the queue with a caregiver.',
          '',
          'Patients currently in the waiting room:',
          ...patients.map(
            (p) =>
              `   ${p.ticket_number} — ${p.patient_name}, ${p.poli_label}${p.is_followup ? ', follow-up visit' : ''}`
          ),
          '',
          'Use open_demo to navigate the user to either surface.',
        ];
        return lines.join('\n');
      },
    },
    {
      name: 'open_demo',
      description:
        "Navigate this browser tab to one of the clinic's demo surfaces, so its tools become available. Use 'clinician' for the doctor's dashboard or 'patient' for a patient's waiting-room view.",
      inputSchema: {
        type: 'object',
        properties: {
          surface: {
            type: 'string',
            enum: ['clinician', 'patient'],
            description: "'clinician' = the dashboard, 'patient' = a waiting-room view",
          },
          ticket: {
            type: 'string',
            description:
              'For the patient surface only: which ticket to open, e.g. "A-001". Defaults to the first patient waiting.',
          },
        },
        required: ['surface'],
      },
      label: (i) => `Opened the ${i.surface} demo`,
      execute: async ({ surface, ticket }) => {
        if (surface === 'clinician') {
          router.push('/dashboard');
          return 'Opening the clinician dashboard. Its 11 tools register once the page loads — ask again in a moment if you do not see them yet.';
        }

        const match = ticket
          ? patients.find(
              (p) =>
                p.ticket_number.toLowerCase() === String(ticket).trim().toLowerCase() ||
                p.patient_name.toLowerCase().includes(String(ticket).trim().toLowerCase())
            )
          : patients[0];

        if (!match) {
          throw new Error(
            `No patient matching "${ticket}". Waiting: ${patients.map((p) => p.ticket_number).join(', ') || 'nobody'}.`
          );
        }

        router.push(`/p/${match.id}`);
        return `Opening ${match.ticket_number} — ${match.patient_name}, ${match.poli_label}. Six patient tools register once the page loads.`;
      },
    },
  ];

  useWebMCPTools(tools, [patients.map((p) => p.id).join(',')]);

  return <StatusBanner />;
}

function StatusBanner() {
  const { supported, toolCount, events } = useAgentSession();
  const last = events[events.length - 1];

  return (
    <div
      className={cn(
        'mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-2xl border px-4 py-2.5 text-center text-xs',
        supported
          ? 'border-brand-200 bg-brand-50 text-brand-800'
          : 'border-ink-200 bg-white/70 text-ink-500'
      )}
      role="status"
    >
      {supported ? (
        <>
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-600" />
          </span>
          <span className="font-semibold">
            WebMCP detected — {toolCount} tools live on this page.
          </span>
          <span className="text-brand-700">
            {last
              ? `Last: ${last.label.toLowerCase()}.`
              : 'Try asking your agent to open the clinician demo.'}
          </span>
        </>
      ) : (
        <>
          <span className="h-2 w-2 shrink-0 rounded-full bg-ink-300" aria-hidden />
          <span>
            This page exposes tools to your agent. To use them, open it in
            ChatGPT&rsquo;s in-app browser, or Chrome 149+ with{' '}
            <code className="rounded bg-ink-100 px-1 py-0.5 text-[11px] text-ink-700">
              chrome://flags/#enable-webmcp-testing
            </code>{' '}
            enabled. The demo below works either way.
          </span>
        </>
      )}
    </div>
  );
}

export function LandingAgentSurface({ patients }: { patients: DemoEntry[] }) {
  return (
    <AgentSessionProvider>
      <LandingTools patients={patients} />
    </AgentSessionProvider>
  );
}
