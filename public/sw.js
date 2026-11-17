/*
 * Dukhata service worker — deliberately minimal.
 *
 * Its only job is to show a branded offline page when the device has no
 * connection, so the installed Android app never lands on Chrome's dinosaur
 * page. It does NOT cache pages or API responses: this app is server-rendered
 * and must always show fresh khata data, so stale caching would be a bug.
 */
const VERSION = "dukhata-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // Only navigations are handled; every asset and API call goes straight to the
  // network so data can never be served stale.
  if (request.mode !== "navigate" || request.method !== "GET") return;
  event.respondWith(
    fetch(request).catch(() =>
      caches.match(OFFLINE_URL).then((cached) => cached || Response.error()),
    ),
  );
});
