'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

type TextSize = 'normal' | 'lg' | 'xl';

interface A11ySettings {
  textSize: TextSize;
  readableFont: boolean;
  reduceMotion: boolean;
}

const STORAGE_KEY = 'patiently:a11y';

const DEFAULTS: A11ySettings = {
  textSize: 'normal',
  readableFont: false,
  reduceMotion: false,
};

function loadSettings(): A11ySettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<A11ySettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function applyToDocument(s: A11ySettings) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('a11y-text-lg', s.textSize === 'lg');
  root.classList.toggle('a11y-text-xl', s.textSize === 'xl');
  root.classList.toggle('a11y-font-readable', s.readableFont);
  root.classList.toggle('a11y-reduce-motion', s.reduceMotion);
}

export function AccessibilityToggle() {
  const [settings, setSettings] = useState<A11ySettings>(DEFAULTS);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Hydrate from localStorage on mount and apply to document
  useEffect(() => {
    const initial = loadSettings();
    setSettings(initial);
    applyToDocument(initial);
    setMounted(true);
  }, []);

  // Re-apply + persist on change
  useEffect(() => {
    if (!mounted) return;
    applyToDocument(settings);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore quota errors */
    }
  }, [settings, mounted]);

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const reset = useCallback(() => setSettings(DEFAULTS), []);
  const anyOn =
    settings.textSize !== 'normal' ||
    settings.readableFont ||
    settings.reduceMotion;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Accessibility settings"
          className="absolute bottom-14 right-0 w-72 card-padded shadow-card slide-fade-up"
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-display font-semibold text-ink-900 text-sm">
                Accessibility
              </h3>
              <p className="text-[11px] text-ink-400">
                These apply only to your device.
              </p>
            </div>
            {anyOn && (
              <button
                onClick={reset}
                className="text-[11px] text-brand-700 hover:underline"
              >
                Reset
              </button>
            )}
          </div>

          <div className="mb-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-500 font-bold mb-1.5">
              Text size
            </div>
            <div className="grid grid-cols-3 gap-1">
              {([
                { v: 'normal', label: 'A', sz: 'text-sm' },
                { v: 'lg', label: 'A', sz: 'text-base' },
                { v: 'xl', label: 'A', sz: 'text-lg' },
              ] as { v: TextSize; label: string; sz: string }[]).map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setSettings((s) => ({ ...s, textSize: opt.v }))}
                  aria-pressed={settings.textSize === opt.v}
                  className={cn(
                    'rounded-xl border py-2 font-bold transition-colors',
                    opt.sz,
                    settings.textSize === opt.v
                      ? 'border-brand-600 bg-brand-50 text-brand-700 ring-2 ring-brand-200'
                      : 'border-ink-200 bg-white hover:bg-ink-50 text-ink-700'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <ToggleRow
            label="Easy-to-read font"
            hint="Switches to Lexend, designed for reading proficiency."
            checked={settings.readableFont}
            onChange={(v) =>
              setSettings((s) => ({ ...s, readableFont: v }))
            }
          />

          <ToggleRow
            label="Reduce motion"
            hint="Stills animations: pulses, glows, typing dots."
            checked={settings.reduceMotion}
            onChange={(v) =>
              setSettings((s) => ({ ...s, reduceMotion: v }))
            }
          />
        </div>
      )}

      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Close accessibility menu' : 'Open accessibility menu'}
        title="Accessibility"
        className={cn(
          'relative w-12 h-12 rounded-full shadow-card grid place-items-center transition-all',
          anyOn
            ? 'bg-brand-600 text-white hover:bg-brand-700'
            : 'bg-white text-brand-700 border border-ink-200 hover:bg-brand-50'
        )}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="6.8" r="1.2" fill="currentColor" />
          <path d="M8 10h8M12 10v9M9 19l3-5 3 5" />
        </svg>
        {anyOn && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-brand-400 border-2 border-white"
          />
        )}
      </button>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 py-2 cursor-pointer">
      <span className="min-w-0">
        <span className="text-sm font-medium text-ink-900">{label}</span>
        {hint && <span className="block text-[11px] text-ink-500">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative shrink-0 w-10 h-6 rounded-full transition-colors',
          checked ? 'bg-brand-600' : 'bg-ink-200'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0'
          )}
        />
      </button>
    </label>
  );
}
