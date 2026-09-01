'use client';

import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api';
import type { InteractionsReport } from '@/lib/types';
import { cn } from '@/lib/utils';

const SEVERITY_ORDER = ['major', 'moderate', 'minor'] as const;

const SEVERITY_STYLE: Record<
  'major' | 'moderate' | 'minor',
  { row: string; chip: string; label: string }
> = {
  major: {
    row: 'border-alert-200 bg-alert-50',
    chip: 'bg-alert-600 text-white',
    label: 'MAJOR',
  },
  moderate: {
    row: 'border-warn-100 bg-warn-50/60',
    chip: 'bg-warn-600 text-white',
    label: 'MODERATE',
  },
  minor: {
    row: 'border-ink-100 bg-ink-50',
    chip: 'bg-ink-500 text-white',
    label: 'MINOR',
  },
};

export function InteractionsPanel({
  ticketId,
  adminPassword,
  refreshSignal,
}: {
  ticketId: string;
  adminPassword: string;
  refreshSignal?: number;
}) {
  const [report, setReport] = useState<InteractionsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api.getInteractions(ticketId, adminPassword);
      setReport(r);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    }
  }, [ticketId, adminPassword]);

  useEffect(() => {
    setReport(null);
    refresh().catch(() => {});
  }, [ticketId, refreshSignal, refresh]);

  if (error) {
    return (
      <div className="text-xs text-alert-700 bg-alert-50 border border-alert-100 rounded-lg px-3 py-2">
        {error}
      </div>
    );
  }

  if (!report) return null;

  const { interactions, drug_count, sources } = report;

  if (drug_count === 0) {
    return null; // no drugs at all yet — keep the UI quiet
  }

  if (interactions.length === 0) {
    return (
      <div className="rounded-2xl border border-brand-100 bg-brand-50/40 px-4 py-3 text-xs text-brand-700">
        <span className="font-semibold">Interaction check:</span>{' '}
        {drug_count} drug{drug_count === 1 ? '' : 's'} reviewed (drafts ·
        home · prior) — no known interactions.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-alert-100 bg-white p-4 shadow-soft">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h4 className="font-display font-semibold text-ink-900 text-sm uppercase tracking-wide flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-alert-500 vital-pulse" />
            Drug interactions
          </h4>
          <div className="text-[11px] text-ink-400 mt-0.5">
            {drug_count} drugs reviewed · drafts {sources.drafts.length} · home{' '}
            {sources.home_meds.length} · prior {sources.previous_rx.length}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {SEVERITY_ORDER.map((sev) => {
            const n = report.by_severity[sev] || 0;
            if (!n) return null;
            return (
              <span
                key={sev}
                className={cn(
                  'pill text-[10px] font-bold',
                  SEVERITY_STYLE[sev].chip
                )}
              >
                {n} {sev}
              </span>
            );
          })}
        </div>
      </div>

      <ul className="space-y-1.5 mt-3">
        {interactions.map((i, idx) => (
          <li
            key={`${i.drug_a}-${i.drug_b}-${idx}`}
            className={cn(
              'rounded-xl border px-3 py-2',
              SEVERITY_STYLE[i.severity].row
            )}
          >
            <div className="flex items-start gap-2">
              <span
                className={cn(
                  'shrink-0 text-[9px] font-bold rounded px-1.5 py-0.5 mt-0.5',
                  SEVERITY_STYLE[i.severity].chip
                )}
              >
                {SEVERITY_STYLE[i.severity].label}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-ink-900">
                  {i.drug_a} <span className="text-ink-400">×</span>{' '}
                  {i.drug_b}
                </div>
                <div className="text-xs text-ink-700 mt-0.5">{i.rationale}</div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
