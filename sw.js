// Service Worker — network-first für same-origin GET-Requests, der Cache dient nur
// als Offline-Reserve. CACHE trägt eine Versionsmarke: bei jedem Update fallen alte
// Caches weg, und skipWaiting + clients.claim sorgen dafür, dass der neue Worker
// sofort übernimmt (app.js lädt bei controllerchange einmal frisch nach). Das
// verhindert, dass WKWebView veraltete app.js/Daten festhält.
const CACHE = "yijing-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
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
