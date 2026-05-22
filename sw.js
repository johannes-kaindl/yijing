// Service Worker — network-first für same-origin GET-Requests.
// Hält die App offline-fähig ohne Cache-Versionierung: online wird stets
// frisch geladen, der Cache dient als Offline-Reserve.
const CACHE = "yijing-runtime";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" ||
      new URL(req.url).origin !== self.location.origin) {
    return; // LLM-Server-Calls u.a. unangetastet durchreichen
  }
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
