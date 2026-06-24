/* Makeup Studio — Service Worker
   - HTML/điều hướng & tài nguyên same-origin: NETWORK-FIRST → luôn lấy bản mới khi online, offline dùng cache.
   - Thư viện tĩnh (Chart.js CDN, Google Fonts): CACHE-FIRST + cập nhật ngầm.
   - Firebase realtime/auth: KHÔNG đụng tới (để kết nối real-time hoạt động đúng). */
const CACHE_VER = 'makeup-v1';
const SHELL = ['./', './index.html', './styles.css', './app.js', './manifest.json', './icon.svg', './icon-maskable.svg'];
const CDN = /^(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|www\.gstatic\.com)$/i;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VER)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VER).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  const sameOrigin = (url.origin === self.location.origin);
  if (!sameOrigin && !CDN.test(url.hostname)) return;

  const accept = req.headers.get('accept') || '';
  const isNav = (req.mode === 'navigate' || accept.includes('text/html'));
  if (sameOrigin) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const cp = res.clone(), cpNav = isNav ? res.clone() : null;
          caches.open(CACHE_VER).then(c => { c.put(req, cp); if (cpNav) c.put('./', cpNav); }).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(r => r || (isNav ? caches.match('./') : undefined)))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          const cp = res.clone();
          caches.open(CACHE_VER).then(c => c.put(req, cp)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
