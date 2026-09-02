'use client';

import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api';
import type { PrescriptionDraftOut } from '@/lib/types';
import { cn } from '@/lib/utils';
import { InteractionsPanel } from './interactions-panel';

export function PrescriptionsWidget({
  ticketId,
  adminPassword,
}: {
  ticketId: string;
  adminPassword: string;
}) {
  const [rows, setRows] = useState<PrescriptionDraftOut[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [interactionsRefresh, setInteractionsRefresh] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const list = await api.listPrescriptions(ticketId, adminPassword);
      setRows(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    }
  }, [ticketId, adminPassword]);

  useEffect(() => {
    setRows(null);
    setError(null);
    refresh().catch(() => {});
  }, [ticketId, refresh]);

  async function handleDraft() {
    setBusy(true);
    setError(null);
    try {
      const list = await api.draftPrescriptions(ticketId, adminPassword);
      setRows(list);
      setInteractionsRefresh((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'drafting failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(rx: PrescriptionDraftOut) {
    setPendingId(rx.id);
    try {
      const updated = await api.approvePrescription(
        rx.id,
        !rx.approved,
        adminPassword
      );
      setRows((cur) =>
        cur ? cur.map((r) => (r.id === rx.id ? updated : r)) : cur
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'approve failed');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="card-padded">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-display font-semibold text-ink-900 text-sm uppercase tracking-wide">
            Prescriptions
          </h3>
          <div className="text-[11px] text-ink-400 mt-0.5">
            Drafted from the SOAP plan · physician must approve
          </div>
        </div>
        <button
          onClick={handleDraft}
          disabled={busy}
          className="btn-primary text-xs py-2 px-4"
        >
          {busy
            ? 'Drafting…'
            : rows && rows.length > 0
              ? 'Redraft'
              : 'Draft prescriptions'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-alert-700 bg-alert-50 border border-alert-100 rounded-lg px-3 py-2 mb-3">
          {error}
        </div>
      )}

      <div className="mb-3">
        <InteractionsPanel
          ticketId={ticketId}
          adminPassword={adminPassword}
          refreshSignal={interactionsRefresh}
        />
      </div>

      {busy && (
        <div className="text-sm text-ink-500 flex items-center gap-2 mb-2">
          <span
            className="typing-dot w-2 h-2 rounded-full bg-brand-500"
            style={{ animationDelay: '0s' }}
          />
          <span
            className="typing-dot w-2 h-2 rounded-full bg-brand-500"
            style={{ animationDelay: '0.15s' }}
          />
          <span
            className="typing-dot w-2 h-2 rounded-full bg-brand-500"
            style={{ animationDelay: '0.3s' }}
          />
          <span>Drafting prescriptions from the SOAP plan…</span>
        </div>
      )}

      {!busy && !error && rows && rows.length === 0 && (
        <div className="text-xs text-ink-400 italic">
          No prescriptions drafted yet. Click <span className="font-semibold">Draft prescriptions</span>{' '}
          after the SOAP note to generate the medication list.
        </div>
      )}

      {rows && rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((rx) => (
            <li
              key={rx.id}
              className={cn(
                'rounded-xl border p-3 transition-colors',
                rx.approved
                  ? 'border-brand-200 bg-brand-50/50'
                  : 'border-ink-100 bg-white'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-display font-bold text-ink-900 text-base">
                      {rx.drug_name}
                    </span>
                    <span className="text-sm text-ink-700">{rx.dose}</span>
                    {rx.approved && (
                      <span className="pill-brand text-[10px]">approved</span>
                    )}
                  </div>
                  <div className="text-xs text-ink-500 mt-0.5">
                    {rx.frequency} · {rx.duration_days} day
                    {rx.duration_days === 1 ? '' : 's'}
                    {rx.instructions ? ` · ${rx.instructions}` : ''}
                  </div>
                  {rx.rationale && (
                    <div className="text-xs text-ink-400 italic mt-1">
                      {rx.rationale}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleToggle(rx)}
                  disabled={pendingId === rx.id}
                  className={cn(
                    'shrink-0 text-[11px] py-1.5 px-3 rounded-full font-semibold transition-colors',
                    rx.approved
                      ? 'bg-ink-100 text-ink-700 hover:bg-ink-200'
                      : 'bg-brand-600 text-white hover:bg-brand-700'
                  )}
                >
                  {pendingId === rx.id
                    ? '…'
                    : rx.approved
                      ? 'Unapprove'
                      : 'Approve'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
