/*
 * Service worker for Image & PDF Resizer.
 *
 * - The cache name carries the build id (/sw.js?v=<build id>, set by components/pwa-register.tsx),
 *   so every deploy gets a fresh cache and the old one is deleted automatically.
 * - Install pre-caches every tool page AND the JS/CSS/font files those pages need, so each tool works
 *   offline after the first visit (not only the ones that were opened before going offline).
 * - Only successful (HTTP 200, same-origin) responses are ever cached - a 404 during a deploy can't get stuck.
 * - Only same-origin GET requests are handled; everything else goes straight to the network.
 * - A new version waits until the user taps "Update" (SKIP_WAITING message), so a page is never swapped mid-use.
 */

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev"
const CACHE = `resizer-${VERSION}`

const PAGES = ["/", "/image", "/pdf", "/image-to-pdf", "/sign"]
const FILES = [
  "/offline.html",
  "/manifest.json",
  "/icons/icon-32.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
]
const NEXT_ASSET = /\/_next\/static\/[^"'\s\\)<>]+\.(?:js|mjs|css|woff2?)(?:\?[^"'\s\\)<>]*)?/g
const CSS_FONT = /\/_next\/static\/media\/[^"'\s\\)<>]+/g
const STATIC_FILE = /\.(?:png|jpe?g|svg|ico|webp|json|woff2?|css|js|mjs)$/i
const NETWORK_TIMEOUT_MS = 4000

function cacheable(response) {
  return response && response.ok && response.status === 200 && response.type === "basic"
}

async function put(cache, request, response) {
  if (cacheable(response)) {
    try {
      await cache.put(request, response.clone())
    } catch {
      /* quota or opaque response - ignore */
    }
  }
}

async function precache() {
  const cache = await caches.open(CACHE)

  await Promise.allSettled(FILES.map((file) => cache.add(new Request(file, { cache: "reload" }))))

  // 1) the pages themselves, and the asset URLs they reference
  const assets = new Set()
  await Promise.allSettled(
    PAGES.map(async (page) => {
      const response = await fetch(new Request(page, { cache: "reload" }))
      if (!cacheable(response)) return
      await put(cache, page, response)
      const html = await response.text()
      for (const url of html.match(NEXT_ASSET) || []) assets.add(url)
    }),
  )

  // 2) those assets (and the fonts that the CSS files point to)
  const fonts = new Set()
  await Promise.allSettled(
    [...assets].map(async (url) => {
      const response = await fetch(url)
      if (!cacheable(response)) return
      await put(cache, url, response)
      if (/\.css(?:\?|$)/.test(url)) {
        const css = await response.text()
        for (const font of css.match(CSS_FONT) || []) fonts.add(font)
      }
    }),
  )
  await Promise.allSettled(
    [...fonts].map(async (url) => {
      const response = await fetch(url)
      await put(cache, url, response)
    }),
  )
}

self.addEventListener("install", (event) => {
  // No skipWaiting() here: an updated worker waits for the user's "Update" tap (see message handler).
  event.waitUntil(precache())
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name.startsWith("resizer-") && name !== CACHE).map((name) => caches.delete(name)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting()
})

/** Network first (always fresh when online), cache when offline or when the network is very slow. */
async function pageStrategy(request) {
  const cache = await caches.open(CACHE)
  const path = new URL(request.url).pathname

  const network = fetch(request).then(async (response) => {
    await put(cache, path, response)
    return response
  })
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS))
    return await Promise.race([network, timeout])
  } catch {
    const cached = await cache.match(path)
    if (cached) return cached
    network.catch(() => {}) // avoid an unhandled rejection from the abandoned request
    const offline = await cache.match("/offline.html")
    return offline || new Response("You are offline.", { status: 503, headers: { "Content-Type": "text/plain" } })
  }
}

/** Hashed build files never change, so cache first. */
async function immutableStrategy(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  await put(cache, request, response)
  return response
}

/** Icons, manifest, etc.: show the cached copy immediately and refresh it in the background. */
async function revalidateStrategy(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  const refresh = fetch(request)
    .then(async (response) => {
      await put(cache, request, response)
      return response
    })
    .catch(() => null)
  return cached || (await refresh) || Response.error()
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname === "/sw.js") return
  if (url.searchParams.has("_rsc")) return // Next.js client-navigation data; Next falls back to a normal page load

  if (request.mode === "navigate") {
    event.respondWith(pageStrategy(request))
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname === "/pdf.worker.min.mjs") {
    event.respondWith(immutableStrategy(request))
  } else if (STATIC_FILE.test(url.pathname)) {
    event.respondWith(revalidateStrategy(request))
  }
})
