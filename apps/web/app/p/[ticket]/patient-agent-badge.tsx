'use client';

/**
 * A small, quiet marker that an agent is connected and what it just did.
 *
 * The patient surface is a phone screen in a waiting room, so this stays out of
 * the way: it only appears once WebMCP is actually present, and it collapses to
 * a single line. The clinician dashboard gets the full activity panel instead.
 */
import { useAgentSession } from '@/lib/webmcp/agent-session';
import { cn } from '@/lib/utils';

export function PatientAgentBadge() {
  const { supported, toolCount, events } = useAgentSession();
  if (!supported) return null;

  const last = events[events.length - 1];

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div
        className={cn(
          'pointer-events-auto flex max-w-[92vw] items-center gap-2 rounded-full border border-brand-200 bg-white/95 px-3.5 py-2 shadow-soft backdrop-blur',
          'text-[11px] font-medium text-ink-600'
        )}
      >
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-600" />
        </span>
        <span className="truncate">
          {last ? last.label : `Agent connected · ${toolCount} tools`}
        </span>
      </div>
    </div>
  );
}
