// Hand-rolled service worker (ADR: no next-pwa on Next 16/Turbopack).
// Bump CACHE_VERSION on each release to purge old caches. Deliberately does NOT
// cache authed HTML (network-first + offline fallback only) so shared devices
// never serve one student's page to another. Never intercepts /api or auth.
const CACHE_VERSION = "asc-cache-v4";
const PRECACHE = ["/portal/offline", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never touch auth / API — must hit the network live.
  if (url.pathname.startsWith("/api/") || url.pathname.includes("/portal/auth")) return;

  // Immutable static assets: cache-first.
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static") ||
      url.pathname.startsWith("/assets") ||
      url.pathname === "/icon.png" ||
      url.pathname.startsWith("/icons/") ||
      url.pathname === "/manifest.webmanifest")
  ) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Navigations: network-first, fall back to the offline page when offline.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/portal/offline")));
  }
});
