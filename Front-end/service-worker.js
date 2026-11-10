const cacheName = "mmd-static-v1";
const appShell = [
  "/",
  "/index.html",
  "/about.html",
  "/service.html",
  "/portfolio.html",
  "/comments.html",
  "/contact.html",
  "/style.css",
  "/manifest.webmanifest",
  "/js/language.js",
  "/js/main.js",
  "/js/api.js",
  "/js/works.js",
  "/js/comments.js",
  "/js/contact.js",
  "/js/pwa.js",
  "/images/mmd-deco-logo.svg",
  "/images/favicon.svg",
  "/images/app-icon-192.png",
  "/images/app-icon-512.png",
  "/images/app-icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) => cache.addAll(appShell))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                name.startsWith("mmd-static-") && name !== cacheName,
            )
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/uploads/")
  ) {
    return;
  }

  const networkResponse = fetch(request);

  event.respondWith(
    networkResponse.catch(async () => {
      const cached = await caches.match(request);
      if (cached) {
        return cached;
      }

      if (request.mode === "navigate") {
        const homePage = await caches.match("/index.html");
        if (homePage) {
          return homePage;
        }
      }

      throw new Error(`No network response or cached file for ${url.pathname}.`);
    }),
  );
  event.waitUntil(
    networkResponse
      .then((response) => {
        if (!response.ok || response.type !== "basic") {
          return;
        }
        return caches
          .open(cacheName)
          .then((cache) => cache.put(request, response.clone()))
          .catch((error) =>
            console.error("Could not cache a site asset.", error),
          );
      })
      .catch(() => undefined),
  );
});
