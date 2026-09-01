'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import { Logo } from '@/components/Logo';
import { api } from '@/lib/api';
import {
  POLI_LABEL,
  RED_FLAG_LABELS,
  TICKET_STATUS_LABEL,
  type IntakeSession,
  type Poli,
  type QueueEntry,
  type TicketDetail,
} from '@/lib/types';
import { cn, formatRelative } from '@/lib/utils';
import {
  AgentActivityPanel,
  AgentApprovalDialog,
} from '@/components/AgentActivityPanel';
import { useClinicianTools } from './webmcp-clinician-tools';
import { NotesWidget } from './notes-widget';
import { PrescriptionsWidget } from './prescriptions-widget';
import { RemindersPanel } from './reminders-panel';
import { StatsStrip } from './stats-strip';
import { TranscriptWidget } from './transcript-widget';
import { VitalsCard } from './vitals-card';

const POLI_LIST: Poli[] = ['umum', 'anak', 'kia', 'gigi', 'lansia'];

interface Toast {
  id: string;
  title: string;
  body: string;
  tone: 'alert' | 'info';
}

export function DashboardMain({
  adminPassword,
  onLogout,
}: {
  adminPassword: string;
  onLogout: () => void;
}) {
  const [activePoli, setActivePoli] = useState<Poli>('umum');
  const [queue, setQueue] = useState<Awaited<ReturnType<typeof api.getQueue>> | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketDetail, setTicketDetail] = useState<TicketDetail | null>(null);
  const [intakeSession, setIntakeSession] = useState<IntakeSession | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [actionPending, setActionPending] = useState(false);

  const seenAlerts = useRef<Set<string>>(new Set());

  const refreshQueue = useCallback(async () => {
    const q = await api.getQueue(activePoli);
    setQueue(q);
    if (!selectedTicketId) {
      const candidate =
        q.intake_complete[0] || q.in_intake[0] || q.waiting[0] || q.in_consultation[0];
      if (candidate) {
        setSelectedTicketId(candidate.ticket.id);
      }
    }
  }, [activePoli, selectedTicketId]);

  useEffect(() => {
    refreshQueue().catch(() => {});
  }, [refreshQueue]);

  const refreshDetail = useCallback(async (id: string) => {
    try {
      const detail = await api.getTicket(id);
      setTicketDetail(detail);
      try {
        const session = await api.getSession(id);
        setIntakeSession(session);
      } catch {
        setIntakeSession(null);
      }
    } catch {
      setTicketDetail(null);
      setIntakeSession(null);
    }
  }, []);

  useEffect(() => {
    if (selectedTicketId) refreshDetail(selectedTicketId);
  }, [selectedTicketId, refreshDetail]);

  useEffect(() => {
    const es = new EventSource('/api/dashboard/stream');
    es.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'triage_alert') {
          const tid = msg.data.ticket_id;
          if (!seenAlerts.current.has(tid)) {
            seenAlerts.current.add(tid);
            const flag = msg.data.flags?.[0];
            const label = flag ? RED_FLAG_LABELS[flag] || flag : 'Triage';
            pushToast({
              id: `alert-${tid}-${Date.now()}`,
              title: `⚠ TRIAGE: ${msg.data.ticket_number}`,
              body: `${msg.data.patient_name} — ${label}. Priority raised.`,
              tone: 'alert',
            });
            setActivePoli(msg.data.poli);
            setSelectedTicketId(tid);
          }
        }
        refreshQueue().catch(() => {});
        if (selectedTicketId && msg.data?.ticket_id === selectedTicketId) {
          refreshDetail(selectedTicketId).catch(() => {});
        }
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [refreshQueue, refreshDetail, selectedTicketId]);

  useEffect(() => {
    if (!intakeSession || intakeSession.status !== 'active' || !selectedTicketId) return;
    const id = setInterval(() => {
      api.getSession(selectedTicketId).then(setIntakeSession).catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [intakeSession, selectedTicketId]);

  // Expose the clinic floor to the clinician's agent. Registered here so the
  // tools close over live dashboard state and can drive the same UI the
  // clinician is looking at.
  useClinicianTools({
    adminPassword,
    queue,
    activePoli,
    setActivePoli,
    selectedTicketId,
    setSelectedTicketId,
    ticketDetail,
    intakeSession,
    refreshQueue,
    refreshDetail,
  });

  function pushToast(t: Toast) {
    setToasts((cur) => [...cur, t]);
    setTimeout(() => {
      setToasts((cur) => cur.filter((x) => x.id !== t.id));
    }, 8000);
  }

  async function handleCall() {
    if (!ticketDetail) return;
    setActionPending(true);
    try {
      await api.callNext(ticketDetail.id, adminPassword);
      await refreshQueue();
      await refreshDetail(ticketDetail.id);
    } catch (e) {
      pushToast({
        id: `err-${Date.now()}`,
        title: 'Call failed',
        body: e instanceof Error ? e.message : 'Try again',
        tone: 'alert',
      });
    } finally {
      setActionPending(false);
    }
  }

  async function handleComplete() {
    if (!ticketDetail) return;
    setActionPending(true);
    try {
      await api.completeTicket(ticketDetail.id, adminPassword);
      await refreshQueue();
      setTicketDetail(null);
      setIntakeSession(null);
      setSelectedTicketId(null);
    } catch (e) {
      pushToast({
        id: `err-${Date.now()}`,
        title: 'Could not complete',
        body: e instanceof Error ? e.message : 'Try again',
        tone: 'alert',
      });
    } finally {
      setActionPending(false);
    }
  }

  const sortedEntries = useMemo(() => {
    if (!queue) return [];
    const list: QueueEntry[] = [
      ...queue.in_consultation,
      ...queue.intake_complete,
      ...queue.in_intake,
      ...queue.waiting,
    ];
    return list.sort((a, b) => {
      if (a.ticket.status === b.ticket.status) {
        return a.position - b.position;
      }
      const order = ['in_consultation', 'intake_complete', 'in_intake', 'waiting'];
      return order.indexOf(a.ticket.status) - order.indexOf(b.ticket.status);
    });
  }, [queue]);

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <main className="min-h-screen bg-ink-50">
      <header className="bg-white border-b border-ink-100 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-5">
          <Logo />
          <div>
            <div className="font-display font-semibold text-ink-900 text-sm">
              Patiently Demo Clinic
            </div>
            <div className="text-xs text-ink-500">{currentDate}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {POLI_LIST.map((p) => (
            <button
              key={p}
              onClick={() => {
                setActivePoli(p);
                setSelectedTicketId(null);
              }}
              className={cn(
                activePoli === p ? 'chip-tab-active' : 'chip-tab',
                'text-xs'
              )}
            >
              {POLI_LABEL[p]}
            </button>
          ))}
          <Link href="/" className="btn-ghost text-xs ml-2">
            ← Home
          </Link>
        </div>
      </header>

      <StatsStrip adminPassword={adminPassword} />

      <div className="grid grid-cols-12 gap-4 px-4 pb-4 h-[calc(100vh-64px-92px)]">
        <aside className="col-span-5 xl:col-span-4 card overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between">
            <div>
              <div className="font-display font-semibold text-ink-900">
                Queue · {POLI_LABEL[activePoli]}
              </div>
              <div className="text-xs text-ink-500">
                Avg consult {queue?.avg_consultation_minutes ?? '—'} min
              </div>
            </div>
            <span className="pill-ink text-[11px]">{sortedEntries.length} patients</span>
          </div>
          <div className="flex-1 overflow-y-auto scroll-thin">
            {sortedEntries.length === 0 && (
              <div className="p-8 text-center text-sm text-ink-400">
                No patients in {POLI_LABEL[activePoli]} yet.
              </div>
            )}
            {sortedEntries.map((entry) => (
              <QueueRow
                key={entry.ticket.id}
                entry={entry}
                selected={entry.ticket.id === selectedTicketId}
                onClick={() => setSelectedTicketId(entry.ticket.id)}
              />
            ))}
          </div>
          <AgentActivityPanel className="shrink-0 border-t border-ink-100" />
        </aside>

        <section className="col-span-7 xl:col-span-8 card overflow-hidden flex flex-col">
          {!ticketDetail ? (
            <div className="flex-1 grid place-items-center text-sm text-ink-400">
              Select a patient on the left to see the details.
            </div>
          ) : (
            <DetailPane
              ticket={ticketDetail}
              session={intakeSession}
              onCall={handleCall}
              onComplete={handleComplete}
              actionPending={actionPending}
              adminPassword={adminPassword}
            />
          )}
        </section>
      </div>

      <div className="fixed top-4 right-4 z-50 space-y-2 w-96 max-w-[90vw]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'card-padded shadow-card',
              t.tone === 'alert' && 'bg-alert-50 border-alert-100'
            )}
          >
            <div className="font-semibold text-ink-900 text-sm">{t.title}</div>
            <div className="text-sm text-ink-700 mt-1">{t.body}</div>
          </div>
        ))}
      </div>

      <AgentApprovalDialog />
    </main>
  );
}

function QueueRow({
  entry,
  selected,
  onClick,
}: {
  entry: QueueEntry;
  selected: boolean;
  onClick: () => void;
}) {
  const urgent = entry.ticket.priority >= 100 || entry.triage_flags.length > 0;
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-5 py-3 border-b border-ink-100 transition-colors',
        selected ? 'bg-brand-50' : 'hover:bg-ink-50',
        urgent && 'border-l-4 border-l-alert-500'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'font-display font-bold text-lg',
              urgent ? 'text-alert-700' : 'text-ink-900'
            )}
          >
            {entry.ticket.ticket_number}
          </div>
          <div>
            <div className="text-sm font-medium text-ink-900">{entry.patient.name}</div>
            <div className="text-xs text-ink-500">
              {entry.patient.age} y/o · {entry.patient.sex === 'M' ? 'Male' : 'Female'}
            </div>
          </div>
        </div>
        <div className="text-right">
          <span
            className={cn(
              'pill text-[10px]',
              entry.ticket.status === 'intake_complete' && 'bg-brand-100 text-brand-700',
              entry.ticket.status === 'in_intake' && 'bg-warn-100 text-warn-600',
              entry.ticket.status === 'in_consultation' && 'bg-brand-600 text-white',
              entry.ticket.status === 'waiting' && 'bg-ink-100 text-ink-700'
            )}
          >
            {TICKET_STATUS_LABEL[entry.ticket.status]}
          </span>
          <div className="text-[11px] text-ink-400 mt-1">
            {formatRelative(entry.ticket.issued_at)}
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
        {entry.ticket.is_followup && (
          <span className="pill-brand text-[10px]">↩ Follow-up</span>
        )}
        {urgent && (
          <span className="pill-alert text-[10px]">
            ⚠ {RED_FLAG_LABELS[entry.triage_flags[0]] || entry.triage_flags[0] || 'Triage'}
          </span>
        )}
      </div>
    </button>
  );
}

type AgentStatus = 'idle' | 'active' | 'done' | 'flagged';

function AgentsPanel({
  session,
  flags,
}: {
  session: IntakeSession | null;
  flags: string[];
}) {
  let intakeStatus: AgentStatus = 'idle';
  let triageStatus: AgentStatus = 'idle';
  let summarizerStatus: AgentStatus = 'idle';

  if (session) {
    if (session.status === 'active') {
      intakeStatus = 'active';
      triageStatus = flags.length > 0 ? 'flagged' : 'active';
    } else if (session.status === 'completed') {
      intakeStatus = 'done';
      triageStatus = flags.length > 0 ? 'flagged' : 'done';
      summarizerStatus = session.summary ? 'done' : 'active';
    }
  }

  const agents: {
    name: string;
    role: string;
    status: AgentStatus;
    note?: string;
  }[] = [
    {
      name: 'Intake Agent',
      role: 'Gathers OPQRST & follow-up delta',
      status: intakeStatus,
      note:
        session?.status === 'completed'
          ? `${session.messages.filter((m) => m.role !== 'system').length} messages exchanged`
          : session?.status === 'active'
            ? 'Conversation in progress'
            : 'Awaiting patient',
    },
    {
      name: 'Triage Agent',
      role: 'Independent red-flag classifier',
      status: triageStatus,
      note:
        flags.length > 0
          ? `${flags.length} flag(s) raised`
          : session
            ? 'Monitoring every turn'
            : 'Standing by',
    },
    {
      name: 'Summarizer Agent',
      role: 'Writes the physician-facing chart',
      status: summarizerStatus,
      note:
        summarizerStatus === 'done'
          ? 'Summary ready'
          : summarizerStatus === 'active'
            ? 'Writing summary…'
            : 'Runs after intake completes',
    },
  ];

  return (
    <div className="card-padded">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-ink-900 text-sm uppercase tracking-wide">
          Agents
        </h3>
        <span className="text-[11px] text-ink-400">live</span>
      </div>
      <div className="space-y-2.5">
        {agents.map((a) => (
          <div key={a.name} className="flex items-start gap-3">
            <StatusDot status={a.status} />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink-900">{a.name}</span>
                <StatusLabel status={a.status} />
              </div>
              <div className="text-xs text-ink-500">{a.role}</div>
              {a.note && (
                <div className="text-xs text-ink-700 mt-0.5">{a.note}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: AgentStatus }) {
  const color =
    status === 'flagged'
      ? 'bg-alert-500'
      : status === 'active'
        ? 'bg-brand-500'
        : status === 'done'
          ? 'bg-ink-300'
          : 'bg-ink-200';
  const pulse = status === 'active' || status === 'flagged';
  return (
    <span
      className={cn(
        'mt-1.5 w-2.5 h-2.5 rounded-full shrink-0',
        color,
        pulse && 'animate-pulse'
      )}
    />
  );
}

function StatusLabel({ status }: { status: AgentStatus }) {
  const label =
    status === 'flagged'
      ? 'FLAGGED'
      : status === 'active'
        ? 'ACTIVE'
        : status === 'done'
          ? 'DONE'
          : 'IDLE';
  const cls =
    status === 'flagged'
      ? 'text-alert-700'
      : status === 'active'
        ? 'text-brand-700'
        : status === 'done'
          ? 'text-ink-400'
          : 'text-ink-400';
  return <span className={cn('text-[10px] font-bold tracking-wider', cls)}>{label}</span>;
}

function DetailPane({
  ticket,
  session,
  onCall,
  onComplete,
  actionPending,
  adminPassword,
}: {
  ticket: TicketDetail;
  session: IntakeSession | null;
  onCall: () => void;
  onComplete: () => void;
  actionPending: boolean;
  adminPassword: string;
}) {
  const [showTranscript, setShowTranscript] = useState(false);
  const summary = session?.summary || null;
  const flags = ticket.triage_flags;
  const urgent = ticket.priority >= 100 || flags.length > 0;

  return (
    <div className="flex-1 overflow-y-auto scroll-thin">
      <div className="px-6 py-5 border-b border-ink-100 sticky top-0 bg-white z-10">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="font-display text-2xl font-bold text-ink-900">
                {ticket.ticket_number}
              </div>
              <span className="pill-ink">{POLI_LABEL[ticket.poli]}</span>
              {ticket.is_followup && (
                <span className="pill-brand">↩ Follow-up · 30d window</span>
              )}
            </div>
            <div className="mt-1 text-sm text-ink-700">
              <span className="font-semibold">{ticket.patient.name}</span>{' '}
              <span className="text-ink-500">
                · {ticket.patient.age} years ·{' '}
                {ticket.patient.sex === 'M' ? 'Male' : 'Female'}
              </span>
            </div>
            <div className="text-xs text-ink-400 mt-0.5">
              {ticket.patient.nik && <>ID {ticket.patient.nik} · </>}
              {ticket.patient.bpjs_number ? `Insurance ${ticket.patient.bpjs_number}` : 'Self-pay'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ExportPdfButton ticketId={ticket.id} adminPassword={adminPassword} />
            {ticket.status !== 'in_consultation' && ticket.status !== 'done' && (
              <button
                onClick={onCall}
                disabled={actionPending}
                className={cn(urgent ? 'btn-danger' : 'btn-primary', 'text-sm')}
              >
                Call patient
              </button>
            )}
            {ticket.status === 'in_consultation' && (
              <button
                onClick={onComplete}
                disabled={actionPending}
                className="btn-secondary text-sm"
              >
                Mark complete
              </button>
            )}
          </div>
        </div>
        {urgent && (
          <div className="mt-3 bg-alert-50 border border-alert-100 rounded-xl px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-alert-700 font-bold">
              ⚠ Triage alert
            </div>
            <div className="text-sm text-ink-900 mt-1">
              {flags.map((f) => RED_FLAG_LABELS[f] || f).join(' · ')}
            </div>
          </div>
        )}
      </div>

      <div className="p-6 grid grid-cols-3 gap-5 items-start">
        <div className="col-span-2 space-y-5">
          {summary ? (
            <SummaryCard summary={summary} flags={flags} />
          ) : session?.status === 'active' ? (
            <div className="card-padded bg-warn-50 border-warn-100">
              <div className="text-xs uppercase tracking-wide text-warn-600 font-bold">
                Intake in progress
              </div>
              <p className="text-sm text-ink-700 mt-1">
                The patient is answering questions from the Intake Agent. Transcript
                below updates live; the Summarizer will write the chart on completion.
              </p>
            </div>
          ) : (
            <div className="card-padded bg-ink-50 border-ink-100">
              <div className="text-xs uppercase tracking-wide text-ink-500 font-bold">
                Intake not started
              </div>
              <p className="text-sm text-ink-700 mt-1">
                The patient hasn't begun the pre-visit intake yet.
              </p>
            </div>
          )}

          {ticket.previous_visit && (
            <FollowUpCard
              previousVisit={ticket.previous_visit}
              followupDelta={summary?.followup_delta || null}
            />
          )}

          {summary && summary.suggested_questions.length > 0 && (
            <Card title="Suggested follow-up questions">
              <ul className="space-y-1.5 text-sm text-ink-700 list-disc pl-5">
                {summary.suggested_questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </Card>
          )}

          {summary && summary.differentials.length > 0 && (
            <Card title="Differential considerations">
              <div className="text-xs text-ink-400 mb-2">
                System suggestion — not a diagnosis.
              </div>
              <ul className="space-y-1.5 text-sm text-ink-700 list-decimal pl-5">
                {summary.differentials.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </Card>
          )}

          <VitalsCard
            ticketId={ticket.id}
            adminPassword={adminPassword}
          />

          <TranscriptWidget
            ticketId={ticket.id}
            adminPassword={adminPassword}
          />

          <NotesWidget
            ticketId={ticket.id}
            adminPassword={adminPassword}
          />

          <PrescriptionsWidget
            ticketId={ticket.id}
            adminPassword={adminPassword}
          />

          {session && session.messages.length > 0 && (
            <Card
              title="Intake transcript"
              action={
                <button
                  onClick={() => setShowTranscript((s) => !s)}
                  className="text-xs text-brand-700 hover:underline"
                >
                  {showTranscript ? 'Hide' : 'Show'}
                </button>
              }
            >
              {showTranscript && (
                <div className="space-y-2 max-h-96 overflow-y-auto scroll-thin pr-2">
                  {session.messages
                    .filter((m) => m.role !== 'system')
                    .map((m) => (
                      <div key={m.id} className="text-sm">
                        <span
                          className={cn(
                            'font-semibold',
                            m.role === 'agent' ? 'text-brand-700' : 'text-ink-900'
                          )}
                        >
                          {m.role === 'agent' ? 'Intake Agent' : ticket.patient.name}:
                        </span>{' '}
                        <span className="text-ink-700 whitespace-pre-wrap">{m.content}</span>
                      </div>
                    ))}
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="col-span-1 space-y-5 sticky top-[120px]">
          <AgentsPanel session={session} flags={flags} />
          <RemindersPanel adminPassword={adminPassword} />
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  summary,
  flags,
}: {
  summary: NonNullable<IntakeSession['summary']>;
  flags: string[];
}) {
  return (
    <Card title="Pre-visit summary">
      <div className="space-y-3 text-sm">
        <div>
          <div className="text-xs uppercase tracking-wide text-ink-400 font-semibold">
            Chief complaint
          </div>
          <div className="text-ink-900 font-medium mt-0.5">{summary.chief_complaint}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-ink-400 font-semibold">
            HPI
          </div>
          <p className="text-ink-700 mt-0.5">{summary.hpi_paragraph}</p>
        </div>
        {summary.relevant_history.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-400 font-semibold">
              Relevant history
            </div>
            <ul className="text-ink-700 mt-0.5 list-disc pl-5 space-y-0.5">
              {summary.relevant_history.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <div className="text-xs uppercase tracking-wide text-ink-400 font-semibold">
            Triage
          </div>
          <div
            className={cn(
              'mt-0.5',
              flags.length > 0 ? 'text-alert-700 font-semibold' : 'text-ink-700'
            )}
          >
            {summary.triage_assessment}
          </div>
        </div>
      </div>
    </Card>
  );
}

function FollowUpCard({
  previousVisit,
  followupDelta,
}: {
  previousVisit: NonNullable<TicketDetail['previous_visit']>;
  followupDelta: NonNullable<IntakeSession['summary']>['followup_delta'] | null;
}) {
  const failure =
    followupDelta?.symptom_response === 'same' ||
    followupDelta?.symptom_response === 'worse';

  return (
    <Card title="Previous visit context">
      <div className="text-xs text-ink-400">
        {new Date(previousVisit.visit_date).toLocaleDateString('en-US', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}{' '}
        · {previousVisit.prescriber_id || '-'} ·{' '}
        {previousVisit.diagnosis_icd10 || 'no Dx code'}
      </div>
      <div className="text-sm text-ink-900 font-medium mt-1">
        {previousVisit.chief_complaint}
      </div>
      {previousVisit.notes && (
        <p className="text-sm text-ink-700 mt-2">{previousVisit.notes}</p>
      )}
      {previousVisit.prescriptions.length > 0 && (
        <div className="mt-3">
          <div className="text-xs uppercase tracking-wide text-ink-400 font-semibold">
            Previous Rx
          </div>
          <ul className="text-sm text-ink-700 mt-1 space-y-0.5">
            {previousVisit.prescriptions.map((rx) => (
              <li key={rx.id}>
                • <span className="font-medium">{rx.drug_name}</span> {rx.dose}{' '}
                {rx.frequency} × {rx.duration_days} days
                {rx.instructions && (
                  <span className="text-ink-400"> — {rx.instructions}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {followupDelta && (
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <DeltaItem label="Adherence" value={followupDelta.adherence} />
          <DeltaItem label="Symptom response" value={followupDelta.symptom_response} />
          <DeltaItem
            label="Side effects"
            value={(followupDelta.side_effects || []).join(', ') || 'none reported'}
          />
          <DeltaItem label="Prior treatment" value={followupDelta.previous_treatment} />
        </div>
      )}
      {followupDelta?.clinical_interpretation && (
        <div
          className={cn(
            'mt-3 rounded-xl px-4 py-3 text-sm',
            failure
              ? 'bg-warn-50 border border-warn-100 text-warn-600'
              : 'bg-brand-50 border border-brand-100 text-brand-700'
          )}
        >
          {followupDelta.clinical_interpretation}
        </div>
      )}
    </Card>
  );
}

function ExportPdfButton({
  ticketId,
  adminPassword,
}: {
  ticketId: string;
  adminPassword: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const { blob, filename } = await api.exportPdf(ticketId, adminPassword);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'export failed');
      setTimeout(() => setError(null), 4000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        disabled={busy}
        className="btn-secondary text-sm"
        title="Download the full visit chart as PDF"
      >
        {busy ? 'Exporting…' : '⤓ PDF'}
      </button>
      {error && (
        <div className="absolute right-0 top-full mt-1 text-[10px] text-alert-700 bg-alert-50 border border-alert-100 rounded px-2 py-1 whitespace-nowrap z-10">
          {error}
        </div>
      )}
    </div>
  );
}

function DeltaItem({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-400 font-semibold">
        {label}
      </div>
      <div className="text-ink-900 mt-0.5">{value || '—'}</div>
    </div>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card-padded">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-ink-900 text-sm uppercase tracking-wide">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}
