'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { api } from '@/lib/api';
import type { IntakeSession } from '@/lib/types';

const SEVERITY_WORDS: Record<number, string> = {
  0: 'no pain',
  1: 'very mild',
  2: 'very mild',
  3: 'mild',
  4: 'mild',
  5: 'moderate',
  6: 'moderate',
  7: 'severe',
  8: 'severe',
  9: 'very severe',
  10: 'unbearable',
};

function pretty(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const cleaned = value.filter((x) => x !== null && x !== '');
    return cleaned.length ? cleaned.join(', ') : null;
  }
  const s = String(value).trim();
  return s || null;
}

export function YourStoryCard({ ticketId }: { ticketId: string }) {
  const [session, setSession] = useState<IntakeSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api
      .getSession(ticketId)
      .then((s) => {
        if (mounted) setSession(s);
      })
      .catch((e) => {
        if (mounted) {
          setError(e instanceof Error ? e.message : 'failed');
        }
      });
    return () => {
      mounted = false;
    };
  }, [ticketId]);

  if (error || !session || session.status !== 'completed') return null;

  const d = session.structured_data || {};
  const cc = pretty(d.chief_complaint);
  const onset = pretty(d.onset);
  const location = pretty(d.location);
  const character = pretty(d.character);
  const severityNum =
    typeof d.severity === 'number' ? (d.severity as number) : null;
  const severityWord =
    severityNum !== null ? SEVERITY_WORDS[Math.round(severityNum)] : null;
  const duration = pretty(d.duration);
  const assoc = pretty(d.associated_symptoms);
  const meds = pretty(d.medications_taken_today);
  const aggravating = pretty(d.aggravating);
  const relieving = pretty(d.relieving);
  const followupStatus = pretty(d.followup_status);
  const followupAdherence = pretty(d.followup_adherence);
  const followupSide = pretty(d.followup_side_effects);

  const bullets: { label: string; value: string }[] = [];
  if (onset) bullets.push({ label: 'When it started', value: onset });
  if (location) bullets.push({ label: 'Where you feel it', value: location });
  if (character) bullets.push({ label: 'What it feels like', value: character });
  if (severityWord || severityNum !== null) {
    bullets.push({
      label: 'How severe',
      value:
        severityNum !== null
          ? `${severityWord} (${severityNum}/10)`
          : severityWord!,
    });
  }
  if (duration) bullets.push({ label: 'How long', value: duration });
  if (assoc) bullets.push({ label: 'Other symptoms', value: assoc });
  if (aggravating) bullets.push({ label: 'Makes it worse', value: aggravating });
  if (relieving) bullets.push({ label: 'Makes it better', value: relieving });
  if (meds) bullets.push({ label: 'Medication today', value: meds });
  if (followupStatus)
    bullets.push({ label: 'How you feel vs last visit', value: followupStatus });
  if (followupAdherence)
    bullets.push({ label: 'Took medication', value: followupAdherence });
  if (followupSide)
    bullets.push({ label: 'Side effects', value: followupSide });

  if (!cc && bullets.length === 0) return null;

  return (
    <div className="card-padded slide-fade-up mt-5">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-sm font-bold">
          ✓
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-brand-700 font-bold">
            Your story · saved
          </div>
          <h3 className="font-display font-semibold text-ink-900">
            What we'll tell your doctor
          </h3>
        </div>
      </div>

      {cc && (
        <p className="mt-3 text-[15px] text-ink-700">
          You came in today for <span className="font-semibold">{cc}</span>.
        </p>
      )}

      {bullets.length > 0 && (
        <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {bullets.map((b) => (
            <li key={b.label}>
              <span className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold block">
                {b.label}
              </span>
              <span className="text-ink-900">{b.value}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 rounded-xl bg-brand-50/60 border border-brand-100 px-3 py-2 text-xs text-brand-700">
        Forgot to mention something important?{' '}
        <Link
          href={`/p/${ticketId}/intake`}
          className="font-semibold underline hover:text-brand-800"
        >
          Add it now
        </Link>{' '}
        — your doctor will see the update.
      </div>
    </div>
  );
}
