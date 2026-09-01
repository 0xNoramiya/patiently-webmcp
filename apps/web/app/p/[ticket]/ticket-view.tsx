'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Logo } from '@/components/Logo';
import { api } from '@/lib/api';
import {
  RED_FLAG_LABELS,
  TICKET_STATUS_LABEL,
  type QueueState,
  type TicketDetail,
} from '@/lib/types';
import { cn, formatEta } from '@/lib/utils';
import { InstallPrompt } from '@/components/InstallPrompt';
import { JourneyStrip } from './journey-strip';
import {
  TweenedNumber,
  useChime,
  useFlashOnDecrease,
} from './queue-animation';
import { ShareTicketButton } from './share-ticket-button';
import { TriageReassurance } from './triage-reassurance';
import { YourStoryCard } from './your-story-card';

function flagLabel(code: string): string {
  return RED_FLAG_LABELS[code] || code;
}

export function TicketView({
  initial,
  poliLabel,
}: {
  initial: TicketDetail;
  poliLabel: string;
}) {
  const [ticket, setTicket] = useState<TicketDetail>(initial);
  const [queue, setQueue] = useState<QueueState | null>(null);
  const lastStatusRef = useRef<TicketDetail['status']>(initial.status);
  // Track Notification permission AFTER mount only, so SSR and the first
  // client render produce identical HTML (otherwise React throws a
  // hydration mismatch on the "✓ You'll get a notification…" span).
  const [notifGranted, setNotifGranted] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    setNotifGranted(Notification.permission === 'granted');
  }, []);

  useEffect(() => {
    let mounted = true;

    const refresh = () => {
      api.getTicket(ticket.id).then((t) => mounted && setTicket(t)).catch(() => {});
      api.getQueue(ticket.poli).then((q) => mounted && setQueue(q)).catch(() => {});
    };

    // Initial snapshot.
    api.getQueue(ticket.poli).then((q) => mounted && setQueue(q)).catch(() => {});

    // Primary signal: SSE. We deliberately do NOT close the EventSource
    // on error — browsers retry automatically and closing here would
    // permanently break the live link after any blip (uvicorn restart,
    // proxy hiccup, network drop in the waiting room).
    const es = new EventSource(`/api/queue/${ticket.poli}/stream`);
    es.onmessage = refresh;

    // Safety net: poll every 5s in case the SSE channel is stuck
    // (Next dev rewrites can buffer; service workers can intercept).
    const pollId = setInterval(refresh, 5000);

    return () => {
      mounted = false;
      es.close();
      clearInterval(pollId);
    };
  }, [ticket.poli, ticket.id]);

  // Browser notification when the patient is called in
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      // Best-effort request — browsers gate this behind a user gesture in
      // some contexts, but most still allow it on first paint.
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const prev = lastStatusRef.current;
    const next = ticket.status;
    lastStatusRef.current = next;
    if (prev === next) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (next === 'in_consultation') {
      try {
        new Notification('Patiently — your turn', {
          body: `Ticket ${ticket.ticket_number}: please head to the consultation room.`,
          tag: `patiently-${ticket.id}`,
        });
      } catch {
        /* ignore */
      }
    } else if (next === 'intake_complete') {
      try {
        new Notification('Patiently — your story is in', {
          body: 'Your doctor is reading the summary now. Stay nearby.',
          tag: `patiently-ready-${ticket.id}`,
        });
      } catch {
        /* ignore */
      }
    }
  }, [ticket.status, ticket.ticket_number, ticket.id]);

  // Reflect current status in the document title so backgrounded tabs nag.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const base = `${ticket.ticket_number} · Patiently`;
    if (ticket.status === 'in_consultation') {
      document.title = `🟢 Your turn — ${base}`;
    } else if (ticket.status === 'intake_complete') {
      document.title = `⏳ Story sent — ${base}`;
    } else {
      document.title = base;
    }
  }, [ticket.status, ticket.ticket_number]);

  // Auto-redirect to /done when the visit is complete. Small delay so a
  // patient who's mid-page can see "done" appear briefly before the
  // transition, and we don't redirect on initial page load if they
  // come back to /p/[id] later.
  const router = useRouter();
  const doneRedirectRef = useRef(false);
  useEffect(() => {
    if (ticket.status !== 'done' || doneRedirectRef.current) return;
    doneRedirectRef.current = true;
    const t = setTimeout(() => {
      router.push(`/p/${ticket.id}/done`);
    }, 600);
    return () => clearTimeout(t);
  }, [ticket.status, ticket.id, router]);

  const meEntry = useMemo(() => {
    if (!queue) return null;
    const all = [
      ...queue.waiting,
      ...queue.in_intake,
      ...queue.intake_complete,
      ...queue.in_consultation,
    ];
    return all.find((e) => e.ticket.id === ticket.id) || null;
  }, [queue, ticket.id]);

  const nowServing = queue?.now_serving?.ticket_number ?? '—';
  const ahead = meEntry ? Math.max(meEntry.position - 1, 0) : 0;
  const eta = meEntry ? formatEta(meEntry.eta_minutes_low, meEntry.eta_minutes_high) : '—';
  const isUrgent = ticket.priority >= 100 || ticket.triage_flags.length > 0;
  const aheadFlash = useFlashOnDecrease(ahead);
  const isNextUp =
    ahead === 0 &&
    (ticket.status === 'waiting' ||
      ticket.status === 'in_intake' ||
      ticket.status === 'intake_complete');
  const playChime = useChime();
  const chimedRef = useRef(false);
  useEffect(() => {
    if (ticket.status === 'in_consultation' && !chimedRef.current) {
      chimedRef.current = true;
      try {
        playChime();
      } catch {
        /* ignore */
      }
    }
    if (ticket.status !== 'in_consultation' && ticket.status !== 'done') {
      chimedRef.current = false;
    }
  }, [ticket.status, playChime]);

  return (
    <main className="min-h-screen pb-24">
      <header className="px-5 pt-6 pb-4 flex items-center justify-between gap-3">
        <Logo />
        <div className="flex items-center gap-2">
          <ShareTicketButton
            ticketNumber={ticket.ticket_number}
            patientName={ticket.patient.name}
          />
          <span className="pill-ink text-[11px] uppercase tracking-wide">
            {poliLabel}
          </span>
        </div>
      </header>

      <section className="px-5">
        <div className="mb-5">
          <JourneyStrip
            status={ticket.status}
            intakeComplete={ticket.intake_complete}
          />
        </div>

        <InstallPrompt className="mb-4" />

        {ticket.is_followup && (
          <div className="card-padded mb-4 bg-brand-50 border-brand-200">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-600 text-white grid place-items-center text-sm font-bold">
                ↩
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-brand-700 font-semibold">
                  Follow-up visit
                </div>
                <div className="text-sm text-ink-700 mt-1">
                  {ticket.previous_visit ? (
                    <>
                      Last visit on{' '}
                      <span className="font-semibold">
                        {new Date(ticket.previous_visit.visit_date).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>{' '}
                      for: <span className="italic">{ticket.previous_visit.chief_complaint}</span>
                    </>
                  ) : (
                    <>This is a follow-up visit.</>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {isUrgent && (
          <div className="mb-4">
            <TriageReassurance
              flags={ticket.triage_flags}
              ticketNumber={ticket.ticket_number}
            />
          </div>
        )}

        <div
          className={cn(
            'card overflow-hidden transition-shadow',
            isNextUp && 'next-up-glow'
          )}
        >
          <div className="p-6 bg-gradient-to-br from-brand-700 to-brand-600 text-white">
            <div className="text-sm opacity-80">Your queue number</div>
            <div className="font-display text-7xl font-bold tracking-tight mt-1">
              {ticket.ticket_number}
            </div>
            <div className="mt-3 text-sm opacity-90">
              {ticket.patient.name} · {ticket.patient.age} y/o
            </div>
            {isNextUp && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-200 vital-pulse" />
                You're up next — keep your phone close
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 divide-x divide-ink-100 text-center">
            <div className="p-4">
              <div className="text-[11px] uppercase tracking-wide text-ink-400">Now serving</div>
              <div className="font-display text-2xl font-bold text-ink-900 mt-1">
                {nowServing}
              </div>
            </div>
            <div className="p-4">
              <div className="text-[11px] uppercase tracking-wide text-ink-400">
                {isNextUp ? 'Almost your turn' : 'Ahead of you'}
              </div>
              <div
                key={aheadFlash ? `flash-${ahead}` : `still-${ahead}`}
                className={cn(
                  'font-display text-2xl font-bold mt-1 inline-block',
                  isNextUp ? 'text-brand-700' : 'text-ink-900',
                  aheadFlash && 'number-bounce'
                )}
              >
                <TweenedNumber value={ahead} />
              </div>
            </div>
            <div className="p-4">
              <div className="text-[11px] uppercase tracking-wide text-ink-400">Est. wait</div>
              <div className="font-display text-2xl font-bold text-ink-900 mt-1">{eta}</div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span
            className={cn(
              'pill',
              ticket.status === 'in_consultation'
                ? 'bg-brand-100 text-brand-700'
                : ticket.status === 'intake_complete'
                  ? 'bg-warn-100 text-warn-600'
                  : ticket.status === 'in_intake'
                    ? 'bg-warn-100 text-warn-600'
                    : 'bg-ink-100 text-ink-700'
            )}
          >
            {TICKET_STATUS_LABEL[ticket.status]}
          </span>
          {ticket.triage_flags.length > 0 && (
            <span className="pill-alert">⚠ {flagLabel(ticket.triage_flags[0])}</span>
          )}
        </div>

        <div className="mt-6">
          {ticket.status === 'waiting' && !ticket.intake_complete && (
            <LanguagePickerAndStart ticketId={ticket.id} />
          )}
          {ticket.status === 'in_intake' && (
            <Link href={`/p/${ticket.id}/intake`} className="btn-primary w-full text-base">
              Continue intake
            </Link>
          )}
          {(ticket.status === 'intake_complete' || ticket.intake_complete) && (
            <div className="card-padded bg-brand-50 border-brand-100 text-center">
              <div className="text-3xl">✓</div>
              <div className="font-display font-semibold text-ink-900 mt-2">
                Intake complete
              </div>
              <p className="text-sm text-ink-500 mt-1">
                Your physician is reading your summary now. Please wait to be called.
              </p>
            </div>
          )}
          {ticket.status === 'in_consultation' && (
            <div className="card-padded bg-brand-50 border-brand-100 text-center">
              <div className="font-display font-semibold text-ink-900">Please proceed to the consultation room</div>
              <p className="text-sm text-ink-500 mt-1">Show this screen at the door.</p>
            </div>
          )}
        </div>

        {ticket.intake_complete && <YourStoryCard ticketId={ticket.id} />}

        <p className="text-xs text-ink-400 text-center mt-8">
          This page updates automatically. Keep it open.
          {notifGranted && (
            <span className="block mt-1 text-brand-700">
              ✓ You'll get a notification when it's your turn.
            </span>
          )}
        </p>
      </section>
    </main>
  );
}

const LANG_LABELS: Record<'en' | 'id', string> = {
  en: 'English',
  id: 'Bahasa Indonesia',
};

const LANG_HINT: Record<'en' | 'id', string> = {
  en: 'The intake assistant will speak with you in English.',
  id: 'Asisten intake akan bicara dengan Anda dalam Bahasa Indonesia.',
};

const LANG_CTA: Record<'en' | 'id', string> = {
  en: 'Start pre-visit intake',
  id: 'Mulai persiapan kunjungan',
};

function LanguagePickerAndStart({ ticketId }: { ticketId: string }) {
  const [lang, setLang] = useState<'en' | 'id'>('en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await api.startIntake(ticketId, lang);
      router.push(`/p/${ticketId}/intake`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the session');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-ink-100 bg-white p-3">
        <div className="text-[10px] uppercase tracking-wider text-ink-500 font-bold mb-2">
          Choose your language · Pilih bahasa
        </div>
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {(['en', 'id'] as const).map((opt) => (
            <button
              key={opt}
              role="radio"
              aria-checked={lang === opt}
              onClick={() => setLang(opt)}
              className={cn(
                'rounded-xl border px-3 py-2 text-sm font-semibold transition-colors',
                lang === opt
                  ? 'border-brand-600 bg-brand-50 text-brand-700 ring-2 ring-brand-200'
                  : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
              )}
            >
              <span className="block text-[10px] uppercase tracking-wider text-ink-400 mb-0.5">
                {opt === 'en' ? 'EN' : 'ID'}
              </span>
              {LANG_LABELS[opt]}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-ink-500 mt-2">{LANG_HINT[lang]}</p>
      </div>
      <button
        onClick={go}
        disabled={busy}
        className="btn-primary w-full text-base"
      >
        {busy ? '…' : LANG_CTA[lang]}
      </button>
      {error && (
        <div className="text-xs text-alert-700 bg-alert-50 border border-alert-100 rounded-xl px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
