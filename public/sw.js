const CACHE = 'scenario-shell-v1';
const ROOT = new URL('./', self.registration.scope);
const SHELL = [ROOT.href, new URL('manifest.webmanifest', ROOT).href, new URL('icon.svg', ROOT).href];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.includes('/_next/') && !url.pathname.includes('/_next/static/')) return;
  if (request.mode === 'navigate' && url.pathname.replace(/\/$/, '') === ROOT.pathname.replace(/\/$/, '')) {
    event.respondWith(fetch(request).then(response => { if (response.ok) void caches.open(CACHE).then(cache => cache.put(ROOT.href, response.clone())); return response; }).catch(async () => (await caches.match(ROOT.href)) || Response.error()));
    return;
  }
  if (['script','style','image','font'].includes(request.destination)) {
    event.respondWith(caches.match(request).then(cached => {
      const update = fetch(request).then(response => { if (response.ok) void caches.open(CACHE).then(cache => cache.put(request, response.clone())); return response; });
      return cached || update;
    }));
  }
});
