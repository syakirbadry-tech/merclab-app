// Notifications: the bell in the app and pop-ups on the owner's phone.
//
// Phone pop-ups use Web Push. The server's push key pair comes from
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY when set; otherwise it is made once and
// kept in the "Push devices" table (row Kind = "Server key"), so nothing has to
// be set up on the host. Only the public half is ever sent to the browser.
//
// What makes an alert:
//   - a client approves an estimate online           (workshop.approveRoute)
//   - a bill or slip sent to WhatsApp has been read  (whatsapp.handleMessage)
//   - 08:30-12:00: today's bookings; unpaid invoices 14+ days and parts to restock
//   - 60 minutes before each booking
// The timed ones are checked by tick(): every 5 minutes while the server is
// awake, and by GET /cron/tick, which a GitHub Actions schedule calls so the
// free Render server is awake at 08:30.
// Every alert has a Key, so the same one is never sent twice.

const webpush = require("web-push");
const db = require("./airtable");
const P = require("./pricing");

const KINDS = ["Approval", "WhatsApp", "Booking", "Money", "Stock", "Test"];
const MORNING = ["08:30", "12:00"];
const OVERDUE_DAYS = 14;
const send = { push: (sub, payload, opts) => webpush.sendNotification(sub, payload, opts) }; // swappable for tests
let deps = null; // { jobOut, partOut, loadSettings, mergeVehicles } from routes.js

const sel = (v) => (v && typeof v === "object" ? v.name : v) || "";
const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const keyOk = (k) => /^[A-Za-z0-9_-]{3,80}$/.test(k);
const rm = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "HH:MM" in Kuala Lumpur.
function timeKL(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(11, 16);
}
const minutesOf = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// ---------- keys ----------

let keysP = null;
async function keys() {
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey } = process.env;
  if (publicKey && privateKey) return { publicKey, privateKey };
  if (!keysP) {
    keysP = (async () => {
      const rows = await db.list("push");
      const row = rows.find((r) => sel(r.fields.Kind) === "Server key");
      if (row) {
        try {
          const k = JSON.parse(row.fields["Data JSON"] || "{}");
          if (k.publicKey && k.privateKey) return k;
        } catch { /* made again below */ }
      }
      const k = webpush.generateVAPIDKeys();
      await db.create("push", [{ Name: "Server key (do not share)", Kind: "Server key", "Data JSON": JSON.stringify(k), "Added at": new Date().toISOString() }]);
      return k;
    })().catch((err) => {
      keysP = null;
      throw err;
    });
  }
  return keysP;
}

// ---------- sending ----------

const deviceRows = async () => (await db.list("push")).filter((r) => sel(r.fields.Kind) === "Device");

async function pushToPhones(payload) {
  const devices = await deviceRows();
  if (!devices.length) return 0;
  const k = await keys();
  const opts = {
    vapidDetails: { subject: process.env.PUBLIC_URL || "https://merclab-dms.onrender.com", publicKey: k.publicKey, privateKey: k.privateKey },
    TTL: 6 * 3600,
    urgency: "high",
  };
  const gone = [];
  let sent = 0;
  await Promise.all(devices.map(async (d) => {
    let sub;
    try {
      sub = JSON.parse(d.fields["Data JSON"] || "{}");
    } catch {
      return;
    }
    try {
      await send.push(sub, JSON.stringify(payload), opts);
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) gone.push(d.id); // phone turned alerts off or reinstalled
      else console.error("[notify] push:", err.statusCode || "", err.message);
    }
  }));
  if (gone.length) await db.remove("push", gone).catch((e) => console.error("[notify] remove:", e.message));
  return sent;
}

/**
 * Save an alert for the bell and pop it up on the phones. Never throws: an
 * alert must not break the thing that caused it.
 * @returns the saved row, or null (already sent, or failed)
 */
async function notify({ kind, title, body = "", link = "", key = "" }) {
  try {
    if (key && !keyOk(key)) key = "";
    if (key && (await db.findOne("notifications", "Key", key))) return null;
    const [row] = await db.create("notifications", [{
      Title: clip(title, 120), Body: clip(body, 500), Link: /^#\/[\w/?=&.-]*$/.test(link) ? link : "",
      Kind: KINDS.includes(kind) ? kind : "Test", Key: key, "Created at": new Date().toISOString(),
    }]);
    await pushToPhones({ title: clip(title, 120), body: clip(body, 240), url: "/" + (row.fields.Link || ""), tag: key || row.id }).catch((e) => console.error("[notify] phones:", e.message));
    return row;
  } catch (err) {
    console.error("[notify]", err.message);
    return null;
  }
}

const notifyOut = (r) => ({ id: r.id, title: r.fields.Title || "", body: r.fields.Body || "", link: r.fields.Link || "", kind: sel(r.fields.Kind) || "Test", at: r.fields["Created at"] || r.createdTime || "", read: !!r.fields.Read });

// ---------- the timed checks ----------

/**
 * What the timed alerts would say right now. Pure, so it can be tested.
 * @returns [{ kind, title, body, link, key }]
 */
function dueAlerts({ now = new Date(), bookings = [], jobs = [], toBuy = [] }) {
  const today = P.todayKL(now);
  const t = timeKL(now);
  const nowMin = minutesOf(t);
  const out = [];
  const morning = t >= MORNING[0] && t < MORNING[1];
  const todays = bookings.filter((b) => b.date === today && b.status === "Booked");

  if (morning && todays.length) {
    const list = todays.slice().sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
    out.push({
      kind: "Booking", key: `am-bookings-${today}`, link: "#/bookings",
      title: `Today: ${list.length} booking${list.length === 1 ? "" : "s"}`,
      body: list.slice(0, 5).map((b) => [b.time || "Any time", b.customerName, b.plate].filter(Boolean).join(" · ")).join("\n") + (list.length > 5 ? `\n+${list.length - 5} more` : ""),
    });
  }

  for (const b of todays) {
    const start = minutesOf(b.time);
    if (start == null) continue;
    const left = start - nowMin;
    if (left < 0 || left > 60) continue;
    out.push({
      kind: "Booking", key: `remind-${b.id}-${today}-${b.time.replace(":", "")}`, link: "#/bookings",
      title: `Booking at ${b.time} (in ${left} min)`,
      body: [b.customerName, b.plate, b.car, b.work].filter(Boolean).join(" · "),
    });
  }

  if (morning) {
    const cutoff = P.addDays(today, -OVERDUE_DAYS);
    const late = jobs.filter((j) => j.invoiceNo && j.status !== "Cancelled" && j.balance > 0.009 && (j.invoiceDate || j.date) && (j.invoiceDate || j.date) <= cutoff);
    const lines = [];
    if (late.length) lines.push(`${late.length} invoice${late.length === 1 ? "" : "s"} unpaid ${OVERDUE_DAYS}+ days: ${rm(late.reduce((s, j) => s + j.balance, 0))}`);
    if (toBuy.length) lines.push(`${toBuy.length} part${toBuy.length === 1 ? "" : "s"} to restock: ${toBuy.slice(0, 3).map((i) => i.name).filter(Boolean).join(", ")}${toBuy.length > 3 ? "…" : ""}`);
    if (lines.length) {
      out.push({
        kind: late.length ? "Money" : "Stock", key: `am-money-${today}`, link: late.length ? "#/money?tab=owed" : "#/parts",
        title: late.length && toBuy.length ? "Money & stock" : late.length ? "Unpaid invoices" : "Parts to restock",
        body: lines.join("\n"),
      });
    }
  }
  return out;
}

let ticking = null;
let lastTick = 0;
async function tick(now = new Date()) {
  if (!deps) return { sent: 0 };
  if (ticking) return ticking;
  ticking = (async () => {
    try {
      const { bookingOut } = require("./crm");
      const { partsInsights } = require("./insights");
      const t = timeKL(now);
      const morning = t >= MORNING[0] && t < MORNING[1];
      const [b, q, p, v, s] = await Promise.all([
        db.list("bookings"),
        morning ? db.list("quotes") : [],
        morning ? db.list("parts") : [],
        morning ? db.list("vehicles") : [],
        morning ? deps.loadSettings() : {},
      ]);
      const jobs = q.map(deps.jobOut);
      let toBuy = [];
      if (morning) {
        try {
          const vehicles = deps.mergeVehicles(v, jobs, { months: s.serviceIntervalMonths, km: s.serviceIntervalKm });
          toBuy = partsInsights({ jobs, parts: p.map(deps.partOut), vehicles, today: P.todayKL(now) }).toBuy;
        } catch (err) {
          console.error("[notify] stock:", err.message);
        }
      }
      let sent = 0;
      for (const a of dueAlerts({ now, bookings: b.map(bookingOut), jobs, toBuy })) if (await notify(a)) sent++;
      lastTick = Date.now();
      return { sent };
    } catch (err) {
      console.error("[notify] tick:", err.message);
      return { sent: 0, error: true };
    } finally {
      ticking = null;
    }
  })();
  return ticking;
}

// Public GET /cron/tick. Safe to call by anyone: it only sends the owner's
// own alerts, each at most once. At most one real run a minute.
async function tickRoute(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (Date.now() - lastTick < 60 * 1000) return res.json({ ok: true, skipped: true });
  const r = await tick();
  res.json({ ok: !r.error, sent: r.sent });
}

function startTimer() {
  if (process.env.NODE_ENV === "test") return;
  const t = setInterval(() => tick().catch(() => {}), 5 * 60 * 1000);
  t.unref?.();
}

// ---------- app routes ----------

function register(router, { wrap, jobOut, partOut, loadSettings, mergeVehicles }) {
  deps = { jobOut, partOut, loadSettings, mergeVehicles };
  const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

  router.get("/notifications", wrap(async (req, res) => {
    const [rows, devices, k] = await Promise.all([db.list("notifications"), deviceRows(), keys().catch(() => null)]);
    const items = rows.map(notifyOut).sort((a, b) => b.at.localeCompare(a.at));
    res.json({ items: items.slice(0, 40), unread: items.filter((i) => !i.read).length, publicKey: k?.publicKey || "", devices: devices.length });
  }));

  router.post("/notifications/read", wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id) => /^rec[A-Za-z0-9]{14}$/.test(id)).slice(0, 100) : null;
    const rows = ids ? ids.map((id) => ({ id })) : (await db.list("notifications", { fields: ["Read"] })).filter((r) => !r.fields.Read);
    if (rows.length) await db.update("notifications", rows.map((r) => ({ id: r.id, fields: { Read: true } })));
    res.json({ ok: true, marked: rows.length });
  }));

  router.post("/push/subscribe", wrap(async (req, res) => {
    const sub = req.body?.subscription;
    const endpoint = String(sub?.endpoint || "");
    if (!/^https:\/\/[^\s]{10,800}$/.test(endpoint) || !sub?.keys?.p256dh || !sub?.keys?.auth) throw bad("This phone did not give a valid alert address. Try again.");
    const clean = { endpoint, expirationTime: null, keys: { p256dh: String(sub.keys.p256dh).slice(0, 200), auth: String(sub.keys.auth).slice(0, 100) } };
    const devices = await deviceRows();
    const same = devices.find((d) => d.fields.Endpoint === endpoint);
    const fields = { Name: clip(req.body?.name || "Phone", 60), Kind: "Device", Endpoint: endpoint, "Data JSON": JSON.stringify(clean) };
    if (same) await db.update("push", [{ id: same.id, fields }]);
    else await db.create("push", [{ ...fields, "Added at": new Date().toISOString() }]);
    res.json({ ok: true, devices: devices.length + (same ? 0 : 1) });
  }));

  router.post("/push/unsubscribe", wrap(async (req, res) => {
    const endpoint = String(req.body?.endpoint || "");
    const gone = (await deviceRows()).filter((d) => d.fields.Endpoint === endpoint).map((d) => d.id);
    if (gone.length) await db.remove("push", gone);
    res.json({ ok: true });
  }));

  router.post("/push/test", wrap(async (req, res) => {
    const row = await notify({ kind: "Test", title: "Alerts are on ✓", body: "This is how DMS alerts will look on this phone.", link: "#/dashboard" });
    if (!row) throw Object.assign(new Error("Could not send the test alert. Try again."), { status: 502 });
    res.json({ ok: true });
  }));
}

module.exports = { register, notify, tick, tickRoute, startTimer, dueAlerts, keys, timeKL, send, _reset: () => { keysP = null; lastTick = 0; ticking = null; } };
