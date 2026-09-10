/* Dec's Tracker — offline cache. Bump V whenever index.html changes. */
const V = 'decs-tracker-v12';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
const NET_TIMEOUT = 2500;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    // the app used to be "Dec's Stuff", so sweep up caches under the old name too
    .then(ks => Promise.all(ks.filter(k => k !== V && /^decs-(stuff|tracker)-v/.test(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* The page itself is network-first with a short timeout, so a new version lands
   as soon as you open the app on signal, and the cached copy answers instantly
   when there's none. Everything else is cache-first and refreshed in the
   background — icons and the manifest never need to be fresh. */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url; try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  e.respondWith(isPage ? page(req) : asset(req));
});

const timed = p => new Promise(res => {
  const t = setTimeout(() => res(null), NET_TIMEOUT);
  p.then(r => { clearTimeout(t); res(r); }, () => { clearTimeout(t); res(null); });
});
async function page(req) {
  const fresh = await timed(fetch(req));
  if (fresh && fresh.ok) { (await caches.open(V)).put(req, fresh.clone()); return fresh; }
  return (await caches.match(req, { ignoreSearch: true }))
    || (await caches.match('./index.html'))
    || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
}
async function asset(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) {
    fetch(req).then(r => { if (r && r.ok) caches.open(V).then(c => c.put(req, r)); }).catch(() => { });
    return hit;
  }
  try {
    const r = await fetch(req);
    if (r && r.ok) (await caches.open(V)).put(req, r.clone());
    return r;
  } catch (err) {
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}
