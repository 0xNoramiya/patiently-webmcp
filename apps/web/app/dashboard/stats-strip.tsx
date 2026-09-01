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
  tone?: 'neutral' | 'brand' | 'warn' | 'alert';
}

function Kpi({ label, value, hint, tone = 'neutral' }: KpiProps) {
  return (
    <div
      className={cn(
        'flex-1 min-w-[120px] rounded-2xl border bg-white px-4 py-3 shadow-soft',
        tone === 'brand' && 'border-brand-100 bg-brand-50/60',
        tone === 'warn' && 'border-warn-100 bg-warn-50/40',
        tone === 'alert' && 'border-alert-100 bg-alert-50/40',
        tone === 'neutral' && 'border-ink-100'
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
        {label}
      </div>
      <div
        className={cn(
          'font-display text-2xl font-bold mt-0.5',
          tone === 'alert' ? 'text-alert-700' : 'text-ink-900'
        )}
      >
        {value}
      </div>
      {hint && <div className="text-[11px] text-ink-400 mt-0.5 truncate">{hint}</div>}
    </div>
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
      <div className="text-[11px] text-alert-700 px-4 py-2">{error}</div>
    );
  }

  if (!stats) {
    return (
      <div className="flex gap-3 px-4 py-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 min-w-[120px] h-[68px] rounded-2xl border border-ink-100 bg-white shadow-soft animate-pulse"
          />
        ))}
      </div>
    );
  }

  const triageHint = (() => {
    const flags = Object.entries(stats.triage.by_flag).sort((a, b) => b[1] - a[1]);
    if (!flags.length) return 'none today';
    const top = flags[0];
    const short = RED_FLAG_LABELS[top[0]] || top[0];
    return `${short} ×${top[1]}`;
  })();

  return (
    <div className="px-4 py-2">
      <div className="flex gap-3 overflow-x-auto scroll-thin">
        <Kpi
          label="Waiting"
          value={format(stats.tickets.waiting)}
          hint="across all departments"
          tone="neutral"
        />
        <Kpi
          label="In consultation"
          value={format(stats.tickets.in_consultation)}
          hint="currently with a doctor"
          tone="brand"
        />
        <Kpi
          label="Seen today"
          value={format(stats.tickets.seen_today)}
          hint="completed visits"
          tone="neutral"
        />
        <Kpi
          label="Intakes done"
          value={format(stats.intakes_completed_today)}
          hint="agent-completed today"
          tone="neutral"
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
          label="Avg consult"
          value={stats.avg_consult_minutes === null ? '—' : `${format(stats.avg_consult_minutes)}m`}
          hint="called → completed"
          tone="neutral"
        />
        <Kpi
          label="Reminders sent"
          value={format(stats.reminders.sent_today)}
          hint={`${stats.reminders.pending} pending`}
          tone="neutral"
        />
        <Kpi
          label="Transcripts"
          value={format(stats.transcripts_today)}
          hint="Speechmatics today"
          tone="neutral"
        />
        <Kpi
          label="SOAP notes"
          value={format(stats.notes_today)}
          hint="Featherless today"
          tone="neutral"
        />
      </div>
    </div>
  );
}
