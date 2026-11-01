/* SportsPredicta service worker: offline app shell + cached static assets.
 * The app keeps its working data (coupon, picks, slips, results) in LocalStorage, so once the shell
 * is cached it works offline. API calls are never cached here — they always need the network. */
const VERSION = "v1";
const SHELL_CACHE = `sp-shell-${VERSION}`;
const ASSET_CACHE = `sp-assets-${VERSION}`;
const FONT_CACHE = `sp-fonts-${VERSION}`;
const SHELL = ["/", "/favicon.svg", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

/** How a request is handled. Exported for tests; pure. */
function routeFor(url, method, mode) {
  if (method !== "GET") return "network";
  const u = new URL(url);
  if (u.origin === self.location.origin) {
    if (u.pathname.startsWith("/api/")) return "network";
    if (mode === "navigate") return "navigate";
    if (u.pathname.startsWith("/assets/")) return "cache-first"; // content-hashed, immutable
    if (SHELL.includes(u.pathname)) return "stale-while-revalidate";
    return "network";
  }
  if (u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com") return "stale-while-revalidate";
  return "network";
}

async function cacheFirst(req) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const update = fetch(req)
    .then((res) => {
      if (res.ok || res.type === "opaque") cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || update;
}

/** Network first so deploys show up immediately; the cached shell when offline. */
async function navigate(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put("/", res.clone());
    return res;
  } catch {
    return (await cache.match("/")) || Response.error();
  }
}

if (typeof self !== "undefined" && typeof self.addEventListener === "function" && typeof caches !== "undefined") {
  self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)));
  });

  self.addEventListener("activate", (event) => {
    const keep = new Set([SHELL_CACHE, ASSET_CACHE, FONT_CACHE]);
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((k) => k.startsWith("sp-") && !keep.has(k)).map((k) => caches.delete(k))))
        .then(() => self.clients.claim()),
    );
  });

  // The page asks a waiting worker to take over when the user accepts an update.
  self.addEventListener("message", (event) => {
    if (event.data === "SKIP_WAITING") self.skipWaiting();
  });

  self.addEventListener("fetch", (event) => {
    const req = event.request;
    const route = routeFor(req.url, req.method, req.mode);
    if (route === "network") return;
    if (route === "navigate") event.respondWith(navigate(req));
    else if (route === "cache-first") event.respondWith(cacheFirst(req));
    else event.respondWith(staleWhileRevalidate(req, req.url.includes("fonts.g") ? FONT_CACHE : SHELL_CACHE));
  });
}

if (typeof module !== "undefined") module.exports = { routeFor, SHELL, VERSION };
