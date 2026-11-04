/* Car Songs — offline support. The version changes whenever the songs or the app change. */
const VERSION = "car-songs-ce76a516b9";
const ASSETS = [
  "./",
  "index.html",
  "songs.json",
  "fp.bin",
  "app.js",
  "fp-core.js",
  "fp-worker.js",
  "capture-worklet.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "fonts/fonts.css",
  "fonts/barlow-condensed-600.woff2",
  "fonts/barlow-condensed-700.woff2",
  "fonts/share-tech-mono-400.woff2"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(ASSETS.map((a) => new Request(a, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("car-songs-") && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(VERSION).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((hit) => {
        if (hit) return hit;
        if (req.mode === "navigate") return cache.match("index.html").then((page) => page || fetch(req));
        return fetch(req);
      })
    )
  );
});
