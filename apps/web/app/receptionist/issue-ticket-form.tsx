'use client';

/**
 * The declarative half of this site's WebMCP surface.
 *
 * Everywhere else, tools are registered imperatively with
 * `document.modelContext.registerTool`. This one is a plain HTML form carrying
 * `toolname` / `tooldescription` / `toolparamdescription` attributes: the
 * browser derives the input schema from the form controls themselves, and an
 * agent invoking the tool fills the fields in front of the receptionist.
 *
 * There is deliberately no `toolautosubmit`. Issuing a ticket gives a real
 * person a queue number, which puts it in the same tier as signing a
 * prescription — the agent prepares it, a human commits it. The
 * `toolactivated` event is what makes that honest rather than sneaky: the form
 * visibly announces that an agent filled it in, so the receptionist knows what
 * they are about to submit and who suggested it.
 */
import { useEffect, useRef, useState } from 'react';

import {
  onToolActivated,
  registerFormHandler,
} from '@/lib/webmcp/declarative';

import { PAYER_LABEL, POLI_LABEL, type Payer, type Poli, type TicketDetail } from '@/lib/types';
import { cn } from '@/lib/utils';

const POLI_LIST: Poli[] = ['umum', 'anak', 'kia', 'gigi', 'lansia'];
const PAYER_LIST: Payer[] = ['bpjs', 'umum'];

export function IssueTicketForm({
  token,
  onIssued,
}: {
  token: string;
  onIssued: (ticket: TicketDetail) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentFilled, setAgentFilled] = useState(false);

  // Tell the human when an agent has staged this form for them. The runtime
  // dispatches `toolactivated` on window, not on the form.
  useEffect(
    () => onToolActivated((toolName) => {
      if (toolName === 'issue_queue_ticket') setAgentFilled(true);
    }),
    []
  );

  /** Shared by the human path and the agent path. */
  async function issue(patientQuery: string, poli: string, payer: string) {
    const res = await fetch('/api/admin/patients', {
      headers: { 'X-Receptionist-Token': token },
    });
    if (!res.ok) throw new Error(`Could not load the patient list (HTTP ${res.status}).`);
    const patients = (await res.json()) as { id: string; name: string; nik: string | null }[];

    const q = patientQuery.trim().toLowerCase();
    const match =
      patients.find((p) => p.name.toLowerCase() === q) ??
      patients.find((p) => (p.nik ?? '').toLowerCase() === q) ??
      patients.find((p) => p.name.toLowerCase().includes(q));
    if (!match) {
      throw new Error(
        `No registered patient matching "${patientQuery}". Known patients: ${patients
          .map((p) => p.name)
          .join(', ')}.`
      );
    }

    const issued = await fetch('/api/admin/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Receptionist-Token': token },
      body: JSON.stringify({ patient_id: match.id, poli, payer }),
    });
    if (!issued.ok) throw new Error(`Could not issue the ticket (HTTP ${issued.status}).`);
    const ticket = (await issued.json()) as TicketDetail;
    onIssued(ticket);
    return ticket;
  }

  /**
   * The single submit path, used identically by the receptionist and by an
   * agent. The bridge calls this from a document-capture listener and hands
   * the returned promise to `respondWith`, so whatever this resolves to is
   * exactly what the agent is told.
   */
  useEffect(() => {
    const el = formRef.current;
    if (!el) return;
    return registerFormHandler(el, async (form) => {
      setBusy(true);
      setError(null);
      try {
        const data = new FormData(form);
        const t = await issue(
          String(data.get('patient') ?? ''),
          String(data.get('department') ?? 'umum'),
          String(data.get('payer') ?? 'umum')
        );
        setAgentFilled(false);
        // Clear the field directly rather than calling form.reset(): a reset
        // dispatches a trusted `reset` event, and the runtime reads that as the
        // human cancelling the agent's still-settling tool call — which turned
        // a successful ticket into an error handed back to the agent.
        const patientField = form.elements.namedItem('patient');
        if (patientField instanceof HTMLInputElement) patientField.value = '';
        return `Issued ticket ${t.ticket_number} for ${t.patient.name} in ${POLI_LABEL[t.poli]}.`;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw new Error(message);
      } finally {
        setBusy(false);
      }
    });
    // `issue` closes over `token`, which is the only value it reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <form
      ref={formRef}
      // --- Declarative WebMCP ------------------------------------------
      toolname="issue_queue_ticket"
      tooltitle="Issue a queue ticket"
      tooldescription="Issue a new queue ticket for a registered patient at reception. Fills this form in for the receptionist; a human still presses Issue ticket to commit it, because this gives a real patient a queue number."
      // --------------------------------------------------------------------
      className={cn(
        'card-padded transition-shadow',
        agentFilled && 'ring-2 ring-brand-300 ring-offset-2'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.08em] text-ink-900">
            Issue a ticket
          </h2>
          <p className="mt-0.5 text-[11px] leading-snug text-ink-400">
            A declarative WebMCP tool — the browser builds its schema from these
            fields.
          </p>
        </div>
        {agentFilled && (
          <span className="pill-brand shrink-0 text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
            Agent filled this in
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 sm:col-span-3">
          <span className="text-xs font-medium text-ink-700">Patient</span>
          <input
            name="patient"
            required
            autoComplete="off"
            placeholder="Name or patient ID"
            toolparamdescription="The registered patient's full name, or their patient ID. Must already exist in the clinic's records."
            className="rounded-xl border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-700">Department</span>
          <select
            name="department"
            required
            defaultValue="umum"
            toolparamdescription="Which clinic department the patient is being seen in."
            className="rounded-xl border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
          >
            {POLI_LIST.map((p) => (
              <option key={p} value={p}>
                {POLI_LABEL[p]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-700">Payer</span>
          <select
            name="payer"
            required
            defaultValue="bpjs"
            toolparamdescription="How the visit is paid for: bpjs for insurance, umum for self-pay."
            className="rounded-xl border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
          >
            {PAYER_LIST.map((p) => (
              <option key={p} value={p}>
                {PAYER_LABEL[p]}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end">
          <button type="submit" disabled={busy} className="btn-primary w-full py-2.5 text-sm">
            {busy ? 'Issuing…' : 'Issue ticket'}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-alert-50 px-3 py-2 text-xs text-alert-700">{error}</p>
      )}
    </form>
  );
}
