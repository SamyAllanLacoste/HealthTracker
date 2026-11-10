/* Health Tracker — service worker : cache applicatif, fonctionnement hors ligne */
const CACHE = "health-tracker-v1.9.0";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-180.png",
  "./icon-maskable-512.png"
];

/* moteur OCR (Tesseract.js) téléchargé à la demande depuis ces CDN, puis conservé
   dans un cache séparé qui SURVIT aux mises à jour de l'app : le scan reste
   disponible hors ligne sans re-télécharger le moteur à chaque nouvelle version */
const OCR_CACHE = "ht-ocr-engine-v1";
const OCR_HOSTS = ["cdn.jsdelivr.net", "tessdata.projectnaptha.com", "unpkg.com", "cdnjs.cloudflare.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== OCR_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  /* ressources du moteur OCR (scripts, wasm, données de langue) : cache d'abord,
     réseau en repli ; on accepte les réponses opaques (cross-origin, no-cors) */
  if (OCR_HOSTS.indexOf(url.hostname) !== -1) {
    e.respondWith(
      caches.open(OCR_CACHE).then(c => c.match(req).then(hit => {
        if (hit) return hit;
        return fetch(req).then(res => {
          if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone());
          return res;
        }).catch(() => hit || Response.error());
      }))
    );
    return;
  }

  if (url.origin !== location.origin) return;

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
