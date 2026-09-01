// Patiently — minimal service worker.
// Strategy:
//   * /api/*  → network only (queue state must be fresh)
//   * /_next/static/* → cache-first (immutable hashed assets)
//   * other GET pages → network-first with cache fallback so a backgrounded
//     tab still shows the last queue snapshot if Wi-Fi drops in the waiting
//     room.
const CACHE = 'patiently-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  // Never intercept API traffic — queue state must come from the server.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/data/') ||
    url.pathname.includes('/stream')
  ) {
    return;
  }

  // Cache-first for hashed static assets.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetchAndStash(req))
    );
    return;
  }

  // Network-first for everything else (HTML pages, icons, manifest).
  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const clone = fresh.clone();
          caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
        }
        return fresh;
      } catch (_e) {
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response(
          '<h1>Offline</h1><p>You are offline and this page was not cached yet.</p>',
          { status: 503, headers: { 'Content-Type': 'text/html' } }
        );
      }
    })()
  );
});

async function fetchAndStash(req) {
  const res = await fetch(req);
  if (res && res.ok) {
    const clone = res.clone();
    caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
  }
  return res;
}
