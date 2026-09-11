// BuildSupply service worker.
//
// The point is a shop with bad 4G: the app itself should open instantly and
// keep working while the network is slow, rather than showing a white screen
// until every file downloads again.
//
// Deliberately hand-written instead of pulling in a plugin — the whole
// caching policy is short enough to read, and being able to read it matters
// more than the extra features a generated worker would bring.

// Bump this to force every client to throw away its old cache on activate.
// Also clears out assets left behind by previous builds, since Vite's
// content-hashed filenames mean old entries are never requested again.
// v3: v2 could store a 404 or an error page as the offline shell, so any
// client already holding one has to drop it rather than keep serving it.
// v4: the app icons became the BuildSupply logo; the shell below holds them.
// v5: icon-512 gained the name under the logo (Android's launch screen).
// v6: only /assets/* is cache-first now, and the icons carry ?v=3 — see the
// fetch handler; v5's copies of the old icons had to go.
const CACHE = 'buildsupply-v6'

// The shell only. Everything under /assets/ is content-hashed by Vite, so it
// gets cached on first use instead of being listed here. The icon URLs must
// match the manifest's and index.html's exactly, ?v= included.
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png?v=3', '/icon-512.png?v=3', '/favicon.svg?v=3']

/**
 * Look something up in our cache by URL, ignoring `Vary`.
 *
 * This matters more than it looks. Static hosts (Vite's own preview, Netlify,
 * Vercel, Cloudflare) send `Vary: Origin` on assets, and the Cache API
 * honours Vary — it compares the stored request's Origin header against the
 * incoming one. A module script fetched with `crossorigin` doesn't always
 * carry the same Origin header on every request, so a plain `cache.match()`
 * would MISS entries this worker had just stored, fall through to the
 * network, and fail with the connection down — exactly when the cache was
 * supposed to save us.
 *
 * We key purely on URL, and the filenames are content-hashed, so Vary has
 * nothing useful to tell us here.
 */
function cacheLookup(cache, request) {
  return cache.match(request, { ignoreVary: true })
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  // Only ever touch this app's own GET requests. Supabase calls are
  // cross-origin and must always go to the network — serving a stale invoice
  // or khata balance from cache would be far worse than an error.
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navigations: network first so a deploy is picked up immediately, falling
  // back to the cached shell when the connection drops.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only ever store a real page. A 404 from a host that isn't
          // rewriting unknown paths to index.html, a 500, or the sign-in page
          // a cafe's wifi hands back would otherwise become the shell this
          // app shows every time it opens offline — and it would keep being
          // served long after the network came back.
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put('/index.html', copy))
          }
          return response
        })
        .catch(async () => {
          const cache = await caches.open(CACHE)
          return (await cacheLookup(cache, '/index.html')) ?? Response.error()
        }),
    )
    return
  }

  // Hashed build assets (/assets/*) never change under the same URL, so
  // cache-first is safe and makes a repeat open essentially instant.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        const cached = await cacheLookup(cache, request)
        if (cached) return cached

        const response = await fetch(request)
        if (response.ok && response.type === 'basic') {
          cache.put(request, response.clone())
        }
        return response
      })(),
    )
    return
  }

  // Everything else keeps its name when its contents change — the app icons,
  // the manifest, the favicon. Served cache-first, the phone's old copy won
  // forever: a new app icon never reached an installed phone, because Chrome
  // fetches the icon through this worker when (re)installing. Network first,
  // then, with the cached copy for when there is no signal.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      try {
        const response = await fetch(request)
        if (response.ok && response.type === 'basic') {
          cache.put(request, response.clone())
        }
        return response
      } catch {
        return (await cacheLookup(cache, request)) ?? Response.error()
      }
    })(),
  )
})
