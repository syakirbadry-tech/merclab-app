// Service worker: only shows DMS alerts. It does not cache pages, so the app
// always loads fresh files.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Merc Lab", body: e.data ? e.data.text() : "" }; }
  const url = typeof d.url === "string" && d.url.startsWith("/") ? d.url : "/";
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || "Merc Lab", {
      body: d.body || "", tag: d.tag || undefined, data: { url },
      icon: "/icons/icon-192.png", badge: "/icons/icon-192.png",
    }),
    self.clients.matchAll({ type: "window" }).then((list) => list.forEach((c) => c.postMessage({ type: "alert" }))),
  ]));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const c = list.find((w) => new URL(w.url).origin === self.location.origin);
    if (c) return c.focus().then((w) => (w || c).navigate ? (w || c).navigate(url) : null).catch(() => self.clients.openWindow(url));
    return self.clients.openWindow(url);
  }));
});
