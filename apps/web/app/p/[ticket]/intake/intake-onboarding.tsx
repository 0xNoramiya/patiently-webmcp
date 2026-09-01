'use client';

import { useEffect, useState } from 'react';

import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';

type Lang = 'en' | 'id';

const STORAGE_KEY = 'patiently:intake-onboarding-seen';

const COPY: Record<
  Lang,
  {
    eyebrow: string;
    title: string;
    subtitle: string;
    steps: { title: string; body: string }[];
    cta: string;
    privacy: string;
  }
> = {
  en: {
    eyebrow: 'Before you start',
    title: 'A quick chat with Patiently',
    subtitle:
      "Three things to know — then we'll get going.",
    steps: [
      {
        title: 'Quick chat · 2–3 minutes',
        body: "I'll ask short questions in plain language. Type or tap the mic to speak — whatever's easier.",
      },
      {
        title: 'Goes straight to your doctor',
        body: "Your answers are summarised onto your doctor's screen so you don't have to repeat yourself.",
      },
      {
        title: "Forgot something? Add it later",
        body: "Once we're done you can review what we noted and add anything that slipped your mind.",
      },
    ],
    cta: "Got it, let's start",
    privacy:
      "I'm not a doctor — I just gather information. The physician decides everything clinical.",
  },
  id: {
    eyebrow: 'Sebelum mulai',
    title: 'Obrolan singkat dengan Patiently',
    subtitle: 'Tiga hal yang perlu diketahui — lalu kita mulai ya.',
    steps: [
      {
        title: 'Obrolan singkat · 2–3 menit',
        body: 'Saya akan tanya beberapa hal dengan bahasa sederhana. Ketik atau tekan ikon mic untuk bicara — mana yang lebih mudah.',
      },
      {
        title: 'Langsung sampai ke dokter',
        body: 'Jawaban Anda dirangkum dan masuk ke layar dokter — Anda tidak perlu mengulang cerita.',
      },
      {
        title: 'Ada yang terlupa? Bisa ditambah',
        body: 'Setelah selesai, Anda bisa cek apa yang sudah dicatat dan tambahkan yang kelupaan.',
      },
    ],
    cta: 'Mengerti, mulai',
    privacy:
      'Saya bukan dokter — saya hanya kumpulkan informasi. Semua keputusan klinis tetap di dokter.',
  },
};

export function shouldShowOnboarding(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) !== '1';
  } catch {
    return false;
  }
}

export function markOnboardingSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignore quota errors */
  }
}

export function IntakeOnboarding({
  language,
  onDismiss,
}: {
  language: Lang;
  onDismiss: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const copy = COPY[language] || COPY.en;

  function handleStart() {
    markOnboardingSeen();
    onDismiss();
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-5 pt-5 pb-3 border-b border-ink-100 bg-white">
        <Logo />
      </header>

      <section
        className={cn(
          'flex-1 overflow-y-auto px-5 py-6 transition-opacity',
          mounted ? 'opacity-100' : 'opacity-0'
        )}
      >
        <div className="max-w-xl mx-auto">
          <span className="pill-brand mb-3 inline-flex text-[10px] uppercase tracking-wider">
            {copy.eyebrow}
          </span>
          <h1 className="font-display text-2xl font-bold text-ink-900 leading-tight">
            {copy.title}
          </h1>
          <p className="text-sm text-ink-500 mt-1.5">{copy.subtitle}</p>

          <ol className="mt-6 space-y-3">
            {copy.steps.map((step, idx) => (
              <li
                key={idx}
                className="card-padded slide-fade-up flex gap-3 items-start"
                style={{ animationDelay: `${idx * 80}ms` }}
              >
                <span
                  className="shrink-0 w-9 h-9 rounded-full bg-brand-600 text-white grid place-items-center font-display font-bold"
                  aria-hidden
                >
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <div className="font-display font-semibold text-ink-900 text-base">
                    {step.title}
                  </div>
                  <p className="text-sm text-ink-500 mt-1 leading-snug">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <p className="text-[11px] text-ink-400 italic text-center mt-5">
            {copy.privacy}
          </p>
        </div>
      </section>

      <div className="px-5 py-4 border-t border-ink-100 bg-white sticky bottom-0">
        <button
          onClick={handleStart}
          className="btn-primary w-full text-base"
          autoFocus
        >
          {copy.cta}
        </button>
      </div>
    </main>
  );
}
