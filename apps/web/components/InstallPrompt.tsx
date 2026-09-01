'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const IOS_HINT_KEY = 'patiently:ios-install-dismissed';
const ANDROID_HINT_KEY = 'patiently:install-dismissed';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  return Boolean((window.navigator as any).standalone);
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function InstallPrompt({ className }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(false);
  const [showIosHint, setShowIosHint] = useState<boolean>(false);
  const [installing, setInstalling] = useState<boolean>(false);
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    setInstalled(isStandalone());

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    // iOS doesn't fire beforeinstallprompt — show a manual hint instead.
    if (isIos() && !isStandalone()) {
      const wasDismissed = localStorage.getItem(IOS_HINT_KEY) === '1';
      if (!wasDismissed) setShowIosHint(true);
    }

    if (localStorage.getItem(ANDROID_HINT_KEY) === '1') {
      setDismissed(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;
  if (dismissed && !showIosHint) return null;

  async function handleInstall() {
    if (!deferred) return;
    setInstalling(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    } finally {
      setInstalling(false);
    }
  }

  function handleDismissAndroid() {
    localStorage.setItem(ANDROID_HINT_KEY, '1');
    setDismissed(true);
    setDeferred(null);
  }

  function handleDismissIos() {
    localStorage.setItem(IOS_HINT_KEY, '1');
    setShowIosHint(false);
  }

  if (deferred) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-brand-200 bg-brand-50/70 px-4 py-3 flex items-center justify-between gap-3',
          className
        )}
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-brand-700">
            Install Patiently
          </div>
          <div className="text-xs text-ink-500 truncate">
            Keep your queue and chat one tap away — even if the browser closes.
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleDismissAndroid}
            className="text-[11px] text-ink-500 hover:text-ink-700 px-2 py-1"
          >
            Not now
          </button>
          <button
            onClick={handleInstall}
            disabled={installing}
            className="btn-primary text-xs py-1.5 px-3"
          >
            {installing ? 'Installing…' : 'Install'}
          </button>
        </div>
      </div>
    );
  }

  if (showIosHint) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-brand-200 bg-brand-50/70 px-4 py-3',
          className
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-brand-700">
              Add Patiently to your Home Screen
            </div>
            <div className="text-xs text-ink-700 mt-1">
              Tap{' '}
              <span
                aria-label="Share"
                className="inline-flex items-center justify-center w-5 h-5 rounded bg-white border border-ink-200 align-middle"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </span>
              {' '}then "Add to Home Screen". You'll get your ticket back in one tap and won't miss the doctor calling you in.
            </div>
          </div>
          <button
            onClick={handleDismissIos}
            className="text-[11px] text-ink-500 hover:text-ink-700 px-2 py-1 shrink-0"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return null;
}
