const CACHE_NAME = "terminal-os-shell-v2";
const SHELL = ["/", "/login", "/icon.svg"];
self.addEventListener("install", (event) => { event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (event) => { const request = event.request; if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin || new URL(request.url).pathname.startsWith("/api/")) return; event.respondWith(fetch(request).catch(() => caches.match(request).then((cached) => cached ?? caches.match("/login")))); });

// Synchronisation différée : prévient les pages ouvertes de rejouer la file
// d'attente hors ligne (lib/offline-queue.ts) quand la connexion revient.
async function notifyClients(message) { const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" }); for (const client of clients) client.postMessage(message); }
self.addEventListener("sync", (event) => { if (event.tag === "os-sync") event.waitUntil(notifyClients({ type: "OS_SYNC" })); });
self.addEventListener("message", (event) => { if (event.data && event.data.type === "OS_SYNC_REQUEST") event.waitUntil(notifyClients({ type: "OS_SYNC" })); });
