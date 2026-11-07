// Service worker: permite instalar la app y abrirla rápido.
// Las notas siempre se piden en línea (nunca se guardan en caché).
const CACHE = 'arrayan-v1';
const SHELL = [
  '/', '/index.html', '/css/app.css', '/manifest.webmanifest', '/icons/icon.svg',
  '/js/app.js', '/js/api.js', '/js/ui.js', '/js/rut.js',
  '/js/views/home.js', '/js/views/courses.js', '/js/views/gradebook.js', '/js/views/students.js',
  '/js/views/users.js', '/js/views/report.js', '/js/views/announcements.js', '/js/views/upcoming.js',
  '/js/views/settings.js', '/js/views/profile.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Red primero, caché como respaldo sin conexión
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html'))),
  );
});
