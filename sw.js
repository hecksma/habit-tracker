// Service Worker: ein Hilfsprogramm, das der Browser im Hintergrund neben der App ausführt.
// Es fängt jede Anfrage der App ab (Seite, Skripte, Bilder, Schriften) und kann sie aus einem
// Zwischenspeicher (Cache) beantworten, wenn kein oder nur schlechtes Internet da ist.

// Name des Zwischenspeichers. Bei einer neuen Veröffentlichung die Zahl erhöhen (v3, v4 ...),
// dann wird beim nächsten Besuch ein neuer Speicher angelegt und der alte gelöscht.
const CACHE = 'maximize-v9';

// Alle Dateien, die die App zum Starten braucht. Kommt eine neue Datei dazu, hier eintragen.
const APP_FILES = [
  './', './index.html', './manifest.json', './icon-192.png', './icon-512.png',
  './css/style.css',
  './js/core.js', './js/habits.js', './js/settings.js', './js/stats.js',
  './js/gym-data.js', './js/gym-view.js', './js/gym-workout.js',
  './js/backup.js', './js/nav.js', './js/main.js'
];

// So lange warten wir auf das Netz, bevor wir die gespeicherte Kopie nehmen.
// Wichtig bei schwachem Empfang (z. B. im Gym): Die App startet trotzdem zügig.
const NETWORK_TIMEOUT_MS = 3500;

// 1) Installation: beim ersten Besuch alle App-Dateien in den Cache legen.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_FILES.map((u) => new Request(u, { cache: 'reload' })))));
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

// Nur brauchbare Antworten werden gespeichert (keine Fehlerseiten). "opaque" sind Antworten
// von fremden Servern (die Schriften), sie lassen sich nicht prüfen, sind aber nötig.
const cacheable = (res) => res && (res.ok || res.type === 'opaque');

// 3) Jede Anfrage: erst das Internet versuchen ("network first"), mit Zeitlimit.
// So bekommst du nach einem Update immer die neueste Version, sobald du online bist.
// Fehlt das Netz oder ist es zu langsam, wird die zuletzt gespeicherte Kopie genommen.
async function networkFirst(request, event) {
  const cached = await caches.match(request, { ignoreSearch: true });

  const network = fetch(request, { cache: 'no-cache' }).then((res) => {
    if (cacheable(res)) {
      const copy = res.clone(); // eine Kopie für den Cache, das Original geht an die App
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return res;
  });

  if (!cached) {
    try { return await network; }
    catch (e) {
      if (request.mode === 'navigate') {
        const page = await caches.match('./index.html');
        if (page) return page;
      }
      return Response.error();
    }
  }

  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
  try {
    const res = await Promise.race([network, timeout]);
    if (cacheable(res)) return res;
  } catch (e) { /* kein Netz: weiter zur gespeicherten Kopie */ }
  // Das Laden im Hintergrund zu Ende führen, damit der Cache beim nächsten Mal aktuell ist
  event.waitUntil(network.catch(() => {}));
  return cached;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !/^https?:/.test(req.url)) return;
  event.respondWith(networkFirst(req, event));
});
