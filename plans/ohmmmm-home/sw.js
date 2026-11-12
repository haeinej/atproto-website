/* ohmmmm.com offline support. Registered by /sw-register.js on every page.
 *
 * Pages: network first, so an edit is visible on the next load; the saved copy is used only
 * when the network fails or takes longer than 4 s. Offline, an unsaved page falls back to /.
 * styles.css and images: served from the cache and refreshed in the background.
 * The font: served from the cache (its file name is its version; website/README.md §3).
 *
 * Bump VERSION when PRECACHE changes (a page or asset added, renamed or removed): the new
 * worker installs a fresh cache and deletes the old one. Ordinary edits need no bump. */
const VERSION = "1";
const CACHE = `ohm-site-${VERSION}`;
const PRECACHE = [
  "/",
  "/support",
  "/delete-account",
  "/terms",
  "/privacy",
  "/styles.css",
  "/manifest.webmanifest",
  "/assets/fonts/coconat-regular.woff2",
  "/assets/favicon.svg",
  "/assets/apple-touch-icon.png",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
  "/assets/icon-maskable-512.png",
];
const NETWORK_TIMEOUT = 4000;

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE.map(path => new Request(path, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("ohm-site-") && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Only complete, same-origin, successful responses are saved: never a redirect or a 404.
const saveable = response => response.ok && response.type === "basic" && !response.redirected;

async function page(event) {
  const { request } = event;
  const cache = await caches.open(CACHE);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT);
  try {
    const response = await fetch(request, { signal: controller.signal });
    // A redirect (www, .html aliases) is the browser's to follow.
    if (saveable(response)) event.waitUntil(cache.put(request, response.clone()));
    return response;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) || (await cache.match("/")) || Response.error();
  } finally {
    clearTimeout(timer);
  }
}

async function asset(event, revalidate) {
  const { request } = event;
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  const fresh = (!hit || revalidate)
    ? fetch(request).then(response => {
        if (saveable(response)) return cache.put(request, response.clone()).then(() => response);
        return response;
      })
    : null;
  if (hit) {
    if (fresh) event.waitUntil(fresh.catch(() => {}));
    return hit;
  }
  return fresh;
}

self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js" || url.pathname.startsWith("/.well-known/")) return;

  if (request.mode === "navigate") {
    event.respondWith(page(event));
  } else if (url.pathname.startsWith("/assets/fonts/")) {
    event.respondWith(asset(event, false));
  } else if (url.pathname === "/styles.css" || url.pathname.startsWith("/assets/")) {
    event.respondWith(asset(event, true));
  }
});
