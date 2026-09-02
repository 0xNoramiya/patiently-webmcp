'use client';

import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { RED_FLAG_LABELS, type ClinicStats } from '@/lib/types';
import { cn } from '@/lib/utils';

function format(n: number | null | undefined, fallback = '—'): string {
  if (n === null || n === undefined) return fallback;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}

interface KpiProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'brand' | 'alert';
}

/**
 * A single headline metric.
 *
 * A value of zero is rendered muted. Ten tiles all reading "0" in full-strength
 * ink made an idle clinic look broken and buried the one number that was
 * actually moving — so an empty metric recedes and a live one carries weight.
 */
function Kpi({ label, value, hint, tone = 'neutral' }: KpiProps) {
  const empty = value === '0' || value === '—';

  return (
    <div
      className={cn(
        'flex-1 min-w-[132px] rounded-2xl border px-4 py-3',
        empty
          ? 'border-ink-100/70 bg-white/50'
          : 'bg-white shadow-soft',
        !empty && tone === 'brand' && 'border-brand-100 bg-brand-50/60',
        !empty && tone === 'alert' && 'border-alert-100 bg-alert-50/50',
        !empty && tone === 'neutral' && 'border-ink-100'
      )}
    >
      <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-ink-500">
        {label}
      </div>
      <div
        className={cn(
          'font-display text-2xl font-bold mt-0.5 tabular-nums',
          empty
            ? 'text-ink-300'
            : tone === 'alert'
              ? 'text-alert-700'
              : 'text-ink-900'
        )}
      >
        {value}
      </div>
      {hint && <div className="text-[11px] text-ink-400 mt-0.5">{hint}</div>}
    </div>
  );
}

/** One of the lower-priority daily counters, on a single shared line. */
function Tally({ label, value }: { label: string; value: number }) {
  return (
    <span className={cn('tabular-nums', value > 0 ? 'text-ink-700' : 'text-ink-400')}>
      <span className={value > 0 ? 'font-semibold text-ink-900' : 'font-semibold'}>
        {value}
      </span>{' '}
      {label}
    </span>
  );
}

export function StatsStrip({ adminPassword }: { adminPassword: string }) {
  const [stats, setStats] = useState<ClinicStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await api.getStats(adminPassword);
      setStats(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    }
  }, [adminPassword]);

  useEffect(() => {
    refresh().catch(() => {});
    const id = setInterval(() => refresh().catch(() => {}), 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  if (error) {
    return (
      <div className="px-4 py-2 text-[11px] text-alert-700">
        Clinic stats unavailable — {error}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="px-4 py-2">
        <div className="flex gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-[72px] flex-1 min-w-[132px] animate-pulse rounded-2xl border border-ink-100 bg-white"
            />
          ))}
        </div>
      </div>
    );
  }

  const triageHint = (() => {
    const flags = Object.entries(stats.triage.by_flag).sort((a, b) => b[1] - a[1]);
    if (!flags.length) return 'none today';
    const [code, count] = flags[0];
    return `${RED_FLAG_LABELS[code] || code} ×${count}`;
  })();

  return (
    <div className="px-4 py-2">
      {/* The five numbers a clinician acts on. */}
      <div className="flex gap-3 overflow-x-auto scroll-thin">
        <Kpi
          label="Waiting"
          value={format(stats.tickets.waiting)}
          hint="all departments"
          tone="neutral"
        />
        <Kpi
          label="In consultation"
          value={format(stats.tickets.in_consultation)}
          hint="with a doctor"
          tone="brand"
        />
        <Kpi
          label="Triage flags"
          value={format(stats.triage.total_today)}
          hint={triageHint}
          tone={stats.triage.total_today > 0 ? 'alert' : 'neutral'}
        />
        <Kpi
          label="Avg wait"
          value={stats.avg_wait_minutes === null ? '—' : `${format(stats.avg_wait_minutes)}m`}
          hint="issued → called"
          tone="neutral"
        />
        <Kpi
          label="Seen today"
          value={format(stats.tickets.seen_today)}
          hint="visits completed"
          tone="neutral"
        />
      </div>

      {/* Everything else is a running tally, not a headline. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-ink-400">
        <span className="font-semibold uppercase tracking-[0.08em] text-ink-300">
          Today
        </span>
        <Tally label="intakes completed" value={stats.intakes_completed_today} />
        <Tally label="SOAP notes" value={stats.notes_today} />
        <Tally label="transcripts" value={stats.transcripts_today} />
        <Tally label="reminders sent" value={stats.reminders.sent_today} />
        {stats.reminders.pending > 0 && (
          <span className="tabular-nums text-ink-400">
            {stats.reminders.pending} pending
          </span>
        )}
        {stats.avg_consult_minutes !== null && (
          <span className="tabular-nums text-ink-400">
            avg consult {format(stats.avg_consult_minutes)}m
          </span>
        )}
      </div>
    </div>
  );
}
