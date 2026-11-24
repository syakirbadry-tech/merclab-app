// Alerts: the bell in the top bar, the list of recent alerts, in-app pop-ups,
// and "Turn on phone alerts" (Web Push through sw.js).
(function () {
  "use strict";
  var BELL = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"></path><path d="M10 20.5a2 2 0 0 0 4 0"></path></svg>';
  var state = { items: [], unread: 0, publicKey: "", devices: 0, seen: null, open: false };
  var btn, panel, timer;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function api(path, body) {
    var o = { method: body ? "POST" : "GET", credentials: "same-origin", headers: {} };
    if (body) { o.body = JSON.stringify(body); o.headers["Content-Type"] = "application/json"; }
    return fetch("/api" + path, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || "Something went wrong. Try again."); return d; });
    });
  }
  function toast(msg, kind, action) {
    if (window.MLFeedback) return window.MLFeedback.toast(msg, { kind: kind || "info", action: action, duration: action ? 7000 : 3600 });
  }
  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (!(s >= 0)) return "";
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + " min ago";
    if (s < 86400) return Math.floor(s / 3600) + " h ago";
    return new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" });
  }
  var loggedIn = function () { var sh = document.getElementById("shell"); return sh && !sh.hidden; };

  // ---------- phone alerts ----------
  var pushSupported = function () { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; };
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var standalone = window.matchMedia && matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  var reg = null;
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").then(function (r) { reg = r; }).catch(function () {});

  function b64ToBytes(b64) {
    var pad = "=".repeat((4 - (b64.length % 4)) % 4), raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function currentSub() {
    if (!pushSupported()) return Promise.resolve(null);
    return navigator.serviceWorker.getRegistration().then(function (r) { return r ? r.pushManager.getSubscription() : null; }).catch(function () { return null; });
  }
  function phoneName() {
    var ua = navigator.userAgent;
    return (/iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android phone" : /Windows/.test(ua) ? "Windows computer" : /Mac/.test(ua) ? "Mac" : "Device") + " · " + new Date().toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
  }
  function turnOn(b) {
    if (!state.publicKey) return toast("Alerts are not ready on the server yet. Try again in a minute.", "err");
    b.disabled = true;
    Notification.requestPermission().then(function (p) {
      if (p !== "granted") throw new Error(p === "denied" ? "Alerts are blocked for this app. Turn them on in the phone's Settings → Notifications → Merc Lab." : "Alerts were not allowed.");
      return navigator.serviceWorker.register("/sw.js").then(function () { return navigator.serviceWorker.ready; });
    }).then(function (r) {
      return r.pushManager.getSubscription().then(function (s) { return s || r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(state.publicKey) }); });
    }).then(function (sub) {
      return api("/push/subscribe", { subscription: sub.toJSON(), name: phoneName() });
    }).then(function () {
      return api("/push/test", {});
    }).then(function () {
      toast("Phone alerts are on. A test alert is on its way.", "ok");
      return refresh();
    }).catch(function (err) {
      toast(err.message || "Could not turn alerts on.", "err");
    }).then(function () { b.disabled = false; render(); });
  }
  function turnOff(b) {
    b.disabled = true;
    currentSub().then(function (s) {
      if (!s) return;
      return api("/push/unsubscribe", { endpoint: s.endpoint }).then(function () { return s.unsubscribe(); });
    }).then(function () { toast("Phone alerts are off on this device.", "ok"); return refresh(); })
      .catch(function (err) { toast(err.message, "err"); })
      .then(function () { b.disabled = false; render(); });
  }

  // ---------- panel ----------
  function phoneBlock(sub) {
    if (!pushSupported()) {
      if (isIOS && !standalone) return '<div class="al-setup"><b>Get alerts on this iPhone</b><ol><li>Tap <b>Share</b> <span aria-hidden="true">⬆︎</span> in Safari</li><li>Tap <b>Add to Home Screen</b></li><li>Open the DMS from the Home Screen, then tap the bell again</li></ol></div>';
      return '<div class="al-setup muted">This browser cannot show phone alerts. Use Safari (iPhone) or Chrome.</div>';
    }
    if (Notification.permission === "denied") return '<div class="al-setup"><b>Alerts are blocked</b><p>Turn them on in the phone\'s Settings → Notifications → Merc Lab, then come back.</p></div>';
    if (sub) return '<div class="al-setup on"><span>Phone alerts are <b>on</b> for this device</span><button type="button" class="btn ghost sm" id="alOff">Turn off</button></div>';
    return '<div class="al-setup"><b>Get a pop-up on this phone</b><p>Approvals, WhatsApp bills, bookings (8:30am and 1 hour before), unpaid invoices and stock.</p><button type="button" class="btn block" id="alOn">' + BELL + 'Turn on phone alerts</button></div>';
  }
  function render() {
    if (!btn) return;
    var n = state.unread;
    btn.querySelector(".al-n").textContent = n > 9 ? "9+" : String(n);
    btn.querySelector(".al-n").hidden = !n;
    btn.setAttribute("aria-label", n ? n + " new alert" + (n === 1 ? "" : "s") : "Alerts");
    if (!state.open) return;
    currentSub().then(function (sub) {
      var list = state.items.length ? state.items.map(function (i) {
        return '<a class="al-item' + (i.read ? "" : " new") + '" href="' + esc(i.link || "#/dashboard") + '" data-id="' + esc(i.id) + '"><span class="al-dot" aria-hidden="true"></span><span class="al-t"><b>' + esc(i.title) + "</b>" + (i.body ? "<span>" + esc(i.body).replace(/\n/g, "<br>") + "</span>" : "") + '<small>' + esc(ago(i.at)) + "</small></span></a>";
      }).join("") : '<p class="al-empty">No alerts yet. They appear here when a client approves, a WhatsApp bill is read, and for bookings, unpaid invoices and stock.</p>';
      panel.innerHTML = '<div class="al-head"><div class="al-h" role="heading" aria-level="2">Alerts</div>' + (state.unread ? '<button type="button" class="btn ghost sm" id="alAll">Mark all read</button>' : "") + '<button type="button" class="btn ghost icon sm al-x" id="alClose" aria-label="Close">✕</button></div>' + phoneBlock(sub) + '<div class="al-list">' + list + "</div>";
      var on = panel.querySelector("#alOn"), off = panel.querySelector("#alOff"), all = panel.querySelector("#alAll");
      if (on) on.onclick = function () { turnOn(on); };
      if (off) off.onclick = function () { turnOff(off); };
      if (all) all.onclick = function () { api("/notifications/read", {}).then(refresh); };
      panel.querySelector("#alClose").onclick = close;
    });
  }
  function openPanel() {
    state.open = true;
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    document.body.classList.add("alerts-open");
    render();
    refresh();
  }
  function close() {
    state.open = false;
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    document.body.classList.remove("alerts-open");
  }

  // ---------- data ----------
  function refresh() {
    if (!loggedIn()) return Promise.resolve();
    return api("/notifications").then(function (d) {
      var fresh = state.seen ? d.items.filter(function (i) { return !i.read && !state.seen[i.id]; }) : [];
      state.items = d.items; state.unread = d.unread; state.publicKey = d.publicKey; state.devices = d.devices;
      state.seen = state.seen || {};
      d.items.forEach(function (i) { state.seen[i.id] = 1; });
      // in-app pop-up for alerts that arrived while the app is open
      if (!state.open) fresh.slice(0, 2).forEach(function (i) { toast("<b>" + esc(i.title) + "</b>" + (i.body ? "<br>" + esc(i.body.split("\n")[0]) : ""), "info", i.link ? { href: i.link, label: "Open" } : null); });
      render();
    }).catch(function () {});
  }

  function build() {
    var bar = document.querySelector(".topbar"), me = bar && bar.querySelector(".me");
    if (!bar || btn) return;
    btn = document.createElement("button");
    btn.type = "button"; btn.className = "al-btn"; btn.id = "alBtn";
    btn.setAttribute("aria-haspopup", "dialog"); btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = BELL + '<span class="al-n" hidden>0</span>';
    bar.insertBefore(btn, me || null);
    panel = document.createElement("div");
    panel.className = "al-panel"; panel.id = "alPanel"; panel.hidden = true;
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Alerts");
    document.body.appendChild(panel);
    btn.onclick = function () { state.open ? close() : openPanel(); };
    panel.addEventListener("click", function (e) {
      var a = e.target.closest(".al-item");
      if (!a) return;
      if (a.classList.contains("new")) api("/notifications/read", { ids: [a.dataset.id] }).then(refresh);
      close();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && state.open) close(); });
    document.addEventListener("click", function (e) { if (state.open && !panel.contains(e.target) && !btn.contains(e.target)) close(); }, true);
    window.addEventListener("hashchange", function () { if (state.open) close(); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });
    if (navigator.serviceWorker) navigator.serviceWorker.addEventListener("message", function (e) { if (e.data && e.data.type === "alert") refresh(); });
    refresh();
    timer = setInterval(function () { if (!document.hidden) refresh(); }, 60000);
  }

  // The top bar exists once the app has logged in and built its shell.
  function wait() {
    if (loggedIn() && document.querySelector(".topbar")) return build();
    setTimeout(wait, 700);
  }
  wait();
})();
