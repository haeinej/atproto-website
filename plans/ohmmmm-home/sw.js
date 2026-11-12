/* ohmmmm.com offline support. Registered by /sw-register.js on every page.
 *
 * Every page and everything it loads is saved when the worker installs, so the site opens offline
 * and as an installed app.
 * Pages: network first, so an edit is visible on the next load. The request starts while the
 * worker is still starting up (navigation preload), so going through the worker costs no time.
 * The saved copy is used only when the network fails or takes longer than 4 s. Offline, an unsaved
 * page falls back to /.
 * styles.css, the scripts and images: served from the cache at once and refreshed in the background.
 * The font: served from the cache (its file name is its version; website/README.md §3).
 *
 * Bump VERSION when PRECACHE changes (a page or asset added, renamed or removed): the new
 * worker installs a fresh cache and deletes the old one. Ordinary edits need no bump. */
const VERSION = "10";
const CACHE = `ohm-site-${VERSION}`;
const PRECACHE = [
  "/",
  "/about",
  "/support",
  "/delete-account",
  "/terms",
  "/privacy",
  "/styles.css",
  "/landing.js",
  "/sw-register.js",
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
    // Start each page's request while the worker is still waking up.
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

// Only complete, same-origin, successful responses are saved: never a redirect or a 404.
const saveable = response => response.ok && response.type === "basic" && !response.redirected;

async function page(event) {
  const { request } = event;
  const cache = await caches.open(CACHE);
  const controller = new AbortController();
  let timer;
  // The preloaded response if there is one, otherwise a fetch; either way, give up after 4 s.
  const network = (async () => (await event.preloadResponse) || fetch(request, { signal: controller.signal }))();
  const slow = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("slow")); }, NETWORK_TIMEOUT);
  });
  try {
    const response = await Promise.race([network, slow]);
    // A redirect (www, .html aliases) is the browser's to follow.
    if (saveable(response)) event.waitUntil(cache.put(request, response.clone()));
    return response;
  } catch {
    network.catch(() => {});  // a late answer after the timeout is not an error
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
  } else if (["/styles.css", "/landing.js", "/sw-register.js", "/manifest.webmanifest"].includes(url.pathname) || url.pathname.startsWith("/assets/")) {
    event.respondWith(asset(event, true));
  }
});
