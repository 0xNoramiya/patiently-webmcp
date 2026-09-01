'use client';

import { cn } from '@/lib/utils';
import type { TicketStatus } from '@/lib/types';

type StepKey = 'arrived' | 'intake' | 'ready' | 'consult' | 'done';

const STEPS: { key: StepKey; label: string; hint: string }[] = [
  { key: 'arrived', label: 'Arrived', hint: 'Ticket issued' },
  { key: 'intake', label: 'Pre-visit chat', hint: 'Chat with Patiently' },
  { key: 'ready', label: 'Ready for doctor', hint: 'Story sent to clinician' },
  { key: 'consult', label: 'With doctor', hint: 'Inside the consult room' },
  { key: 'done', label: 'All done', hint: 'Visit complete' },
];

function stepIndex(status: TicketStatus, intakeComplete: boolean): number {
  switch (status) {
    case 'waiting':
      return intakeComplete ? 2 : 0;
    case 'in_intake':
      return 1;
    case 'intake_complete':
      return 2;
    case 'in_consultation':
      return 3;
    case 'done':
      return 4;
    case 'cancelled':
      return 0;
    default:
      return 0;
  }
}

export function JourneyStrip({
  status,
  intakeComplete,
}: {
  status: TicketStatus;
  intakeComplete: boolean;
}) {
  const current = stepIndex(status, intakeComplete);
  return (
    <ol className="grid grid-cols-5 gap-1 px-1">
      {STEPS.map((step, idx) => {
        const isDone = idx < current;
        const isCurrent = idx === current;
        return (
          <li
            key={step.key}
            className="flex flex-col items-center text-center min-w-0"
          >
            <div className="flex items-center w-full">
              <div
                className={cn(
                  'flex-1 h-0.5 mx-1',
                  idx === 0 ? 'opacity-0' : '',
                  isDone || isCurrent ? 'bg-brand-500' : 'bg-ink-200'
                )}
              />
              <div
                className={cn(
                  'w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold shrink-0 transition-colors',
                  isDone && 'bg-brand-600 text-white',
                  isCurrent && 'bg-brand-600 text-white step-glow',
                  !isDone && !isCurrent && 'bg-ink-100 text-ink-400'
                )}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {isDone ? '✓' : idx + 1}
              </div>
              <div
                className={cn(
                  'flex-1 h-0.5 mx-1',
                  idx === STEPS.length - 1 ? 'opacity-0' : '',
                  isDone ? 'bg-brand-500' : 'bg-ink-200'
                )}
              />
            </div>
            <div
              className={cn(
                'text-[10px] mt-1 font-medium leading-tight',
                isCurrent ? 'text-brand-700' : isDone ? 'text-ink-700' : 'text-ink-400'
              )}
            >
              {step.label}
            </div>
            <div
              className={cn(
                'text-[9px] leading-tight hidden sm:block',
                isCurrent ? 'text-brand-600' : 'text-ink-400'
              )}
            >
              {step.hint}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
