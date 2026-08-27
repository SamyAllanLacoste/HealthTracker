/* Health Tracker — service worker : cache applicatif, fonctionnement hors ligne */
const CACHE = "health-tracker-v1.5.0";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-180.png",
  "./icon-maskable-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* réseau d'abord pour le document (mises à jour), cache d'abord pour le reste */
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  /* on ne met en cache qu'une réponse valide : une page d'erreur ou un 404 servi
     indéfiniment serait pire que pas de cache du tout */
  const store = (request, res) => {
    if (!res || !res.ok || res.type === "opaque") return res;
    const copy = res.clone();
    e.waitUntil(caches.open(CACHE).then(c => c.put(request, copy)));
    return res;
  };

  if (req.mode === "navigate" || req.destination === "document") {
    e.respondWith(
      fetch(req)
        .then(res => store(req, res))
        .catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
    );
    return;
  }
  /* cache d'abord, mais rafraîchissement en tâche de fond pour ne pas figer un asset */
  e.respondWith(
    caches.match(req).then(hit => {
      const network = fetch(req).then(res => store(req, res)).catch(() => null);
      if (hit) { e.waitUntil(network); return hit; }
      return network.then(res => res || Response.error());
    })
  );
});
