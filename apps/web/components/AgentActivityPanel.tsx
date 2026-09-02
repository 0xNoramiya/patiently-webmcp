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

/**
 * Persistent WebMCP status, shown in the clinic header.
 *
 * This lives at the top of the page rather than beside the activity log
 * because it answers the first question anyone opening the app has — is my
 * agent connected to this clinic at all? Burying that under the fold made the
 * product's whole premise the least visible thing on screen.
 */
export function AgentStatusPill({ className }: { className?: string }) {
  const { supported, toolCount } = useAgentSession();

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
        supported
          ? 'border-brand-200 bg-brand-50 text-brand-700'
          : 'border-ink-200 bg-ink-50 text-ink-500',
        className
      )}
      title={
        supported
          ? `${toolCount} WebMCP tools are registered on this page`
          : 'Open in ChatGPT\u2019s in-app browser, or Chrome 149+ with chrome://flags/#enable-webmcp-testing'
      }
    >
      {supported ? (
        <span className="relative flex h-1.5 w-1.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-600" />
        </span>
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-ink-300" aria-hidden />
      )}
      {supported ? `${toolCount} agent tools live` : 'WebMCP not detected'}
    </span>
  );
}

export function AgentApprovalDialog() {
  const { pending, queuedBehind, resolvePending } = useAgentSession();
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
          {queuedBehind > 0 && (
            <span className="ml-auto font-medium normal-case tracking-normal opacity-80">
              {queuedBehind} more {queuedBehind === 1 ? 'request' : 'requests'} behind this
            </span>
          )}
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
            {queuedBehind > 0 && ' The next request appears once you answer this one.'}
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
    <section className={cn('flex flex-col p-5', className)} aria-label="Your agent">
      <header>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.08em] text-ink-900">
            Your agent
          </h2>
          {supported && (
            <span className="text-[11px] tabular-nums text-ink-400">
              {toolCount} tools
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-ink-400">
          Everything your agent does to this clinic, as it happens.
        </p>
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
          className="scroll-thin mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
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
