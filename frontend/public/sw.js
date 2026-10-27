// Bridge Replay's service worker. It's here so browsers treat the app as installable; it doesn't
// cache anything or work offline (a shared game needs the server). There's deliberately no fetch
// handler: every request goes to the network as usual, so it's safe in dev too. Registered from
// src/main.tsx.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
