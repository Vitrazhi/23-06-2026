/* Витражист — service worker.
   Задачи: (1) приложение можно установить на телефон, (2) оно открывается офлайн,
   (3) обновления доезжают до пользователя, а не залипают в кэше.
   Стратегия: HTML — «сеть сначала» (чтобы новая версия приходила сразу),
   картинки/иконки — «кэш сначала» (быстро и работает офлайн). */

const VERSION = 'v1';
const CORE_CACHE = 'vitrazh-core-' + VERSION;   // само приложение
const ASSET_CACHE = 'vitrazh-assets-' + VERSION; // картинки витражей, шрифты

// Минимум, необходимый для запуска офлайн
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CORE_CACHE)
      .then(c => c.addAll(CORE).catch(() => {})) // не валим установку, если чего-то нет
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CORE_CACHE && k !== ASSET_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isHTML = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');

  // HTML: сеть сначала → свежая версия; офлайн — из кэша
  if (isHTML) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CORE_CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Картинки витражей и иконки: кэш сначала
  const isAsset = sameOrigin && /\.(png|jpe?g|webp|svg|ico)$/i.test(url.pathname);
  const isFont  = /fonts\.(googleapis|gstatic)\.com/.test(url.host);
  if (isAsset || isFont) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(ASSET_CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit))
    );
    return;
  }

  // Остальное: сеть, с откатом в кэш
  e.respondWith(fetch(req).catch(() => caches.match(req)));
});
