'use client';

/**
 * Patient-side WebMCP tools.
 *
 * The waiting room is the hardest place in a clinic to ask someone to type. The
 * patient may be in pain, holding a child, on a cracked phone screen, or not
 * fluent in the language the form is written in. Exposing intake as tools means
 * they can do it by talking to whatever agent they already use, in whatever
 * language they already speak, and the structured chart still comes out the
 * other end.
 *
 * The safety-critical property here is what is NOT a tool. There is no
 * `set_priority` and no `raise_red_flag`. Triage escalation stays server-side,
 * decided by the Triage Agent reading the patient's actual words. A patient (or
 * a patient's agent) can describe symptoms; neither can move themselves up the
 * queue by asking.
 */
import { useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api';
import {
  POLI_LABEL,
  RED_FLAG_LABELS,
  TICKET_STATUS_LABEL,
  type IntakeSession,
  type TicketDetail,
} from '@/lib/types';
import { useAgentSession } from '@/lib/webmcp/agent-session';
import { useWebMCPTools, type AppToolDefinition } from '@/lib/webmcp/use-webmcp-tool';

/** Tells any mounted intake chat to re-read the session immediately. */
export const INTAKE_UPDATED_EVENT = 'patiently:intake-updated';

function announceIntakeUpdate() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(INTAKE_UPDATED_EVENT));
}

const FIELD_LABELS: Record<string, string> = {
  chief_complaint: 'main problem',
  onset: 'when it started',
  location: 'where it is',
  character: 'what it feels like',
  severity: 'severity',
  duration: 'how long it lasts',
  associated_symptoms: 'other symptoms',
  aggravating: 'what makes it worse',
  relieving: 'what makes it better',
  medications_taken_today: 'medication taken today',
  followup_status: 'follow-up status',
  followup_adherence: 'medication adherence',
  followup_side_effects: 'side effects',
};

function describeCaptured(data: Record<string, unknown>): string[] {
  return Object.entries(data)
    .filter(([, v]) => v != null && v !== '' && (!Array.isArray(v) || v.length > 0))
    .map(([k, v]) => `  ${FIELD_LABELS[k] ?? k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : v}`);
}

export function PatientAgentTools({ ticketId }: { ticketId: string }) {
  const { requestApproval } = useAgentSession();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);

  // Read through a ref so the ticket arriving does not re-register the tools
  // out from under an in-flight call.
  const ticketRef = useRef<TicketDetail | null>(null);
  ticketRef.current = ticket;

  useEffect(() => {
    api.getTicket(ticketId).then(setTicket).catch(() => {});
  }, [ticketId]);

  /** Start intake on demand so the agent never has to know about sessions. */
  const ensureSession = async (): Promise<IntakeSession> => {
    try {
      const existing = await api.getSession(ticketId);
      if (existing.status === 'active') return existing;
      return existing;
    } catch {
      return api.startIntake(ticketId, 'en');
    }
  };

  const tools: AppToolDefinition<any>[] = [
    {
      name: 'get_queue_status',
      description:
        "Check this patient's live place in the clinic queue: position, how long the wait is expected to be, and who is being seen now.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: { type: 'object', properties: {} },
      label: () => 'Checked queue status',
      execute: async () => {
        const t = await api.getTicket(ticketId);
        const q = await api.getQueue(t.poli);
        const mine = [...q.waiting, ...q.in_intake, ...q.intake_complete].find(
          (e) => e.ticket.id === ticketId
        );

        const lines = [
          `Ticket ${t.ticket_number} · ${t.patient.name} · ${POLI_LABEL[t.poli]}`,
          `Status: ${TICKET_STATUS_LABEL[t.status]}`,
          `Now serving: ${q.now_serving?.ticket_number ?? 'nobody yet'}`,
        ];
        if (mine) {
          lines.push(
            `Position ${mine.position} in line — roughly ${mine.eta_minutes_low}-${mine.eta_minutes_high} minutes.`
          );
        } else if (t.status === 'in_consultation') {
          lines.push('You are with the doctor now.');
        } else if (t.status === 'done') {
          lines.push('This visit is finished.');
        }
        if (t.triage_flags.length) {
          lines.push(
            `The clinic has prioritised this ticket (${t.triage_flags
              .map((f) => RED_FLAG_LABELS[f] || f)
              .join(', ')}). Staff have been alerted.`
          );
        }
        return lines.join('\n');
      },
    },

    {
      name: 'describe_symptoms',
      description:
        "Tell the clinic's intake agent about the patient's symptoms, in any language. Use this to answer the intake questions on the patient's behalf. The clinic's own triage system reads every message independently and will alert staff if it detects a danger sign.",
      inputSchema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description:
              "What the patient wants to tell the clinic, in their own words. Pass their meaning faithfully; do not diagnose or embellish.",
          },
        },
        required: ['message'],
      },
      label: (i) => `Sent intake answer: "${String(i.message).slice(0, 40)}${String(i.message).length > 40 ? '…' : ''}"`,
      execute: async ({ message }) => {
        const text = String(message ?? '').trim();
        if (!text) throw new Error('Nothing to send — provide the patient message.');

        await ensureSession();
        const before = await api.getTicket(ticketId).catch(() => null);

        const reply = await api.sendMessage(ticketId, text);
        const session = await api.getSession(ticketId).catch(() => null);
        announceIntakeUpdate();

        const out = [`The clinic's intake agent replied:\n"${reply.reply_text}"`];

        const captured = describeCaptured(reply.extracted_fields ?? {});
        if (captured.length) {
          out.push(`\nAdded to the chart:\n${captured.join('\n')}`);
        }

        // Escalation is the clinic's decision, reported back as an outcome.
        if (reply.triage_flags?.length) {
          const labels = reply.triage_flags
            .map((f) => RED_FLAG_LABELS[f] || f)
            .join(', ');
          out.push(
            `\n⚠ The clinic's triage system flagged this as urgent (${labels}). ` +
              `Staff have been alerted and this ticket has been moved up the queue. ` +
              `Tell the patient to notify reception immediately if symptoms worsen.`
          );
        } else if (before && before.priority > 0) {
          out.push('\nThis ticket is already prioritised.');
        }

        if (reply.is_complete || session?.status === 'completed') {
          out.push(
            '\nIntake has everything it needs. Call finish_intake to send the chart to the doctor.'
          );
        }
        return out.join('\n');
      },
    },

    {
      name: 'get_intake_progress',
      description:
        'See what the clinic has captured so far for this visit and what is still missing, so the agent knows what to ask the patient next.',
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: { type: 'object', properties: {} },
      label: () => 'Checked intake progress',
      execute: async () => {
        let session: IntakeSession;
        try {
          session = await api.getSession(ticketId);
        } catch {
          return 'Intake has not started yet. Call describe_symptoms to begin.';
        }

        const captured = describeCaptured(
          (session.structured_data ?? {}) as Record<string, unknown>
        );
        const missing = Object.keys(FIELD_LABELS).filter(
          (k) => !(k in (session.structured_data ?? {}))
        );

        return [
          `Intake status: ${session.status}${session.language ? ` · language: ${session.language}` : ''}`,
          captured.length ? `\nCaptured:\n${captured.join('\n')}` : '\nNothing captured yet.',
          missing.length
            ? `\nStill unknown: ${missing.slice(0, 6).map((m) => FIELD_LABELS[m]).join(', ')}`
            : '\nAll core fields captured.',
          session.summary
            ? '\nThe pre-visit chart has been written and is ready for the doctor.'
            : '',
        ]
          .filter(Boolean)
          .join('\n');
      },
    },

    {
      name: 'set_intake_language',
      description:
        'Switch the intake conversation between English and Bahasa Indonesia. Use it when the patient is more comfortable in the other language.',
      inputSchema: {
        type: 'object',
        properties: {
          language: {
            type: 'string',
            enum: ['en', 'id'],
            description: 'en = English, id = Bahasa Indonesia',
          },
        },
        required: ['language'],
      },
      label: (i) => `Switched intake to ${i.language === 'id' ? 'Bahasa Indonesia' : 'English'}`,
      execute: async ({ language }) => {
        const lang = language === 'id' ? 'id' : 'en';
        const session = await api.startIntake(ticketId, lang);
        announceIntakeUpdate();
        const name = lang === 'id' ? 'Bahasa Indonesia' : 'English';
        const opening = session.messages.filter((m) => m.role === 'agent').slice(-1)[0];
        return `Intake is now in ${name}.${opening ? `\n\nThe agent says: "${opening.content}"` : ''}`;
      },
    },

    {
      name: 'finish_intake',
      description:
        "Send the completed intake to the doctor. This writes the patient's pre-visit chart and makes it visible to clinical staff, so the patient is asked to confirm first.",
      inputSchema: { type: 'object', properties: {} },
      label: () => 'Proposed finishing intake',
      execute: async (_input, { signal }) => {
        const session = await api.getSession(ticketId).catch(() => null);
        if (!session) throw new Error('Intake has not started yet.');
        if (session.status === 'completed') {
          return 'Intake was already sent to the doctor.';
        }

        const captured = describeCaptured(
          (session.structured_data ?? {}) as Record<string, unknown>
        );
        const ok = await requestApproval(
          {
            title: 'Send your intake to the doctor?',
            summary:
              'This shares what you told the intake agent with the clinical team.',
            lines: captured.length ? captured : ['Nothing captured yet.'],
            confirmLabel: 'Send to doctor',
          },
          signal
        );
        if (!ok) return 'The patient declined — nothing was sent.';

        const done = await api.completeIntake(ticketId);
        announceIntakeUpdate();
        return done.summary
          ? `Intake sent. The doctor now has a pre-visit chart for "${done.summary.chief_complaint}".`
          : 'Intake sent to the doctor.';
      },
    },

    {
      name: 'get_caregiver_share_link',
      description:
        'Get a link that lets a family member or caregiver follow this queue position live from their own phone.',
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: { type: 'object', properties: {} },
      label: () => 'Fetched caregiver share link',
      execute: async () => {
        const t = ticketRef.current ?? (await api.getTicket(ticketId));
        const url =
          typeof window !== 'undefined'
            ? `${window.location.origin}/p/${ticketId}`
            : `/p/${ticketId}`;
        return `Share this with a caregiver so they can follow ticket ${t.ticket_number} live:\n${url}`;
      },
    },
  ];

  useWebMCPTools(tools, [ticketId, requestApproval]);

  return null;
}
