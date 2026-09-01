'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { Logo } from '@/components/Logo';
import { POLI_LABEL, type IntakeSession, type TicketDetail } from '@/lib/types';
import { cn } from '@/lib/utils';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

interface FeedbackOut {
  rating: number;
  nps: number | null;
  comment: string | null;
}

async function loadExistingFeedback(ticketId: string): Promise<FeedbackOut | null> {
  try {
    const res = await fetch(`${API_BASE}/api/intake/${ticketId}/feedback`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body || null;
  } catch {
    return null;
  }
}

async function loadSession(ticketId: string): Promise<IntakeSession | null> {
  try {
    const res = await fetch(`${API_BASE}/api/intake/${ticketId}/session`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as IntakeSession;
  } catch {
    return null;
  }
}

async function postFeedback(
  ticketId: string,
  rating: number,
  nps: number | null,
  comment: string
): Promise<FeedbackOut> {
  const res = await fetch(`${API_BASE}/api/intake/${ticketId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating, nps, comment: comment || null }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as FeedbackOut;
}

export function DoneView({ ticket }: { ticket: TicketDetail }) {
  const [session, setSession] = useState<IntakeSession | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [nps, setNps] = useState<number | null>(null);
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<FeedbackOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      loadExistingFeedback(ticket.id),
      loadSession(ticket.id),
    ]).then(([fb, s]) => {
      if (!mounted) return;
      if (fb) {
        setRating(fb.rating);
        setNps(fb.nps);
        setComment(fb.comment || '');
        setSubmitted(fb);
      }
      setSession(s);
    });
    return () => {
      mounted = false;
    };
  }, [ticket.id]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = `Thanks · ${ticket.ticket_number} · Patiently`;
  }, [ticket.ticket_number]);

  async function handleSubmit() {
    if (rating < 1) {
      setError('Please tap a star to rate your visit.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const fb = await postFeedback(ticket.id, rating, nps, comment.trim());
      setSubmitted(fb);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  const summary = session?.summary;
  const firstName = ticket.patient.name.split(' ')[0];

  return (
    <main className="min-h-screen pb-24">
      <header className="px-5 pt-6 pb-4 flex items-center justify-between">
        <Logo />
        <span className="pill-ink text-[11px] uppercase tracking-wide">
          {POLI_LABEL[ticket.poli]}
        </span>
      </header>

      <section className="px-5 max-w-xl mx-auto">
        <div className="card overflow-hidden">
          <div className="p-6 bg-gradient-to-br from-brand-700 to-brand-600 text-white text-center">
            <div className="text-4xl mb-2">🎉</div>
            <div className="font-display text-3xl font-bold leading-tight">
              All done, {firstName}!
            </div>
            <p className="text-sm opacity-90 mt-2">
              Thanks for coming in. Your visit{' '}
              <span className="font-semibold">{ticket.ticket_number}</span> is
              complete.
            </p>
          </div>

          {summary && (
            <div className="px-5 py-4 border-b border-ink-100">
              <div className="text-[10px] uppercase tracking-wider text-ink-500 font-bold">
                Today's visit
              </div>
              <p className="text-sm text-ink-700 mt-1">
                <span className="font-medium">{summary.chief_complaint}</span>
              </p>
            </div>
          )}

          <div className="px-5 py-5">
            <div className="text-center mb-4">
              <h2 className="font-display font-semibold text-ink-900 text-base">
                How was your visit?
              </h2>
              <p className="text-xs text-ink-500 mt-1">
                Your feedback helps us look after you better next time.
              </p>
            </div>

            <div
              className="flex justify-center gap-1.5 mb-5"
              role="radiogroup"
              aria-label="Rate your visit"
            >
              {[1, 2, 3, 4, 5].map((star) => {
                const active = (hoverRating || rating) >= star;
                return (
                  <button
                    key={star}
                    type="button"
                    role="radio"
                    aria-checked={rating === star}
                    aria-label={`${star} star${star === 1 ? '' : 's'}`}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    disabled={!!submitted}
                    className={cn(
                      'w-12 h-12 grid place-items-center rounded-full transition-all',
                      'focus:outline-none focus:ring-4 focus:ring-brand-200',
                      active
                        ? 'text-warn-500 scale-110'
                        : 'text-ink-200 hover:text-warn-400'
                    )}
                  >
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill={active ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    >
                      <polygon points="12 2 15 9 22 9.5 17 14 18.5 21 12 17.5 5.5 21 7 14 2 9.5 9 9 12 2" />
                    </svg>
                  </button>
                );
              })}
            </div>

            <div className="mb-5">
              <div className="text-[10px] uppercase tracking-wider text-ink-500 font-bold mb-1.5 text-center">
                How likely are you to recommend us? (0–10)
              </div>
              <div className="flex flex-wrap justify-center gap-1">
                {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={nps === n}
                    onClick={() => setNps(n)}
                    disabled={!!submitted}
                    className={cn(
                      'w-8 h-8 rounded-lg text-xs font-bold transition-colors',
                      nps === n
                        ? 'bg-brand-600 text-white ring-2 ring-brand-200'
                        : n <= 6
                          ? 'bg-alert-50 text-alert-700 hover:bg-alert-100'
                          : n <= 8
                            ? 'bg-warn-50 text-warn-600 hover:bg-warn-100'
                            : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-ink-400 mt-1.5 px-1">
                <span>Not likely</span>
                <span>Very likely</span>
              </div>
            </div>

            <label className="block mb-4">
              <span className="text-[10px] uppercase tracking-wider text-ink-500 font-bold">
                Anything we could do better?
              </span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                disabled={!!submitted}
                placeholder="Optional — your words go straight to the clinic team."
                rows={3}
                maxLength={2000}
                className="mt-1.5 w-full resize-none rounded-2xl border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none px-4 py-3 text-sm disabled:opacity-70 disabled:bg-ink-50"
              />
            </label>

            {error && (
              <div className="text-xs text-alert-700 bg-alert-50 border border-alert-100 rounded-lg px-3 py-2 mb-3">
                {error}
              </div>
            )}

            {submitted ? (
              <div className="rounded-2xl bg-brand-50 border border-brand-100 px-4 py-3 text-center">
                <div className="text-sm font-semibold text-brand-700">
                  Thanks — feedback recorded
                </div>
                <p className="text-xs text-ink-500 mt-1">
                  Take care, {firstName}. See you next time.
                </p>
              </div>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting || rating < 1}
                className="btn-primary w-full"
              >
                {submitting ? 'Sending…' : 'Send feedback'}
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between text-xs text-ink-500">
          <Link href={`/p/${ticket.id}`} className="hover:text-ink-700">
            ← Back to ticket
          </Link>
          <span className="text-ink-400">
            Patiently · safe travels home
          </span>
        </div>
      </section>
    </main>
  );
}
