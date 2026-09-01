'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { Logo } from '@/components/Logo';
import {
  PAYER_LABEL,
  POLI_LABEL,
  type Patient,
  type Payer,
  type Poli,
  type TicketDetail,
} from '@/lib/types';
import { cn } from '@/lib/utils';

// Demo build — no sign-in. The reception endpoints still require the
// X-Receptionist-Token header, so we hard-code the seed's value.
const DEMO_TOKEN =
  process.env.NEXT_PUBLIC_RECEPTIONIST_TOKEN || 'demo-receptionist-token';
const POLI_LIST: Poli[] = ['umum', 'anak', 'kia', 'gigi', 'lansia'];

export function ReceptionistConsole() {
  const [token] = useState<string>(DEMO_TOKEN);
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [search, setSearch] = useState('');
  const [issuing, setIssuing] = useState<Patient | null>(null);
  const [issued, setIssued] = useState<TicketDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/patients', {
      headers: { 'X-Receptionist-Token': token },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Patient[];
        setPatients(data);
        setError(null);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load patients');
        setPatients(null);
      });
  }, [token]);

  const filtered = useMemo(() => {
    if (!patients) return [];
    const q = search.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) =>
      [p.name, p.nik || '', p.bpjs_number || '']
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [patients, search]);

  async function handleIssue(patient: Patient, poli: Poli, payer: Payer) {
    setError(null);
    try {
      const res = await fetch('/api/admin/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Receptionist-Token': token,
        },
        body: JSON.stringify({ patient_id: patient.id, poli, payer }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const ticket = (await res.json()) as TicketDetail;
      setIssued(ticket);
      setIssuing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to issue ticket');
    }
  }

  return (
    <main className="min-h-screen bg-ink-50">
      <header className="bg-white border-b border-ink-100 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo />
          <div className="text-xs text-ink-500">Reception console</div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="btn-ghost text-xs">
            Dashboard
          </Link>
          <Link href="/" className="btn-ghost text-xs">
            Home
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-6 space-y-5">
        {issued && (
          <IssuedTicketCard
            issued={issued}
            onDismiss={() => setIssued(null)}
          />
        )}

        {error && (
          <div className="text-sm text-alert-700 bg-alert-50 border border-alert-100 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        <div className="card overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-ink-100">
            <h2 className="font-display font-semibold text-ink-900">Patients</h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Click <span className="font-semibold">Issue ticket</span> to choose the
              department and payer.
            </p>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, ID, insurance…"
              className="mt-3 w-full rounded-xl border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none px-3 py-2 text-sm"
            />
          </div>
          <div className="divide-y divide-ink-100 max-h-[60vh] overflow-y-auto scroll-thin">
            {!patients && (
              <div className="px-5 py-8 text-center text-sm text-ink-400">
                Loading patients…
              </div>
            )}
            {patients && filtered.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-ink-400">
                No patients match "{search}".
              </div>
            )}
            {filtered.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between px-5 py-3 hover:bg-ink-50/50"
              >
                <div>
                  <div className="font-medium text-ink-900">{p.name}</div>
                  <div className="text-xs text-ink-500">
                    {p.age} y/o · {p.sex === 'M' ? 'Male' : 'Female'} ·{' '}
                    {p.bpjs_number ? 'Insurance' : 'Self-pay'}
                    {p.nik && <> · ID {p.nik}</>}
                  </div>
                </div>
                <button
                  onClick={() => setIssuing(p)}
                  className="btn-primary text-xs py-2 px-4"
                >
                  Issue ticket
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {issuing && (
        <IssueTicketSheet
          patient={issuing}
          onCancel={() => setIssuing(null)}
          onConfirm={(poli, payer) => handleIssue(issuing, poli, payer)}
        />
      )}
    </main>
  );
}

function IssueTicketSheet({
  patient,
  onCancel,
  onConfirm,
}: {
  patient: Patient;
  onCancel: () => void;
  onConfirm: (poli: Poli, payer: Payer) => void;
}) {
  const [poli, setPoli] = useState<Poli>('umum');
  const [payer, setPayer] = useState<Payer>(patient.bpjs_number ? 'bpjs' : 'umum');
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm grid place-items-center p-4">
      <div className="card w-full max-w-md overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-ink-100">
          <div className="text-xs uppercase tracking-wide text-ink-400 font-semibold">
            New ticket
          </div>
          <div className="font-display text-xl font-bold text-ink-900 mt-1">
            {patient.name}
          </div>
          <div className="text-xs text-ink-500 mt-0.5">
            {patient.age} y/o · {patient.sex === 'M' ? 'Male' : 'Female'}
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <label className="text-xs uppercase tracking-wide text-ink-500 font-semibold">
              Department
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {POLI_LIST.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPoli(p)}
                  className={cn(
                    'text-left rounded-2xl border px-4 py-3 transition-colors',
                    poli === p
                      ? 'border-brand-600 bg-brand-50 text-brand-700 ring-2 ring-brand-200'
                      : 'border-ink-200 bg-white hover:bg-ink-50 text-ink-700'
                  )}
                >
                  <div className="font-semibold text-sm">{POLI_LABEL[p]}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-ink-500 font-semibold">
              Payer
            </label>
            <div className="mt-2 flex gap-2">
              {(['bpjs', 'umum'] as Payer[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPayer(p)}
                  className={cn(
                    'flex-1 rounded-full border px-4 py-2 text-sm transition-colors',
                    payer === p
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-ink-200 bg-white hover:bg-ink-50 text-ink-700'
                  )}
                >
                  {PAYER_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-ink-100 flex items-center justify-between gap-2">
          <button onClick={onCancel} className="btn-ghost text-sm">
            Cancel
          </button>
          <button
            onClick={() => {
              setSubmitting(true);
              onConfirm(poli, payer);
            }}
            disabled={submitting}
            className="btn-primary text-sm"
          >
            {submitting ? 'Issuing…' : `Issue → ${POLI_LABEL[poli]}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function IssuedTicketCard({
  issued,
  onDismiss,
}: {
  issued: TicketDetail;
  onDismiss: () => void;
}) {
  const patientUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/p/${issued.id}`
      : `/p/${issued.id}`;
  return (
    <div className="card-padded bg-brand-50 border-brand-100">
      <div className="flex gap-5 items-start">
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-brand-700 font-bold">
              Ticket issued
            </div>
            <button
              onClick={onDismiss}
              className="text-xs text-ink-400 hover:text-ink-700"
            >
              Dismiss
            </button>
          </div>
          <div className="font-display text-4xl font-bold text-ink-900 mt-1">
            {issued.ticket_number}
          </div>
          <div className="text-sm text-ink-700 mt-1">
            {issued.patient.name} · {POLI_LABEL[issued.poli]}
            {issued.is_followup && (
              <span className="pill-brand ml-2 text-[10px]">↩ Follow-up</span>
            )}
          </div>
          <Link
            href={`/p/${issued.id}`}
            target="_blank"
            className="btn-secondary mt-3 inline-flex text-sm"
          >
            Open patient screen →
          </Link>
          <p className="text-xs text-ink-400 mt-2">
            Scan the QR with a phone to use the patient view.
          </p>
        </div>
        <div className="bg-white rounded-2xl p-2 shadow-soft shrink-0">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&data=${encodeURIComponent(
              patientUrl
            )}`}
            alt="QR to patient page"
            width={160}
            height={160}
          />
        </div>
      </div>
    </div>
  );
}
