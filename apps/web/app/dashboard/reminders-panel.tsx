'use client';

import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api';
import type { AppointmentReminder } from '@/lib/types';
import { cn, formatRelative } from '@/lib/utils';

function relativeFuture(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = t - now;
  if (diff <= 0) return 'now';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'soon';
  if (minutes < 60) return `in ${minutes}m`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `in ${h}h`;
  const d = Math.floor(h / 24);
  return `in ${d}d`;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function RemindersPanel({ adminPassword }: { adminPassword: string }) {
  const [reminders, setReminders] = useState<AppointmentReminder[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyRunDue, setBusyRunDue] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await api.listReminders(adminPassword);
      setReminders(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reminders');
    }
  }, [adminPassword]);

  useEffect(() => {
    refresh().catch(() => {});
    const id = setInterval(() => refresh().catch(() => {}), 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  async function handleFire(reminderId: string) {
    setBusyId(reminderId);
    try {
      await api.fireReminder(reminderId, adminPassword);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fire reminder');
    } finally {
      setBusyId(null);
    }
  }

  async function handleRunDue() {
    setBusyRunDue(true);
    try {
      await api.runDueReminders(adminPassword);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run due');
    } finally {
      setBusyRunDue(false);
    }
  }

  const pending = (reminders || []).filter((r) => r.status === 'pending');
  const sent = (reminders || []).filter((r) => r.status === 'sent');

  return (
    <div className="card-padded">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-display font-semibold text-ink-900 text-sm uppercase tracking-wide">
            Appointment reminders
          </h3>
          <div className="text-[11px] text-ink-400 mt-0.5">
            Scheduler runs every 60s · drafted, not delivered
          </div>
        </div>
        <button
          onClick={handleRunDue}
          disabled={busyRunDue}
          className="btn-secondary text-[11px] py-1.5 px-3"
        >
          {busyRunDue ? 'Running…' : 'Run due now'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-alert-700 bg-alert-50 border border-alert-100 rounded-lg px-3 py-2 mb-3">
          {error}
        </div>
      )}

      {!reminders && <div className="text-xs text-ink-400">Loading…</div>}

      {reminders && reminders.length === 0 && (
        <div className="text-xs text-ink-400 italic">No reminders scheduled.</div>
      )}

      {pending.length > 0 && (
        <div className="space-y-2 mb-4">
          <div className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">
            Pending ({pending.length})
          </div>
          {pending.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-ink-100 p-3 bg-white"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink-900 truncate">
                    {r.patient.name}
                  </div>
                  <div className="text-xs text-ink-500 truncate">{r.reason}</div>
                  <div className="text-[11px] text-ink-400 mt-1">
                    Appointment {shortDate(r.appointment_at)} · fires{' '}
                    {relativeFuture(r.scheduled_for)}
                  </div>
                </div>
                <button
                  onClick={() => handleFire(r.id)}
                  disabled={busyId === r.id}
                  className="btn-primary text-[11px] py-1.5 px-3 shrink-0"
                >
                  {busyId === r.id ? '…' : 'Generate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-2 text-[11px] leading-snug text-ink-400">
        No SMS provider is wired up in this demo, so these are written and
        stored — nothing is delivered to a patient.
      </p>

      {sent.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">
            Drafted ({sent.length})
          </div>
          {sent.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-brand-100 p-3 bg-brand-50/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-900">
                      {r.patient.name}
                    </span>
                    <span className="pill-brand text-[10px]">drafted</span>
                  </div>
                  <div className="text-xs text-ink-500 truncate">{r.reason}</div>
                  <div className="text-[11px] text-ink-400 mt-1">
                    Sent{' '}
                    {r.sent_at ? formatRelative(r.sent_at) : 'just now'} · model:{' '}
                    {r.model_used || 'featherless'}
                  </div>
                </div>
              </div>
              {r.message && (
                <div className="mt-2 text-xs text-ink-700 bg-white rounded-lg p-2 border border-ink-100 whitespace-pre-wrap">
                  {r.message}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
