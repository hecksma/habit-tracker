// Service Worker: ein Hilfsprogramm, das der Browser im Hintergrund neben der App ausführt.
// Es fängt jede Anfrage der App ab (Seite, Bilder, Schriften) und kann sie aus einem
// Zwischenspeicher (Cache) beantworten, wenn kein Internet da ist.

// Name des Zwischenspeichers. Wenn du hier die Zahl erhöhst (v2, v3 ...),
// wird beim nächsten Besuch ein neuer Speicher angelegt und der alte gelöscht.
const CACHE = 'maximize-v1';

// Die Dateien, die die App zum Starten mindestens braucht.
const APP_FILES = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

// 1) Installation: beim ersten Besuch alle App-Dateien in den Cache legen.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting(); // neue Version sofort aktivieren, nicht erst nach dem Schließen der App
});

// 2) Aktivierung: alte Zwischenspeicher aufräumen.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// 3) Jede Anfrage: erst das Internet versuchen ("network first").
// So bekommst du nach einem Update immer die neueste Version, sobald du online bist.
// Nur wenn das Internet fehlt, wird die zuletzt gespeicherte Kopie aus dem Cache genommen.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone(); // eine Kopie für den Cache, das Original geht an die App
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        })
      )
  );
});
