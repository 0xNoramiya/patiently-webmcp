'use client';

import { useMemo } from 'react';

import { cn } from '@/lib/utils';

interface ExtractedField {
  key: string;
  label: string;
  value: string;
  /** OPQRST core counts toward the completion bar; auxiliary fields don't. */
  core: boolean;
}

const FIELD_LABELS: Record<string, { label: string; core: boolean }> = {
  chief_complaint: { label: 'Main concern', core: true },
  onset: { label: 'Started', core: true },
  location: { label: 'Where', core: true },
  character: { label: 'Feels like', core: true },
  severity: { label: 'Severity', core: true },
  duration: { label: 'Duration', core: true },
  associated_symptoms: { label: 'Other symptoms', core: false },
  aggravating: { label: 'Worse with', core: false },
  relieving: { label: 'Better with', core: false },
  medications_taken_today: { label: 'Meds today', core: false },
  followup_status: { label: 'Now vs last visit', core: true },
  followup_adherence: { label: 'Took meds', core: true },
  followup_side_effects: { label: 'Side effects', core: false },
};

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

function toDisplay(key: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const cleaned = value
      .filter((x) => x !== null && x !== '')
      .map((x) => String(x).trim())
      .filter((x) => x.length > 0);
    return cleaned.length ? cleaned.join(', ') : null;
  }
  if (key === 'severity' && typeof value === 'number') {
    const word = SEVERITY_WORDS[Math.round(value)];
    return word ? `${value}/10 · ${word}` : `${value}/10`;
  }
  const s = String(value).trim();
  return s || null;
}

export function ExtractedChips({
  data,
  isFollowup,
}: {
  data: Record<string, unknown>;
  isFollowup: boolean;
}) {
  const chips: ExtractedField[] = useMemo(() => {
    const out: ExtractedField[] = [];
    for (const [key, def] of Object.entries(FIELD_LABELS)) {
      const v = toDisplay(key, data?.[key]);
      if (!v) continue;
      const isFollowupField = key.startsWith('followup_');
      if (isFollowupField && !isFollowup) continue;
      if (!isFollowupField && key === 'chief_complaint' && isFollowup) {
        // For follow-up visits, the chief complaint is often a delta — keep it
      }
      out.push({ key, label: def.label, value: v, core: def.core });
    }
    return out;
  }, [data, isFollowup]);

  // Completion bar — how many core fields are filled vs expected.
  const { coreFilled, coreTotal, percent } = useMemo(() => {
    const coreKeys = Object.entries(FIELD_LABELS)
      .filter(([k, def]) => {
        if (!def.core) return false;
        if (k.startsWith('followup_') && !isFollowup) return false;
        return true;
      })
      .map(([k]) => k);
    const filled = chips.filter((c) => c.core).length;
    const total = coreKeys.length;
    return {
      coreFilled: filled,
      coreTotal: total,
      percent: total > 0 ? Math.min(100, Math.round((filled / total) * 100)) : 0,
    };
  }, [chips, isFollowup]);

  if (chips.length === 0) return null;

  return (
    <div className="border-t border-ink-100 bg-white/95 backdrop-blur px-3 pt-2 pb-1">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10px] uppercase tracking-wider text-ink-500 font-bold">
          We've noted
        </span>
        <span className="text-[10px] tabular-nums text-ink-400">
          {coreFilled}/{coreTotal} key details
        </span>
      </div>

      <div className="h-1 rounded-full bg-ink-100 overflow-hidden mb-2">
        <div
          key={percent}
          className={cn(
            'h-full bg-brand-500 progress-fill',
            percent === 100 && 'bg-brand-600'
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div
        className="flex gap-1.5 overflow-x-auto scroll-thin pb-1 -mx-1 px-1"
        role="list"
      >
        {chips.map((c) => (
          <div
            key={c.key}
            role="listitem"
            className="chip-pop shrink-0 inline-flex items-baseline gap-1.5 bg-brand-50 border border-brand-100 rounded-full pl-2.5 pr-3 py-1 max-w-[220px]"
          >
            <span className="text-[9px] uppercase tracking-wider text-brand-700 font-bold whitespace-nowrap">
              {c.label}
            </span>
            <span className="text-xs text-ink-900 truncate">{c.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
