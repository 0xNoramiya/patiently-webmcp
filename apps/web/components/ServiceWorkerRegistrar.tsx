'use client';

import { useEffect } from 'react';

const IS_DEV = process.env.NODE_ENV !== 'production';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    // In dev mode the SW would happily cache stale chunks from `next dev`
    // and replay them across reloads — including stale UI like an old
    // password form on /dashboard. Be aggressive about cleanup:
    //   1. unregister any SW the browser still has from a previous session
    //   2. delete every cache it left behind
    // After this fires once, subsequent reloads are guaranteed-fresh.
    if (IS_DEV) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          if (regs.length === 0) return undefined;
          // eslint-disable-next-line no-console
          console.info(
            `[Patiently] dev: unregistering ${regs.length} stale service worker(s)`
          );
          return Promise.all(
            regs.map((r) => r.unregister().catch(() => false))
          );
        })
        .catch(() => {});
      if ('caches' in window) {
        caches
          .keys()
          .then((keys) =>
            Promise.all(keys.map((k) => caches.delete(k).catch(() => false)))
          )
          .catch(() => {});
      }
      return;
    }

    if (
      window.location.protocol !== 'https:' &&
      window.location.hostname !== 'localhost'
    ) {
      return;
    }
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* swallow — sw is best-effort */
      });
    };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
    return () => window.removeEventListener('load', onLoad);
  }, []);
  return null;
}
