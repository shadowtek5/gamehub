// Minimal service worker — its only job is to make GameHub installable as a
// PWA (Android needs a SW with a fetch handler to offer the install prompt).
// It deliberately does NO caching: every request passes straight through to the
// network, so the app is always fresh and there are no stale-content bugs on
// this data-heavy, auth-gated app.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // no respondWith() → the browser handles the request normally (network)
});
