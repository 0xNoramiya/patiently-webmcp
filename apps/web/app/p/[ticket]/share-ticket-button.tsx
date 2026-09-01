'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

interface Props {
  ticketNumber: string;
  patientName: string;
  className?: string;
}

type Stage = 'idle' | 'sharing' | 'shared' | 'copied' | 'unsupported';

function buildShareData(ticketNumber: string, patientName: string) {
  const url =
    typeof window !== 'undefined' ? window.location.href : `/p/`;
  const firstName = patientName.split(' ')[0] || 'a friend';
  return {
    url,
    title: `Patiently · queue update for ${firstName}`,
    text:
      `Hi — I'm at the clinic. You can follow my queue position live ` +
      `(ticket ${ticketNumber}) here:`,
  };
}

export function ShareTicketButton({
  ticketNumber,
  patientName,
  className,
}: Props) {
  const [stage, setStage] = useState<Stage>('idle');
  const [supportsShare, setSupportsShare] = useState<boolean>(false);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setSupportsShare(typeof (navigator as any).share === 'function');
  }, []);

  // Auto-reset transient confirmation states
  useEffect(() => {
    if (stage === 'shared' || stage === 'copied') {
      const t = setTimeout(() => setStage('idle'), 2600);
      return () => clearTimeout(t);
    }
  }, [stage]);

  async function handleClick() {
    const data = buildShareData(ticketNumber, patientName);
    if (supportsShare) {
      setStage('sharing');
      try {
        await (navigator as any).share(data);
        setStage('shared');
      } catch (err) {
        // User dismissal isn't an error worth flagging
        const name =
          err && typeof err === 'object' && 'name' in err
            ? (err as { name: string }).name
            : '';
        if (name === 'AbortError') {
          setStage('idle');
          return;
        }
        // Fall through to clipboard fallback
        await fallbackCopy(data.url);
      }
      return;
    }
    await fallbackCopy(data.url);
  }

  async function fallbackCopy(url: string) {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setStage('unsupported');
      setTimeout(() => setStage('idle'), 2600);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setStage('copied');
    } catch {
      setStage('unsupported');
      setTimeout(() => setStage('idle'), 2600);
    }
  }

  const label = (() => {
    if (stage === 'shared') return 'Sent';
    if (stage === 'copied') return 'Link copied';
    if (stage === 'unsupported') return 'Copy link manually';
    if (stage === 'sharing') return 'Opening…';
    return supportsShare ? 'Share' : 'Copy link';
  })();

  const tone = stage === 'shared' || stage === 'copied';

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Share this queue page with a family member or caregiver"
      title="Got family waiting? Share this page so they can follow along."
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors border',
        tone
          ? 'bg-brand-100 text-brand-700 border-brand-200'
          : 'bg-white text-ink-700 border-ink-200 hover:bg-ink-50',
        className
      )}
    >
      {tone ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
          <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
        </svg>
      )}
      <span>{label}</span>
    </button>
  );
}
