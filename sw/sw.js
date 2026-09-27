/* global self, caches, fetch, Request, Response, URL */
/**
 * Form-E's service worker: what lets the app open on a tablet with no
 * connection. The build (the `formeServiceWorker` plugin in vite.config.ts)
 * turns this file into /sw.js, filling in the build id and the list of the
 * app's files, which are all saved at install so every page's code is on
 * the tablet before it is ever needed offline.
 *
 * - Pages: from the network while it answers within NAV_TIMEOUT_MS, and
 *   saved; otherwise the saved copy of that page, and failing that
 *   /offline.html. Server-rendered pages hold no one's data (sign-in and
 *   every survey load in the browser), so a saved page is safe to show.
 * - The app's files (/assets/…, named by content): saved copy first.
 * - Survey pictures (Convex file storage): saved copy first. The app saves
 *   them into PICTURE_CACHE when a survey is made available offline.
 * - Everything else (Convex's own connection included) passes straight by.
 *
 * A new version installs in the background and waits; the app shows "A new
 * version is ready" and asks it to take over (SKIP_WAITING) when tapped, so
 * an interview is never cut short by an update.
 */

const BUILD = self.__FORME_BUILD__
const PRECACHE = self.__FORME_PRECACHE__

const ASSET_CACHE = `forme-assets-${BUILD}`
const ASSET_PREFIX = 'forme-assets-'
// Shared with src/lib/offline/surveys.ts.
const PAGE_CACHE = 'forme-pages'
const PICTURE_CACHE = 'forme-pictures'
// Saved pages were rendered by some build and load that build's files, so
// the files of a few earlier builds are kept too.
const KEEP_BUILDS = 3
const NAV_TIMEOUT_MS = 4000
const MAX_PAGES = 80
const OFFLINE_PAGE = '/offline.html'
// Saved at install, so the surveyor's home opens offline from the first day.
const START_PAGES = ['/surveys', '/']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(ASSET_CACHE)
      // One by one rather than addAll, which gives up on the first failure.
      await Promise.all(
        PRECACHE.map((path) =>
          cache.add(new Request(path, { cache: 'reload' })).catch(() => undefined),
        ),
      )
      const pages = await caches.open(PAGE_CACHE)
      await Promise.all(
        START_PAGES.map(async (path) => {
          try {
            const response = await fetch(path, { credentials: 'same-origin', cache: 'reload' })
            if (isHtml(response)) await pages.put(path, response)
          } catch {
            // Saved the next time the page is opened online.
          }
        }),
      )
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Cache names come back oldest first.
      const older = (await caches.keys()).filter(
        (name) => name.startsWith(ASSET_PREFIX) && name !== ASSET_CACHE,
      )
      const drop = older.slice(0, Math.max(0, older.length - (KEEP_BUILDS - 1)))
      await Promise.all(drop.map((name) => caches.delete(name)))
      await self.clients.claim()
      // The saved pages load the previous build's files; bring them up to
      // this one while there is a connection (older builds' files stay a
      // while for the ones that cannot be refreshed now).
      await refreshSavedPages()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') {
      event.respondWith(page(request, url))
      return
    }
    if (url.pathname.startsWith('/assets/')) {
      event.respondWith(savedFirst(request, ASSET_CACHE))
      return
    }
    if (PRECACHE.includes(url.pathname)) {
      event.respondWith(savedThenRefresh(request))
    }
    return
  }

  if (isPicture(url) || request.destination === 'image') {
    event.respondWith(picture(request, url))
  }
})

function isHtml(response) {
  return (
    response &&
    response.ok &&
    (response.headers.get('content-type') || '').includes('text/html')
  )
}

function isPicture(url) {
  return /\.convex\.(cloud|site)$/.test(url.hostname) && url.pathname.startsWith('/api/storage/')
}

/** Rejects after `ms`, so a weak connection does not keep a page waiting for ever. */
function within(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/** The key a page is saved under: its path and query, never a sign-in code. */
function pageKey(url) {
  if (url.searchParams.has('code')) return url.pathname
  return url.pathname + url.search
}

async function page(request, url) {
  const cache = await caches.open(PAGE_CACHE)
  const key = pageKey(url)
  const network = fetch(request).then(async (response) => {
    if (isHtml(response)) {
      await cache.put(key, response.clone())
      if (key !== url.pathname) await cache.put(url.pathname, response.clone())
      void trimPages(cache)
    }
    return response
  })
  try {
    return await within(network, NAV_TIMEOUT_MS)
  } catch {
    const saved = (await cache.match(key)) || (await cache.match(url.pathname))
    if (saved) {
      network.catch(() => undefined)
      return saved
    }
    // No saved copy: keep waiting for the network after all.
    try {
      return await network
    } catch {
      return (
        (await caches.match(OFFLINE_PAGE)) ||
        new Response('Form-E is offline and this page is not saved on this device.', {
          status: 503,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        })
      )
    }
  }
}

async function trimPages(cache) {
  const keys = await cache.keys()
  const extra = keys.length - MAX_PAGES
  for (let index = 0; index < extra; index += 1) await cache.delete(keys[index])
}

async function refreshSavedPages() {
  const cache = await caches.open(PAGE_CACHE)
  const keys = await cache.keys()
  await Promise.all(
    keys.map(async (request) => {
      try {
        const response = await fetch(request.url, { credentials: 'same-origin', cache: 'reload' })
        if (isHtml(response)) await cache.put(request, response)
      } catch {
        // Offline right now: the old copy stays.
      }
    }),
  )
}

/** The saved copy (from this build or an earlier one), else the network, saved. */
async function savedFirst(request, cacheName) {
  const saved = await caches.match(request)
  if (saved) return saved
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(cacheName)
    await cache.put(request, response.clone())
  }
  return response
}

/** Icons, the manifest and the like: the saved copy at once, refreshed behind it. */
async function savedThenRefresh(request) {
  const cache = await caches.open(ASSET_CACHE)
  const saved = await caches.match(request)
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone())
      return response
    })
    .catch(() => undefined)
  return saved || (await network) || Response.error()
}

async function picture(request, url) {
  const cache = await caches.open(PICTURE_CACHE)
  const saved = await cache.match(request.url)
  if (saved) return saved
  try {
    const response = await fetch(request)
    // Survey pictures are kept as they are seen, so a scenario viewed once
    // online still shows its picture later without a connection.
    if (isPicture(url) && (response.ok || response.type === 'opaque')) {
      await cache.put(request.url, response.clone())
    }
    return response
  } catch {
    return Response.error()
  }
}
