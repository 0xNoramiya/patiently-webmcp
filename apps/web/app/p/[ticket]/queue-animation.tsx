'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * Tweens an integer between renders. When `value` changes, the displayed
 * number animates from the previous to the new value over `durationMs`
 * using a cubic ease-out. Re-mounts cleanly on each change.
 */
export function TweenedNumber({
  value,
  durationMs = 600,
  className,
}: {
  value: number;
  durationMs?: number;
  className?: string;
}) {
  const [displayed, setDisplayed] = useState<number>(value);
  const fromRef = useRef<number>(value);

  useEffect(() => {
    if (displayed === value) return;
    fromRef.current = displayed;
    const start = performance.now();
    const target = value;
    let raf = 0;
    const step = (t: number) => {
      const elapsed = t - start;
      const k = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - k, 3);
      const next = fromRef.current + (target - fromRef.current) * eased;
      setDisplayed(Math.round(next));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // displayed intentionally NOT in deps — we only want this to retarget on real value changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return <span className={cn('tabular-nums', className)}>{displayed}</span>;
}

/**
 * Returns true for a short window each time `value` strictly decreases —
 * useful for retriggering a "bounce" CSS animation when the queue moves up.
 */
export function useFlashOnDecrease(value: number, ms = 480): boolean {
  const prev = useRef<number>(value);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (value < prev.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), ms);
      prev.current = value;
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value, ms]);

  return flash;
}

/**
 * Returns a stable function that plays a soft two-note chime using the
 * Web Audio API. No audio file needed. Safe to call from useEffect.
 *
 * The first call lazily creates an AudioContext. Browsers gate playback
 * behind a user gesture in some contexts; we resume() before playing.
 */
export function useChime() {
  const ctxRef = useRef<AudioContext | null>(null);

  return () => {
    if (typeof window === 'undefined') return;
    const Ctor =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    if (!ctxRef.current) ctxRef.current = new Ctor();
    const ctx = ctxRef.current!;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;

    const tone = (freq: number, start: number, duration: number, peak = 0.22) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.start(start);
      osc.stop(start + duration + 0.05);
    };

    // Soft major-third chime (C5 → E5), 600ms total.
    tone(523.25, now, 0.4);
    tone(659.25, now + 0.18, 0.5);
  };
}
