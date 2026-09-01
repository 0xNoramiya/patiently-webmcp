'use client';

import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api';
import type { ConsultationNoteOut } from '@/lib/types';
import { cn } from '@/lib/utils';

const SECTIONS: { key: keyof ConsultationNoteOut; label: string }[] = [
  { key: 'subjective', label: 'Subjective' },
  { key: 'objective', label: 'Objective' },
  { key: 'assessment', label: 'Assessment' },
  { key: 'plan', label: 'Plan' },
];

export function NotesWidget({
  ticketId,
  adminPassword,
}: {
  ticketId: string;
  adminPassword: string;
}) {
  const [note, setNote] = useState<ConsultationNoteOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const n = await api.getNote(ticketId, adminPassword);
      setNote(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load note');
    }
  }, [ticketId, adminPassword]);

  useEffect(() => {
    setNote(null);
    setError(null);
    refresh().catch(() => {});
  }, [ticketId, refresh]);

  async function handleDraft() {
    setBusy(true);
    setError(null);
    try {
      const n = await api.draftNote(ticketId, adminPassword);
      setNote(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Drafting failed');
    } finally {
      setBusy(false);
    }
  }

  function handleCopy() {
    if (!note) return;
    const text = SECTIONS.map((s) => {
      const body = (note[s.key] as string | null) || '';
      return `${s.label}:\n${body}`;
    }).join('\n\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  const isDone = note?.status === 'done';

  return (
    <div className="card-padded">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-display font-semibold text-ink-900 text-sm uppercase tracking-wide">
            SOAP note
          </h3>
          <div className="text-[11px] text-ink-400 mt-0.5">
            Drafted by Featherless from intake summary + transcript
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDone && (
            <button
              onClick={handleCopy}
              className="btn-ghost text-[11px] py-1.5 px-3"
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          )}
          <button
            onClick={handleDraft}
            disabled={busy}
            className="btn-primary text-xs py-2 px-4"
          >
            {busy
              ? 'Drafting…'
              : note
                ? 'Redraft'
                : 'Draft note'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-alert-700 bg-alert-50 border border-alert-100 rounded-lg px-3 py-2 mb-3">
          {error}
        </div>
      )}

      {!note && !busy && !error && (
        <div className="text-xs text-ink-400 italic">
          Click <span className="font-semibold">Draft note</span> after the consultation to
          generate a SOAP note pulling from the pre-visit summary and the
          consultation transcript (when available).
        </div>
      )}

      {busy && (
        <div className="text-sm text-ink-500 flex items-center gap-2">
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
          <span>Featherless is drafting the note…</span>
        </div>
      )}

      {note && (
        <div>
          <div className="flex items-center justify-between text-xs mb-3">
            <span
              className={cn(
                'pill text-[10px]',
                note.status === 'done' && 'bg-brand-100 text-brand-700',
                note.status === 'drafting' && 'bg-warn-100 text-warn-600',
                note.status === 'failed' && 'bg-alert-100 text-alert-700'
              )}
            >
              {note.status}
            </span>
            {note.model_used && (
              <span className="text-ink-400">via {note.model_used}</span>
            )}
          </div>

          {note.status === 'failed' && (
            <div className="text-sm text-alert-700 bg-alert-50 border border-alert-100 rounded-xl p-3">
              {note.error || 'Drafting failed'}
            </div>
          )}

          {isDone && (
            <div className="space-y-3">
              {SECTIONS.map((s) => {
                const body = (note[s.key] as string | null) || '';
                if (!body) return null;
                return (
                  <div key={s.key as string}>
                    <div className="text-[11px] uppercase tracking-wider text-ink-400 font-bold">
                      {s.label}
                    </div>
                    <p className="text-sm text-ink-700 mt-0.5 whitespace-pre-wrap">
                      {body}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
