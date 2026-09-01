'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '@/lib/api';
import type { VitalSignsIn, VitalSignsOut } from '@/lib/types';
import { cn } from '@/lib/utils';

interface FieldDef {
  key: keyof VitalSignsIn;
  label: string;
  unit: string;
  step?: string;
  min?: number;
  max?: number;
}

const FIELDS: FieldDef[] = [
  { key: 'systolic_bp', label: 'SBP', unit: 'mmHg', min: 40, max: 300 },
  { key: 'diastolic_bp', label: 'DBP', unit: 'mmHg', min: 20, max: 200 },
  { key: 'heart_rate', label: 'HR', unit: 'bpm', min: 20, max: 300 },
  { key: 'respiratory_rate', label: 'RR', unit: '/min', min: 4, max: 60 },
  { key: 'temperature_c', label: 'Temp', unit: '°C', min: 30, max: 43, step: '0.1' },
  { key: 'spo2', label: 'SpO₂', unit: '%', min: 40, max: 100 },
  { key: 'pain_score', label: 'Pain', unit: '/10', min: 0, max: 10 },
];

interface RangeDef {
  key: keyof VitalSignsOut;
  short: string;
  unit: string;
  displayMin: number;
  displayMax: number;
  normalLow: number;
  normalHigh: number;
  criticalLowAt?: number;
  criticalHighAt?: number;
  criticalCodes: string[];
  icon: 'bp' | 'heart' | 'wave' | 'thermo' | 'lung' | 'pain';
  decimals?: number;
}

const RANGES: RangeDef[] = [
  {
    key: 'systolic_bp',
    short: 'SBP',
    unit: 'mmHg',
    displayMin: 60,
    displayMax: 220,
    normalLow: 100,
    normalHigh: 140,
    criticalLowAt: 90,
    criticalHighAt: 180,
    criticalCodes: ['HYPERTENSIVE_CRISIS', 'HYPOTENSION'],
    icon: 'bp',
  },
  {
    key: 'diastolic_bp',
    short: 'DBP',
    unit: 'mmHg',
    displayMin: 40,
    displayMax: 140,
    normalLow: 60,
    normalHigh: 90,
    criticalHighAt: 120,
    criticalCodes: ['HYPERTENSIVE_CRISIS'],
    icon: 'bp',
  },
  {
    key: 'heart_rate',
    short: 'HR',
    unit: 'bpm',
    displayMin: 40,
    displayMax: 180,
    normalLow: 60,
    normalHigh: 100,
    criticalLowAt: 50,
    criticalHighAt: 130,
    criticalCodes: ['SEVERE_TACHYCARDIA', 'BRADYCARDIA'],
    icon: 'heart',
  },
  {
    key: 'respiratory_rate',
    short: 'RR',
    unit: '/min',
    displayMin: 8,
    displayMax: 32,
    normalLow: 12,
    normalHigh: 20,
    criticalHighAt: 24,
    criticalCodes: ['TACHYPNEA'],
    icon: 'wave',
  },
  {
    key: 'temperature_c',
    short: 'Temp',
    unit: '°C',
    displayMin: 34,
    displayMax: 41,
    normalLow: 36.0,
    normalHigh: 37.5,
    criticalLowAt: 35.0,
    criticalHighAt: 39.0,
    criticalCodes: ['HIGH_FEVER', 'HYPOTHERMIA'],
    icon: 'thermo',
    decimals: 1,
  },
  {
    key: 'spo2',
    short: 'SpO₂',
    unit: '%',
    displayMin: 80,
    displayMax: 100,
    normalLow: 95,
    normalHigh: 100,
    criticalLowAt: 92,
    criticalCodes: ['HYPOXIA'],
    icon: 'lung',
  },
  {
    key: 'pain_score',
    short: 'Pain',
    unit: '/10',
    displayMin: 0,
    displayMax: 10,
    normalLow: 0,
    normalHigh: 3,
    criticalHighAt: 8,
    criticalCodes: ['SEVERE_PAIN'],
    icon: 'pain',
  },
];

function pctOf(value: number, min: number, max: number): number {
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

export function VitalsCard({
  ticketId,
  adminPassword,
}: {
  ticketId: string;
  adminPassword: string;
}) {
  const [vitals, setVitals] = useState<VitalSignsOut | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const v = await api.getVitals(ticketId, adminPassword);
      setVitals(v);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    }
  }, [ticketId, adminPassword]);

  useEffect(() => {
    setEditing(false);
    setDraft({});
    refresh().catch(() => {});
  }, [ticketId, refresh]);

  function startEdit() {
    const base: Record<string, string> = {};
    if (vitals) {
      for (const f of FIELDS) {
        const v = vitals[f.key as keyof VitalSignsOut];
        if (v !== null && v !== undefined) base[f.key as string] = String(v);
      }
    }
    setDraft(base);
    setEditing(true);
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const payload: VitalSignsIn = {};
      for (const f of FIELDS) {
        const raw = draft[f.key as string];
        if (raw === undefined || raw === '') {
          (payload as any)[f.key] = null;
          continue;
        }
        const n = f.step ? parseFloat(raw) : parseInt(raw, 10);
        if (Number.isNaN(n)) continue;
        (payload as any)[f.key] = n;
      }
      const v = await api.recordVitals(ticketId, payload, adminPassword);
      setVitals(v);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  const findings = vitals?.critical_findings || [];

  return (
    <div className="card-padded">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-display font-semibold text-ink-900 text-sm uppercase tracking-wide">
            Vital signs
          </h3>
          <div className="text-[11px] text-ink-400 mt-0.5">
            Triage-nurse measurements · auto-flagged for critical thresholds
          </div>
        </div>
        {!editing ? (
          <button onClick={startEdit} className="btn-secondary text-xs py-1.5 px-3">
            {vitals ? 'Update' : 'Record'}
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(false)}
              className="btn-ghost text-xs py-1.5 px-3"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={busy}
              className="btn-primary text-xs py-1.5 px-3"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="text-xs text-alert-700 bg-alert-50 border border-alert-100 rounded-lg px-3 py-2 mb-3">
          {error}
        </div>
      )}

      {!editing && !vitals && (
        <div className="text-xs text-ink-400 italic">
          No vitals recorded. Click <span className="font-semibold">Record</span> to
          enter BP, HR, RR, Temp, SpO₂, and pain score.
        </div>
      )}

      {findings.length > 0 && !editing && (
        <div className="mb-3 rounded-xl border border-alert-100 bg-alert-50 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wider text-alert-700 font-bold mb-1">
            Critical findings
          </div>
          <ul className="text-xs text-alert-700 space-y-0.5">
            {vitals!.critical_labels.map((label) => (
              <li key={label}>• {label}</li>
            ))}
          </ul>
        </div>
      )}

      {!editing && vitals && (
        <div className="space-y-2.5">
          {RANGES.map((def, idx) => {
            const raw = vitals[def.key] as number | null;
            const isCritical = def.criticalCodes.some((c) => findings.includes(c));
            return (
              <VitalRow
                key={def.key as string}
                def={def}
                value={raw}
                isCritical={isCritical}
                index={idx}
              />
            );
          })}
        </div>
      )}

      {editing && (
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <label key={f.key as string} className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-semibold">
                {f.label}{' '}
                <span className="text-ink-400 font-normal normal-case">
                  ({f.unit})
                </span>
              </span>
              <input
                type="number"
                step={f.step || '1'}
                min={f.min}
                max={f.max}
                value={draft[f.key as string] ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, [f.key as string]: e.target.value })
                }
                className="mt-1 w-full rounded-xl border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none px-3 py-2 text-sm"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function VitalRow({
  def,
  value,
  isCritical,
  index,
}: {
  def: RangeDef;
  value: number | null;
  isCritical: boolean;
  index: number;
}) {
  const hasValue = value !== null && value !== undefined;
  const targetPct = useMemo(
    () => (hasValue ? pctOf(value!, def.displayMin, def.displayMax) : 0),
    [hasValue, value, def.displayMin, def.displayMax]
  );

  const [pos, setPos] = useState(0);
  useEffect(() => {
    setPos(0);
    if (!hasValue) return;
    const t = setTimeout(() => setPos(targetPct), 80 + index * 60);
    return () => clearTimeout(t);
  }, [hasValue, targetPct, index]);

  const normalLeft = pctOf(def.normalLow, def.displayMin, def.displayMax);
  const normalRight = pctOf(def.normalHigh, def.displayMin, def.displayMax);
  const criticalLowRight = def.criticalLowAt
    ? pctOf(def.criticalLowAt, def.displayMin, def.displayMax)
    : 0;
  const criticalHighLeft = def.criticalHighAt
    ? pctOf(def.criticalHighAt, def.displayMin, def.displayMax)
    : 100;

  const displayValue = hasValue
    ? def.decimals
      ? value!.toFixed(def.decimals)
      : String(value)
    : '—';

  return (
    <div
      className="vital-row-in flex items-center gap-3"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <VitalIcon
        kind={def.icon}
        critical={isCritical}
        value={value}
        active={hasValue}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-ink-500 font-semibold">
            {def.short}
          </span>
          <span
            className={cn(
              'font-display font-bold text-base tabular-nums',
              isCritical && hasValue
                ? 'text-alert-700 vital-pulse'
                : 'text-ink-900',
              !hasValue && 'text-ink-300'
            )}
          >
            {displayValue}
            <span className="text-[10px] text-ink-400 font-normal ml-1">
              {def.unit}
            </span>
          </span>
        </div>

        <div className="relative mt-1 h-2.5 rounded-full bg-ink-100 overflow-visible">
          {/* critical-low zone */}
          {def.criticalLowAt && (
            <div
              className="absolute top-0 bottom-0 bg-alert-200/70 rounded-l-full"
              style={{ left: 0, width: `${criticalLowRight}%` }}
            />
          )}
          {/* critical-high zone */}
          {def.criticalHighAt && (
            <div
              className="absolute top-0 bottom-0 bg-alert-200/70 rounded-r-full"
              style={{
                left: `${criticalHighLeft}%`,
                right: 0,
              }}
            />
          )}
          {/* normal band */}
          <div
            className="absolute top-0 bottom-0 bg-brand-300/55"
            style={{
              left: `${normalLeft}%`,
              width: `${normalRight - normalLeft}%`,
            }}
          />
          {/* marker */}
          {hasValue && (
            <div
              className={cn(
                'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-md',
                isCritical ? 'bg-alert-600' : 'bg-ink-900'
              )}
              style={{
                left: `${pos}%`,
                transition: 'left 720ms cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function VitalIcon({
  kind,
  critical,
  value,
  active,
}: {
  kind: RangeDef['icon'];
  critical: boolean;
  value: number | null;
  active: boolean;
}) {
  const tone = critical
    ? 'text-alert-700'
    : active
      ? 'text-brand-700'
      : 'text-ink-300';

  if (kind === 'heart') {
    const hr = typeof value === 'number' && value > 0 ? value : null;
    const duration = hr ? `${(60 / hr).toFixed(2)}s` : undefined;
    return (
      <div
        className={cn('w-7 h-7 grid place-items-center shrink-0', tone)}
        style={
          hr ? ({ '--hr-duration': duration } as React.CSSProperties) : undefined
        }
        aria-hidden
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={hr ? 'heart-beat' : undefined}
        >
          <path d="M12 21s-7-4.3-7-10a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 5.7-7 10-7 10h-4z" />
        </svg>
      </div>
    );
  }

  if (kind === 'wave') {
    const rr = typeof value === 'number' && value > 0 ? value : null;
    const duration = rr ? `${(60 / rr).toFixed(2)}s` : undefined;
    return (
      <div
        className={cn('w-7 h-7 grid place-items-center shrink-0', tone)}
        style={
          rr ? ({ '--rr-duration': duration } as React.CSSProperties) : undefined
        }
        aria-hidden
      >
        <div
          className={cn('w-5 h-1 rounded-full bg-current', rr && 'breath-wave')}
        />
      </div>
    );
  }

  if (kind === 'thermo') {
    return (
      <div className={cn('w-7 h-7 grid place-items-center shrink-0', tone)} aria-hidden>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z" />
        </svg>
      </div>
    );
  }

  if (kind === 'lung') {
    return (
      <div className={cn('w-7 h-7 grid place-items-center shrink-0', tone)} aria-hidden>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6.5 14c0-2 1-4 1.5-7 .5-1.5 2-1.5 2 0v8a2 2 0 0 1-2 2c-1.5 0-2-1.5-1.5-3z" />
          <path d="M17.5 14c0-2-1-4-1.5-7-.5-1.5-2-1.5-2 0v8a2 2 0 0 0 2 2c1.5 0 2-1.5 1.5-3z" />
          <path d="M12 4v11" />
        </svg>
      </div>
    );
  }

  if (kind === 'pain') {
    return (
      <div className={cn('w-7 h-7 grid place-items-center shrink-0', tone)} aria-hidden>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M8 15s1.5-2 4-2 4 2 4 2" />
          <path d="M9 9l1 1M15 9l-1 1" />
        </svg>
      </div>
    );
  }

  return (
    <div className={cn('w-7 h-7 grid place-items-center shrink-0', tone)} aria-hidden>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 4a8 8 0 0 1 8 8" />
        <path d="M4 12a8 8 0 0 1 8-8" />
        <path d="M12 12l3-3" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
      </svg>
    </div>
  );
}
