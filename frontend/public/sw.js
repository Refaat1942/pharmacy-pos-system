/* FPS Pharmacy service worker — lets the app open with no internet.
 *
 * - Page loads: network first, fall back to the cached app shell (index.html).
 * - /assets/* (hashed, immutable) and fonts: cache first.
 * - /api/* is never cached here — data offline is handled in the app (lib/offline.ts).
 */
const SHELL = 'fps-shell-v1'
const ASSETS = 'fps-assets-v1'

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL)
    try {
      const res = await fetch('/', { cache: 'no-store' })
      if (res.ok) {
        const html = await res.clone().text()
        await cache.put('/', res)
        // Pre-cache the JS/CSS the shell needs so the very first offline open works.
        const urls = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
        const assets = await caches.open(ASSETS)
        await Promise.all(urls.map((u) => assets.add(u).catch(() => {})))
      }
    } catch { /* offline during install — next visit retries */ }
    self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, ASSETS])
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/downloads/')) return

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        if (res.ok) (await caches.open(SHELL)).put('/', res.clone())
        return res
      } catch {
        return (await caches.match('/')) || Response.error()
      }
    })())
    return
  }

  const cacheable =
    (url.origin === self.location.origin && (url.pathname.startsWith('/assets/') || /\.(png|svg|ico|woff2?|ttf)$/.test(url.pathname))) ||
    url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com'
  if (!cacheable) return
  event.respondWith((async () => {
    const hit = await caches.match(req)
    if (hit) return hit
    try {
      const res = await fetch(req)
      if (res.ok || res.type === 'opaque') (await caches.open(ASSETS)).put(req, res.clone())
      return res
    } catch {
      return hit || Response.error()
    }
  })())
})
