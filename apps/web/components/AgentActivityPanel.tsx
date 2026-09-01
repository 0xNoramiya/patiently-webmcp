'use client';

/**
 * The human half of the collaboration.
 *
 * Two pieces of UI, both about keeping the person in the loop rather than
 * behind it:
 *
 *   AgentApprovalDialog — the blocking confirmation an agent's write is waiting
 *   on. The agent's `execute` is genuinely parked on this promise, so this is
 *   not a notification about something that already happened; it is the
 *   decision point itself.
 *
 *   AgentActivityPanel — a live tape of every tool call, so the clinician can
 *   watch what the agent is doing while it does it.
 */
import { useEffect, useRef } from 'react';

import { useAgentSession, type AgentEventStatus } from '@/lib/webmcp/agent-session';
import { cn } from '@/lib/utils';

const STATUS_DOT: Record<AgentEventStatus, string> = {
  running: 'bg-brand-400 animate-pulse',
  ok: 'bg-brand-600',
  error: 'bg-alert-500',
  declined: 'bg-ink-300',
};

const STATUS_LABEL: Record<AgentEventStatus, string> = {
  running: 'running',
  ok: 'done',
  error: 'failed',
  declined: 'declined',
};

export function AgentApprovalDialog() {
  const { pending, resolvePending } = useAgentSession();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (pending) confirmRef.current?.focus();
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resolvePending(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, resolvePending]);

  if (!pending) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-approval-title"
    >
      <div className="card w-full max-w-lg overflow-hidden">
        <div
          className={cn(
            'px-5 py-3 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase',
            pending.danger
              ? 'bg-alert-50 text-alert-700'
              : 'bg-brand-50 text-brand-700'
          )}
        >
          <span className="relative flex h-2 w-2">
            <span
              className={cn(
                'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
                pending.danger ? 'bg-alert-500' : 'bg-brand-500'
              )}
            />
            <span
              className={cn(
                'relative inline-flex rounded-full h-2 w-2',
                pending.danger ? 'bg-alert-600' : 'bg-brand-600'
              )}
            />
          </span>
          Agent is waiting for you
        </div>

        <div className="p-5">
          <h2
            id="agent-approval-title"
            className="font-display text-lg font-bold text-ink-900"
          >
            {pending.title}
          </h2>
          <p className="mt-1 text-sm text-ink-500">{pending.summary}</p>

          {pending.lines && pending.lines.length > 0 && (
            <ul className="mt-4 space-y-1.5 rounded-2xl bg-ink-50 p-4 text-sm text-ink-700">
              {pending.lines.map((line, i) => (
                <li
                  key={i}
                  className={cn(
                    'leading-snug',
                    line.startsWith('⚠') && 'font-semibold text-alert-700'
                  )}
                >
                  {line}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => resolvePending(false)}
            >
              Decline
            </button>
            <button
              ref={confirmRef}
              type="button"
              className={pending.danger ? 'btn-danger' : 'btn-primary'}
              onClick={() => resolvePending(true)}
            >
              {pending.confirmLabel ?? 'Confirm'}
            </button>
          </div>

          <p className="mt-3 text-[11px] leading-snug text-ink-400">
            The agent cannot complete this step on its own. Nothing is written
            unless you confirm.
          </p>
        </div>
      </div>
    </div>
  );
}

export function AgentActivityPanel({ className }: { className?: string }) {
  const { supported, toolCount, events } = useAgentSession();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events]);

  return (
    <section className={cn('p-5', className)} aria-label="Agent activity">
      <header className="flex items-center justify-between gap-3">
        <h2 className="font-display text-sm font-bold text-ink-900">
          Agent activity
        </h2>
        <span className={supported ? 'pill-brand' : 'pill-ink'}>
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              supported ? 'bg-brand-600' : 'bg-ink-400'
            )}
          />
          {supported ? `${toolCount} tools live` : 'WebMCP not detected'}
        </span>
      </header>

      {!supported && (
        <p className="mt-3 text-xs leading-relaxed text-ink-500">
          Open this page in ChatGPT&rsquo;s in-app browser, or in Chrome 149+
          with <code className="rounded bg-ink-100 px-1">chrome://flags/#enable-webmcp-testing</code>{' '}
          enabled, and this clinic&rsquo;s tools become available to your agent.
        </p>
      )}

      {supported && events.length === 0 && (
        <p className="mt-3 text-xs leading-relaxed text-ink-500">
          Ready. Ask your agent something like{' '}
          <em>&ldquo;who on the floor has a red flag?&rdquo;</em> and its work
          shows up here as it happens.
        </p>
      )}

      {events.length > 0 && (
        <div
          ref={scrollRef}
          className="scroll-thin mt-3 max-h-64 space-y-2 overflow-y-auto pr-1"
        >
          {events.map((e) => (
            <div key={e.id} className="flex items-start gap-2.5 text-xs">
              <span
                className={cn(
                  'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                  STATUS_DOT[e.status]
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink-700">{e.label}</p>
                <p className="text-[11px] text-ink-400">
                  <code>{e.tool}</code> · {STATUS_LABEL[e.status]}
                  {e.detail ? ` · ${e.detail}` : ''}
                </p>
              </div>
              <time className="shrink-0 text-[11px] tabular-nums text-ink-300">
                {new Date(e.at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </time>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
