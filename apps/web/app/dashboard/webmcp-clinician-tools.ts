'use client';

/**
 * Clinician-side WebMCP tools.
 *
 * These run inside the doctor's already-authenticated dashboard tab. That is
 * the whole reason this is WebMCP and not a server-side MCP server: there is no
 * key exchange, no OAuth dance, no second copy of the clinic's auth model. The
 * agent borrows the session the clinician already has, and every effect it
 * causes is rendered in the same UI the clinician is looking at.
 *
 * The trust boundary is deliberate and consistent:
 *
 *   read      → runs immediately, `readOnlyHint: true`
 *   draft     → runs immediately, but produces something explicitly UNSIGNED
 *   commit    → files a proposal and blocks on a human click
 *
 * Nothing that changes a patient's care — signing a prescription, calling the
 * next patient, closing a consultation — happens without that click. The agent
 * cannot route around it: the write only exists on the approved branch.
 */
import { useRef } from 'react';

import { api } from '@/lib/api';
import {
  intakeSummaryFailed,
  intakeWasUnscreened,
  POLI_LABEL,
  RED_FLAG_LABELS,
  TICKET_STATUS_LABEL,
  type IntakeSession,
  type Poli,
  type QueueEntry,
  type QueueState,
  type TicketDetail,
} from '@/lib/types';
import {
  describeNonApproval,
  useAgentSession,
} from '@/lib/webmcp/agent-session';
import { wrapUntrusted } from '@/lib/webmcp/runtime';
import { useWebMCPTools, type AppToolDefinition } from '@/lib/webmcp/use-webmcp-tool';

const POLI_LIST: Poli[] = ['umum', 'anak', 'kia', 'gigi', 'lansia'];

const POLI_ENUM = {
  type: 'string' as const,
  enum: POLI_LIST,
  description:
    'Clinic department. umum=General, anak=Pediatrics, kia=OB-GYN, gigi=Dental, lansia=Geriatrics.',
};

const TICKET_ARG = {
  type: 'string' as const,
  description:
    'Ticket number as shown on the board, e.g. "A-014". The patient name also works.',
};

interface ClinicianToolDeps {
  adminPassword: string;
  queue: QueueState | null;
  activePoli: Poli;
  setActivePoli: (p: Poli) => void;
  selectedTicketId: string | null;
  setSelectedTicketId: (id: string) => void;
  ticketDetail: TicketDetail | null;
  intakeSession: IntakeSession | null;
  refreshQueue: () => Promise<void>;
  refreshDetail: (id: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Formatting helpers — the agent reads prose, so keep it dense and unambiguous.
// ---------------------------------------------------------------------------

function flagLabels(flags: string[]): string {
  return flags.map((f) => RED_FLAG_LABELS[f] || f).join(', ');
}

function describeEntry(e: QueueEntry, poli: Poli): string {
  const flags = e.triage_flags.length
    ? `  ⚠ RED FLAGS: ${flagLabels(e.triage_flags)}`
    : '';
  return [
    `${e.ticket.ticket_number} · ${e.patient.name} (${e.patient.age}${e.patient.sex})`,
    `  ${POLI_LABEL[poli]} · position ${e.position} · ETA ${e.eta_minutes_low}-${e.eta_minutes_high} min`,
    `  status: ${TICKET_STATUS_LABEL[e.ticket.status]}${e.ticket.is_followup ? ' · FOLLOW-UP' : ''}`,
    flags,
  ]
    .filter(Boolean)
    .join('\n');
}

function allEntries(q: QueueState): QueueEntry[] {
  return [...q.waiting, ...q.in_intake, ...q.intake_complete, ...q.in_consultation];
}

/**
 * Fetch every department's queue in parallel.
 *
 * A partial failure is reported, not swallowed. If one department's queue is
 * unreachable, telling the agent "no such patient" would be a lie that reads
 * as a clinical fact — the patient may well be there, behind a 500. The caller
 * surfaces `failed` so the agent can say the floor data is incomplete.
 */
async function fetchAllQueues(): Promise<{
  queues: Array<[Poli, QueueState]>;
  failed: Poli[];
}> {
  const results = await Promise.all(
    POLI_LIST.map(async (p): Promise<[Poli, QueueState] | Poli> => {
      try {
        return [p, await api.getQueue(p)];
      } catch {
        return p;
      }
    })
  );
  return {
    queues: results.filter((r): r is [Poli, QueueState] => Array.isArray(r)),
    failed: results.filter((r): r is Poli => !Array.isArray(r)),
  };
}

/**
 * Resolve whatever the agent called the patient into a real ticket.
 *
 * Agents refer to patients the way humans in the room do — "A-014", "the chest
 * pain guy", "Siti". Making the tools accept that, instead of demanding a UUID
 * the agent has no way to know, is most of what makes this surface usable.
 */
async function resolveTicket(
  ref: string
): Promise<{ entry: QueueEntry; poli: Poli; failed: Poli[] } | { failed: Poli[] }> {
  const needle = ref.trim().toLowerCase();
  const { queues, failed } = await fetchAllQueues();

  for (const [poli, q] of queues) {
    for (const e of allEntries(q)) {
      if (e.ticket.ticket_number.toLowerCase() === needle)
        return { entry: e, poli, failed };
    }
  }
  for (const [poli, q] of queues) {
    for (const e of allEntries(q)) {
      if (e.patient.name.toLowerCase().includes(needle))
        return { entry: e, poli, failed };
    }
  }
  return { failed };
}

async function requireTicket(ref: string) {
  const found = await resolveTicket(ref);
  if ('entry' in found) return found;

  if (found.failed.length) {
    throw new Error(
      `Could not search ${found.failed.map((p) => POLI_LABEL[p]).join(', ')} — ` +
        `the clinic system did not respond. "${ref}" may still be waiting there. Retry before concluding anything.`
    );
  }
  throw new Error(
    `No active patient matching "${ref}". Call list_patient_queue to see who is on the floor.`
  );
}

// ---------------------------------------------------------------------------

export function useClinicianTools(deps: ClinicianToolDeps) {
  const { requestApproval } = useAgentSession();

  /**
   * Live dashboard state, read through a ref.
   *
   * These tools deliberately drive the clinician's screen — focusing a patient
   * switches the selected department. That state used to sit in the
   * registration dependency list, which meant a tool could tear down its own
   * registration halfway through executing, and the runtime would abort the
   * call it was still running with "Tool unregistered". Registration is now
   * stable and the closures read current values from here instead.
   */
  const live = useRef(deps);
  live.current = deps;

  const pw = deps.adminPassword;

  /** Bring a patient into focus on the clinician's actual screen. */
  const focus = async (ticketId: string, poli: Poli) => {
    live.current.setActivePoli(poli);
    live.current.setSelectedTicketId(ticketId);
    await live.current.refreshDetail(ticketId).catch(() => {});
  };

  const tools: AppToolDefinition<any>[] = [
    // -----------------------------------------------------------------
    // READ
    // -----------------------------------------------------------------
    {
      name: 'list_patient_queue',
      description:
        'List patients currently waiting or in consultation, with queue position, expected wait, and any triage red flags. Use this first to see the clinic floor. Covers all departments unless one is named.',
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          poli: POLI_ENUM,
          only_flagged: {
            type: 'boolean',
            description: 'Return only patients with an active triage red flag.',
          },
        },
      },
      label: (i) =>
        i?.only_flagged ? 'Listed flagged patients' : 'Listed the patient queue',
      execute: async ({ poli, only_flagged }) => {
        const { queues, failed } = poli
          ? {
              queues: [
                [poli as Poli, await api.getQueue(poli as Poli)] as [Poli, QueueState],
              ],
              failed: [] as Poli[],
            }
          : await fetchAllQueues();

        const blocks: string[] = [];
        let total = 0;

        for (const [p, q] of queues) {
          let entries = allEntries(q);
          if (only_flagged) entries = entries.filter((e) => e.triage_flags.length > 0);
          if (!entries.length) continue;

          entries.sort((a, b) => b.ticket.priority - a.ticket.priority || a.position - b.position);
          total += entries.length;
          blocks.push(
            `### ${POLI_LABEL[p]} — now serving ${q.now_serving?.ticket_number ?? 'nobody'} (avg consult ${q.avg_consultation_minutes} min)\n` +
              entries.map((e) => describeEntry(e, p)).join('\n')
          );
        }

        const warning = failed.length
          ? `\n\n⚠ Could not reach ${failed
              .map((p) => POLI_LABEL[p])
              .join(', ')} — this list is incomplete.`
          : '';

        if (!total) {
          const empty = only_flagged
            ? 'No patients currently have a triage red flag.'
            : 'The queue is empty — no patients are waiting.';
          return `${empty}${warning}`;
        }
        return `${total} patient(s) on the floor.\n\n${blocks.join('\n\n')}${warning}`;
      },
    },

    {
      name: 'get_previsit_chart',
      description:
        "Read the pre-visit chart the intake agents prepared for one patient: chief complaint, history of present illness, what changed since their last visit, suggested questions, and differentials to consider. Read this before seeing the patient.",
      // The chart embeds the patient's own words. It must reach the clinician's
      // agent verbatim, so it is fenced rather than filtered.
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      inputSchema: {
        type: 'object',
        properties: { ticket: TICKET_ARG },
        required: ['ticket'],
      },
      label: (i) => `Read pre-visit chart for ${i.ticket}`,
      execute: async ({ ticket }) => {
        const { entry, poli } = await requireTicket(ticket);
        await focus(entry.ticket.id, poli);

        const detail = await api.getTicket(entry.ticket.id);
        let session: IntakeSession | null = null;
        try {
          session = await api.getSession(entry.ticket.id);
        } catch {
          /* intake may not have started */
        }

        // "No triage red flags" is only true if something looked. When the
        // classifier did not run, saying it is a false reassurance sitting one
        // line above the warning that contradicts it.
        const screened = !intakeWasUnscreened(session);
        const head = [
          `${detail.ticket_number} · ${detail.patient.name} (${detail.patient.age}${detail.patient.sex})`,
          `${POLI_LABEL[detail.poli]} · ${TICKET_STATUS_LABEL[detail.status]}${detail.is_followup ? ' · FOLLOW-UP VISIT' : ''}`,
          detail.triage_flags.length
            ? `⚠ ACTIVE RED FLAGS: ${flagLabels(detail.triage_flags)}`
            : screened
              ? 'No triage red flags.'
              : 'Red flags: NOT SCREENED — see the warning below.',
        ].join('\n');

        if (detail.previous_visit) {
          const pv = detail.previous_visit;
          const rx = pv.prescriptions
            .map((p) => `${p.drug_name} ${p.dose} ${p.frequency} × ${p.duration_days}d`)
            .join('; ');
          const prev = [
            '',
            `PREVIOUS VISIT (${pv.visit_date}): ${pv.chief_complaint}`,
            pv.diagnosis_icd10 ? `  Dx: ${pv.diagnosis_icd10}` : '',
            rx ? `  Rx: ${rx}` : '',
          ]
            .filter(Boolean)
            .join('\n');
          return renderChart(head + prev, session);
        }
        return renderChart(head, session);
      },
    },

    {
      name: 'get_clinic_floor_stats',
      description:
        'Current clinic throughput: how many are waiting, average wait and consultation time, red flags raised today, intakes completed, notes and reminders generated.',
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: { type: 'object', properties: {} },
      label: () => 'Read clinic floor stats',
      execute: async () => {
        const s = await api.getStats(pw);
        const flags = Object.entries(s.triage.by_flag)
          .map(([k, v]) => `${RED_FLAG_LABELS[k] || k}: ${v}`)
          .join(', ');
        return [
          `As of ${new Date(s.as_of).toLocaleTimeString()}:`,
          `  waiting: ${s.tickets.waiting} · in consultation: ${s.tickets.in_consultation} · seen today: ${s.tickets.seen_today}`,
          `  avg wait: ${s.avg_wait_minutes ?? '—'} min · avg consult: ${s.avg_consult_minutes ?? '—'} min`,
          `  intakes completed today: ${s.intakes_completed_today}`,
          `  triage red flags today: ${s.triage.total_today}${flags ? ` (${flags})` : ''}`,
          `  SOAP notes: ${s.notes_today} · transcripts: ${s.transcripts_today}`,
          `  reminders sent: ${s.reminders.sent_today} · pending: ${s.reminders.pending}`,
        ].join('\n');
      },
    },

    {
      name: 'get_vitals',
      description:
        'Read the vital signs recorded for a patient this visit, including any values flagged as critical.',
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: {
        type: 'object',
        properties: { ticket: TICKET_ARG },
        required: ['ticket'],
      },
      label: (i) => `Read vitals for ${i.ticket}`,
      execute: async ({ ticket }) => {
        const { entry } = await requireTicket(ticket);
        const v = await api.getVitals(entry.ticket.id, pw);
        if (!v) return `No vitals recorded yet for ${entry.ticket.ticket_number}.`;
        const parts = [
          v.systolic_bp && v.diastolic_bp ? `BP ${v.systolic_bp}/${v.diastolic_bp}` : '',
          v.heart_rate ? `HR ${v.heart_rate}` : '',
          v.respiratory_rate ? `RR ${v.respiratory_rate}` : '',
          v.temperature_c ? `Temp ${v.temperature_c}°C` : '',
          v.spo2 ? `SpO₂ ${v.spo2}%` : '',
          v.weight_kg ? `Wt ${v.weight_kg}kg` : '',
          v.pain_score != null ? `Pain ${v.pain_score}/10` : '',
        ].filter(Boolean);
        const crit = v.critical_labels.length
          ? `\n⚠ CRITICAL: ${v.critical_labels.join(', ')}`
          : '';
        return `${entry.ticket.ticket_number} vitals: ${parts.join(' · ')}${crit}`;
      },
    },

    {
      name: 'check_drug_interactions',
      description:
        "Cross-check every drug in play for this patient — current prescription drafts, home medications, and what was prescribed at the last visit — and report interactions by severity.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: {
        type: 'object',
        properties: { ticket: TICKET_ARG },
        required: ['ticket'],
      },
      label: (i) => `Checked drug interactions for ${i.ticket}`,
      execute: async ({ ticket }) => {
        const { entry } = await requireTicket(ticket);
        const r = await api.getInteractions(entry.ticket.id, pw);
        if (!r.interactions.length) {
          return `No interactions found across ${r.drug_count} drug(s) for ${entry.ticket.ticket_number}.`;
        }
        const lines = r.interactions
          .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
          .map((i) => `  [${i.severity.toUpperCase()}] ${i.drug_a} + ${i.drug_b} — ${i.rationale}`);
        return [
          `${r.interactions.length} interaction(s) across ${r.drug_count} drug(s) for ${entry.ticket.ticket_number}:`,
          ...lines,
          '',
          `Sources — drafts: ${r.sources.drafts.join(', ') || 'none'}; home meds: ${r.sources.home_meds.join(', ') || 'none'}; previous Rx: ${r.sources.previous_rx.join(', ') || 'none'}`,
        ].join('\n');
      },
    },

    // -----------------------------------------------------------------
    // DRAFT — writes something explicitly unsigned. Reversible, so no gate.
    // -----------------------------------------------------------------
    {
      name: 'draft_soap_note',
      description:
        'Draft a SOAP-format consultation note for a patient from their pre-visit chart and vitals. Produces an UNSIGNED draft in the clinician\'s note editor for review — it does not enter the record. Requires the pre-visit chart to be written first; it will tell you if it is not ready yet.',
      inputSchema: {
        type: 'object',
        properties: { ticket: TICKET_ARG },
        required: ['ticket'],
      },
      label: (i) => `Drafted SOAP note for ${i.ticket}`,
      execute: async ({ ticket }) => {
        const { entry, poli } = await requireTicket(ticket);
        await focus(entry.ticket.id, poli);

        // The note is written FROM the pre-visit chart. The chart is produced by
        // a background summarizer that lands a few seconds after intake ends, so
        // an agent that drafts too early gets a note built from vitals alone —
        // silently missing the patient's own account of why they came in. That
        // is the most dangerous kind of wrong: confident, well-formed, and
        // absent the chief complaint. Refuse while it is still coming.
        let session: IntakeSession | null = null;
        try {
          session = await api.getSession(entry.ticket.id);
        } catch {
          /* no intake session at all — handled below */
        }

        if (session && !session.summary) {
          if (session.status === 'active') {
            throw new Error(
              `${entry.ticket.ticket_number} is still in intake. Drafting now would produce a note with no patient-reported history. Wait until intake completes, then try again.`
            );
          }
          if (intakeSummaryFailed(session)) {
            throw new Error(
              `The pre-visit chart for ${entry.ticket.ticket_number} failed to generate, so there is nothing to draft a note from — retrying will not help. The patient's intake answers were still recorded; take the history yourself.`
            );
          }
          throw new Error(
            `The pre-visit chart for ${entry.ticket.ticket_number} is still being written (this takes a few seconds after intake ends). Drafting now would omit the patient's own account of their symptoms. Try again shortly.`
          );
        }

        const note = await api.draftNote(entry.ticket.id, pw);
        if (note.status === 'failed') {
          throw new Error(note.error || 'note drafting failed');
        }
        await live.current.refreshDetail(entry.ticket.id).catch(() => {});
        const provenance = session
          ? ''
          : `\n⚠ This patient never completed pre-visit intake, so the note is built from vitals and previous-visit records only — it contains no history in the patient's own words.`;
        return [
          `Unsigned SOAP draft ready for ${entry.ticket.ticket_number} — now on screen for review.${provenance}`,
          `S: ${note.subjective ?? '—'}`,
          `O: ${note.objective ?? '—'}`,
          `A: ${note.assessment ?? '—'}`,
          `P: ${note.plan ?? '—'}`,
        ].join('\n');
      },
    },

    {
      name: 'draft_prescriptions',
      description:
        'Draft candidate prescriptions for a patient, each with a rationale, then automatically screen them for drug interactions. Drafts are UNSIGNED — a clinician must approve each one before it becomes a prescription.',
      inputSchema: {
        type: 'object',
        properties: { ticket: TICKET_ARG },
        required: ['ticket'],
      },
      label: (i) => `Drafted prescriptions for ${i.ticket}`,
      execute: async ({ ticket }) => {
        const { entry, poli } = await requireTicket(ticket);
        await focus(entry.ticket.id, poli);

        const drafts = await api.draftPrescriptions(entry.ticket.id, pw);
        if (!drafts.length) return `No prescriptions drafted for ${entry.ticket.ticket_number}.`;

        const lines = drafts.map(
          (d) =>
            `  • ${d.drug_name} ${d.dose} ${d.frequency} × ${d.duration_days}d — ${d.rationale ?? 'no rationale given'}`
        );

        let interactionText = '';
        try {
          const r = await api.getInteractions(entry.ticket.id, pw);
          if (r.interactions.length) {
            const worst = r.interactions
              .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
              .map((i) => `  [${i.severity.toUpperCase()}] ${i.drug_a} + ${i.drug_b} — ${i.rationale}`);
            interactionText = `\n\n⚠ Interaction screen flagged ${r.interactions.length}:\n${worst.join('\n')}`;
          } else {
            interactionText = '\n\nInteraction screen: clear.';
          }
        } catch {
          interactionText = '\n\nInteraction screen unavailable.';
        }

        await live.current.refreshDetail(entry.ticket.id).catch(() => {});
        return [
          `${drafts.length} UNSIGNED draft(s) for ${entry.ticket.ticket_number}, now on screen:`,
          ...lines,
          interactionText,
          '',
          'Use sign_prescription to ask the clinician to approve one. They must click to confirm.',
        ].join('\n');
      },
    },

    // -----------------------------------------------------------------
    // COMMIT — blocks on a human click.
    // -----------------------------------------------------------------
    {
      name: 'record_vitals',
      description:
        'Record vital signs for a patient, e.g. values the clinician just read aloud. Critical values are flagged automatically. Requires the clinician to confirm on screen before anything is written.',
      inputSchema: {
        type: 'object',
        properties: {
          ticket: TICKET_ARG,
          systolic_bp: { type: 'number', description: 'Systolic BP, mmHg' },
          diastolic_bp: { type: 'number', description: 'Diastolic BP, mmHg' },
          heart_rate: { type: 'number', description: 'Heart rate, bpm' },
          respiratory_rate: { type: 'number', description: 'Respiratory rate, /min' },
          temperature_c: { type: 'number', description: 'Temperature, °C' },
          spo2: { type: 'number', description: 'Oxygen saturation, %' },
          weight_kg: { type: 'number' },
          height_cm: { type: 'number' },
          pain_score: { type: 'number', description: 'Pain score 0-10' },
        },
        required: ['ticket'],
      },
      label: (i) => `Proposed vitals for ${i.ticket}`,
      execute: async ({ ticket, ...vitals }, { signal }) => {
        const { entry, poli } = await requireTicket(ticket);
        await focus(entry.ticket.id, poli);

        const measured = Object.entries(vitals).filter(([, v]) => v != null);
        if (!measured.length) throw new Error('No vital signs given.');

        const lines = measured.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`);
        const outcome = await requestApproval(
          {
            title: `Record vitals for ${entry.ticket.ticket_number}`,
            summary: `${entry.patient.name} — agent proposes writing these to the chart.`,
            lines,
            confirmLabel: 'Record vitals',
          },
          signal
        );
        if (outcome !== 'approved') {
          return describeNonApproval(
            outcome,
            `nothing was recorded for ${entry.ticket.ticket_number}.`
          );
        }

        const saved = await api.recordVitals(
          entry.ticket.id,
          { ...vitals, recorded_by: 'agent (clinician-confirmed)' },
          pw
        );
        await live.current.refreshDetail(entry.ticket.id).catch(() => {});
        const crit = saved.critical_labels.length
          ? ` ⚠ CRITICAL: ${saved.critical_labels.join(', ')}`
          : '';
        return `Recorded for ${entry.ticket.ticket_number} after clinician confirmation.${crit}`;
      },
    },

    {
      name: 'sign_prescription',
      description:
        'Ask the clinician to sign one of the unsigned prescription drafts. This is a prescribing decision: it always requires an explicit click from the clinician, and the agent cannot complete it alone.',
      inputSchema: {
        type: 'object',
        properties: {
          ticket: TICKET_ARG,
          drug_name: {
            type: 'string',
            description: 'Which drafted drug to sign, e.g. "Amoxicillin".',
          },
        },
        required: ['ticket', 'drug_name'],
      },
      label: (i) => `Requested signature: ${i.drug_name} for ${i.ticket}`,
      execute: async ({ ticket, drug_name }, { signal }) => {
        const { entry, poli } = await requireTicket(ticket);
        await focus(entry.ticket.id, poli);

        const drafts = await api.listPrescriptions(entry.ticket.id, pw);
        const target = drafts.find(
          (d) => d.drug_name.toLowerCase() === String(drug_name).trim().toLowerCase()
        );
        if (!target) {
          throw new Error(
            `No draft named "${drug_name}" for ${entry.ticket.ticket_number}. Drafts: ${drafts.map((d) => d.drug_name).join(', ') || 'none'}.`
          );
        }
        if (target.approved) {
          return `${target.drug_name} was already signed for ${entry.ticket.ticket_number}.`;
        }

        // Surface interactions in the confirmation itself — the clinician should
        // see the risk at the moment of signing, not have to go look for it.
        let warn: string[] = [];
        try {
          const r = await api.getInteractions(entry.ticket.id, pw);
          warn = r.interactions
            .filter((i) =>
              [i.drug_a, i.drug_b].some(
                (d) => d.toLowerCase() === target.drug_name.toLowerCase()
              )
            )
            .map((i) => `⚠ ${i.severity.toUpperCase()}: with ${
              i.drug_a.toLowerCase() === target.drug_name.toLowerCase() ? i.drug_b : i.drug_a
            } — ${i.rationale}`);
        } catch {
          /* interaction screen is advisory */
        }

        const outcome = await requestApproval(
          {
            title: `Sign ${target.drug_name} for ${entry.ticket.ticket_number}`,
            summary: `${entry.patient.name} — ${target.dose} ${target.frequency} × ${target.duration_days} days.`,
            lines: [
              target.rationale ? `Rationale: ${target.rationale}` : '',
              target.instructions ? `Instructions: ${target.instructions}` : '',
              ...warn,
            ].filter(Boolean),
            danger: warn.length > 0,
            confirmLabel: 'Sign prescription',
          },
          signal
        );
        if (outcome !== 'approved') {
          return describeNonApproval(
            outcome,
            `${target.drug_name} for ${entry.ticket.ticket_number} remains an unsigned draft.`
          );
        }

        await api.approvePrescription(target.id, true, pw);
        await live.current.refreshDetail(entry.ticket.id).catch(() => {});
        return `${target.drug_name} signed by the clinician for ${entry.ticket.ticket_number}.`;
      },
    },

    {
      name: 'call_next_patient',
      description:
        'Call a patient in from the waiting room. This physically summons them and shows their number on the clinic display, so it always requires clinician confirmation.',
      inputSchema: {
        type: 'object',
        properties: {
          ticket: {
            type: 'string',
            description:
              'Ticket number to call. Omit to call whoever is next by priority — red-flagged patients first.',
          },
          poli: POLI_ENUM,
        },
      },
      label: (i) => (i?.ticket ? `Proposed calling ${i.ticket}` : 'Proposed calling the next patient'),
      execute: async ({ ticket, poli }, { signal }) => {
        let target: { entry: QueueEntry; poli: Poli };

        if (ticket) {
          target = await requireTicket(ticket);
        } else {
          const p = (poli as Poli) || live.current.activePoli;
          const q = await api.getQueue(p);
          const candidates = [...q.intake_complete, ...q.waiting, ...q.in_intake].sort(
            (a, b) => b.ticket.priority - a.ticket.priority || a.position - b.position
          );
          if (!candidates.length) return `Nobody is waiting in ${POLI_LABEL[p]}.`;
          target = { entry: candidates[0], poli: p };
        }

        await focus(target.entry.ticket.id, target.poli);
        const flags = target.entry.triage_flags.length
          ? `⚠ ${flagLabels(target.entry.triage_flags)}`
          : '';

        const outcome = await requestApproval(
          {
            title: `Call ${target.entry.ticket.ticket_number} in`,
            summary: `${target.entry.patient.name} (${target.entry.patient.age}${target.entry.patient.sex}) — ${POLI_LABEL[target.poli]}, position ${target.entry.position}.`,
            lines: [flags, 'This displays their number in the waiting room.'].filter(Boolean),
            confirmLabel: 'Call patient',
          },
          signal
        );
        if (outcome !== 'approved') {
          return describeNonApproval(
            outcome,
            `${target.entry.ticket.ticket_number} was not called.`
          );
        }

        await api.callNext(target.entry.ticket.id, pw);
        await live.current.refreshQueue().catch(() => {});
        await live.current.refreshDetail(target.entry.ticket.id).catch(() => {});
        return `${target.entry.ticket.ticket_number} (${target.entry.patient.name}) called in.`;
      },
    },

    {
      name: 'complete_consultation',
      description:
        'Close out the consultation for a patient and release them from the queue. Requires clinician confirmation.',
      inputSchema: {
        type: 'object',
        properties: { ticket: TICKET_ARG },
        required: ['ticket'],
      },
      label: (i) => `Proposed closing ${i.ticket}`,
      execute: async ({ ticket }, { signal }) => {
        const { entry, poli } = await requireTicket(ticket);
        await focus(entry.ticket.id, poli);

        const outcome = await requestApproval(
          {
            title: `Close consultation ${entry.ticket.ticket_number}`,
            summary: `${entry.patient.name} — marks the visit done and frees the room.`,
            confirmLabel: 'Close visit',
          },
          signal
        );
        if (outcome !== 'approved') {
          return describeNonApproval(
            outcome,
            `${entry.ticket.ticket_number} is still open.`
          );
        }

        await api.completeTicket(entry.ticket.id, pw);
        await live.current.refreshQueue().catch(() => {});
        return `${entry.ticket.ticket_number} closed.`;
      },
    },
  ];

  useWebMCPTools(tools, [pw, requestApproval]);
}

// ---------------------------------------------------------------------------

function severityRank(s: string): number {
  return s === 'major' ? 3 : s === 'moderate' ? 2 : 1;
}

function renderChart(head: string, session: IntakeSession | null): string {
  // Lead with it. A clinician reading a chart with an unscreened turn needs to
  // know before they read anything reassuring in it.
  const unscreened = intakeWasUnscreened(session)
    ? '\n\n⚠ TRIAGE SCREENING INCOMPLETE — at least one of this patient\u2019s intake ' +
      'messages was never screened for red flags, because the classifier was ' +
      'unavailable at the time. Absence of red flags below does NOT mean none ' +
      'are present. Screen this patient yourself.'
    : '';

  if (!session?.summary) {
    // "Not written yet" and "could not be written" lead to different actions:
    // one is worth waiting for, the other is not.
    const why = intakeSummaryFailed(session)
      ? 'The pre-visit chart FAILED to generate — the summarizer was unavailable when this ' +
        "patient finished intake, and it will not appear on its own. Their answers were still " +
        'recorded; take the history yourself.'
      : 'No pre-visit chart yet — this patient has not completed intake.';
    return `${head}${unscreened}\n\n${why}`;
  }
  const s = session.summary;
  const body = [
    `CHIEF COMPLAINT: ${s.chief_complaint}`,
    '',
    `HPI: ${s.hpi_paragraph}`,
    s.relevant_history.length ? `\nRELEVANT HISTORY:\n${s.relevant_history.map((h) => `  - ${h}`).join('\n')}` : '',
    s.followup_delta
      ? `\nSINCE LAST VISIT:\n${Object.entries(s.followup_delta)
          .filter(([, v]) => v != null && (!Array.isArray(v) || v.length))
          .map(([k, v]) => `  ${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join('\n')}`
      : '',
    `\nTRIAGE ASSESSMENT: ${s.triage_assessment}`,
    s.suggested_questions.length
      ? `\nSUGGESTED QUESTIONS:\n${s.suggested_questions.map((q) => `  - ${q}`).join('\n')}`
      : '',
    s.differentials.length
      ? `\nCONSIDERATIONS (not diagnoses):\n${s.differentials.map((d) => `  - ${d}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `${head}${unscreened}\n\n${wrapUntrusted('previsit_chart', body)}`;
}
