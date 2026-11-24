// WhatsApp inbox (Meta WhatsApp Business Cloud API).
// The owner forwards a supplier bill / expense bill / payment slip to the
// workshop's WhatsApp Business number. The file lands in the Inbox table, AI
// reads it, and WhatsApp replies with what it found. Nothing is recorded in the
// books until the owner checks it in the app and presses Save.
//
// Env (all needed, otherwise the feature is off):
//   WA_TOKEN         permanent access token (System User) for the WhatsApp app
//   WA_PHONE_ID      phone number ID of the workshop's WhatsApp Business number
//   WA_APP_SECRET    the Meta app secret (to check every webhook is from Meta)
//   WA_VERIFY_TOKEN  any long random text; also typed into Meta's webhook setup
//   WA_ALLOWED       numbers allowed to send, e.g. 60123456789 (comma separated)

const crypto = require("crypto");
const db = require("./airtable");
const ai = require("./ai");
const M = require("./money");
const { notify } = require("./notify");

const GRAPH = "https://graph.facebook.com/v21.0";
const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_BYTES = 10 * 1024 * 1024;

const env = () => ({
  token: process.env.WA_TOKEN,
  phoneId: process.env.WA_PHONE_ID,
  secret: process.env.WA_APP_SECRET,
  verify: process.env.WA_VERIFY_TOKEN,
  allowed: String(process.env.WA_ALLOWED || "").split(",").map((s) => s.replace(/\D/g, "")).filter(Boolean),
});
const enabled = () => {
  const e = env();
  return !!(e.token && e.phoneId && e.secret && e.verify && e.allowed.length);
};

// Swappable for tests.
const http = { fetch: (...a) => fetch(...a) };
let lastJob = Promise.resolve();

// What the caption says the file is. Default: a supplier bill for parts.
function kindOf(caption) {
  const c = String(caption || "").toLowerCase();
  if (/\b(slip|bayar|paid|payment|transfer|duitnow|resit pelanggan)\b/.test(c)) return "Payment slip";
  if (/\b(expense|belanja|bil|bill|tnb|air|water|rent|sewa|gaji|wage|internet|unifi|maxis|celcom)\b/.test(c)) return "Expense";
  return "Supplier bill";
}

function signatureOk(raw, header, secret) {
  if (!header || !secret || !Buffer.isBuffer(raw)) return false;
  const want = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(want);
  const b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function graph(path, opts = {}) {
  const res = await http.fetch(`${GRAPH}/${path}`, { ...opts, headers: { Authorization: `Bearer ${env().token}`, ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`WhatsApp API ${res.status}`);
  return res;
}

async function reply(to, body) {
  try {
    await graph(`${env().phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: body.slice(0, 4000) } }),
    });
  } catch (err) {
    console.error("[wa] reply failed:", err.message);
  }
}

async function downloadMedia(id) {
  const meta = await (await graph(encodeURIComponent(id))).json();
  if (!meta.url) throw new Error("No media URL");
  const mime = String(meta.mime_type || "").split(";")[0];
  if (!FILE_TYPES.includes(mime)) throw Object.assign(new Error("type"), { userMsg: "Please send a photo or a PDF of the bill." });
  if (meta.file_size && meta.file_size > MAX_BYTES) throw Object.assign(new Error("size"), { userMsg: "That file is too big (max 10 MB)." });
  const res = await http.fetch(meta.url, { headers: { Authorization: `Bearer ${env().token}` } });
  if (!res.ok) throw new Error(`Media download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw Object.assign(new Error("size"), { userMsg: "That file is too big (max 10 MB)." });
  return { base64: buf.toString("base64"), mimeType: mime, filename: `whatsapp-${id}.${mime === "application/pdf" ? "pdf" : "jpg"}` };
}

function summaryOf(kind, s) {
  const amt = (v) => (v === null || v === undefined || v === "" ? "" : `RM ${M.fmt(Math.round(Number(v) * 100))}`);
  const date = s?.date ? s.date.split("-").reverse().join("/") : "";
  if (kind === "Payment slip") return [s?.payerName, amt(s?.amount), date].filter(Boolean).join(" · ") || "Payment slip";
  return [s?.supplier, amt(s?.total), date].filter(Boolean).join(" · ") || kind;
}

// One incoming message from an allowed number.
async function handleMessage(m, appUrl) {
  const from = String(m.from || "");
  const media = m.image || m.document;
  if (!media) {
    await reply(from, "Hi! Forward me a supplier bill, an expense bill or a customer's payment slip (photo or PDF). Add a caption like \"expense\" or \"slip\" if it is not a parts bill.");
    return;
  }
  const existing = await db.list("inbox", { fields: ["Message id"] });
  if (existing.some((r) => r.fields["Message id"] === m.id)) return; // Meta retries; keep one copy
  const caption = String(media.caption || m.caption || "").slice(0, 200);
  const kind = kindOf(caption);
  const [row] = await db.create("inbox", [{ Summary: `${kind} (reading…)`, "Received at": new Date((Number(m.timestamp) || Date.now() / 1000) * 1000).toISOString(), From: from.slice(-4), Kind: kind, Status: "New", Caption: caption, "Message id": m.id }]);
  try {
    const file = await downloadMedia(media.id);
    await db.upload("inboxFile", row.id, { filename: file.filename, contentType: file.mimeType, base64: file.base64 });
    let suggestion = null;
    try {
      suggestion = kind === "Payment slip" ? await ai.readPayment(file) : await ai.readPurchase(file);
    } catch (err) {
      console.error("[wa] AI:", err.message);
    }
    const summary = summaryOf(kind, suggestion);
    await db.update("inbox", [{ id: row.id, fields: { Summary: summary, "Suggestion JSON": suggestion ? JSON.stringify(suggestion) : "" } }]);
    notify({ kind: "WhatsApp", key: `wa-${row.id}`, link: "#/inbox", title: `WhatsApp ${kind.toLowerCase()} read`, body: `${summary}. ${suggestion ? "Check it and press Save." : "Could not read it; please type it in."}` });
    await reply(from, `Got it ✓ ${kind}: ${summary}.\n${suggestion ? "Check it and press Save" : "I could not read it, please type it in"}: ${appUrl}/#/inbox`);
  } catch (err) {
    console.error("[wa] message:", err.message);
    await db.update("inbox", [{ id: row.id, fields: { Status: "Failed", Error: String(err.userMsg || err.message).slice(0, 200), Summary: `${kind} (not saved)` } }]);
    await reply(from, err.userMsg || "Sorry, I could not save that file. Please try again, or upload it in the DMS.");
  }
}

async function processPayload(body, appUrl) {
  const allowed = env().allowed;
  for (const entry of body?.entry || []) {
    for (const ch of entry.changes || []) {
      for (const m of ch.value?.messages || []) {
        if (!allowed.includes(String(m.from || "").replace(/\D/g, ""))) continue; // only the owner's numbers
        await handleMessage(m, appUrl);
      }
    }
  }
}

// GET /wa/webhook (Meta's one-time check)
function verifyRoute(req, res) {
  const e = env();
  if (!enabled()) return res.status(404).send("Not found");
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === e.verify) return res.status(200).send(String(req.query["hub.challenge"] || ""));
  res.status(403).send("Forbidden");
}

// POST /wa/webhook (raw body, so the signature can be checked)
function receiveRoute(req, res) {
  if (!enabled()) return res.status(404).send("Not found");
  if (!signatureOk(req.body, req.get("x-hub-signature-256"), env().secret)) return res.status(401).send("Bad signature");
  let body;
  try {
    body = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).send("Bad JSON");
  }
  res.status(200).send("OK"); // answer Meta at once; AI reading takes a few seconds
  const appUrl = process.env.PUBLIC_URL || `https://${req.get("host")}`;
  lastJob = processPayload(body, appUrl).catch((err) => console.error("[wa]", err.message));
}

// ---------- app side ----------

const sel = (v) => (v && typeof v === "object" ? v.name : v) || "";
function inboxOut(r) {
  const f = r.fields;
  const file = Array.isArray(f.File) && f.File.length ? f.File[f.File.length - 1] : null;
  let suggestion = null;
  try { suggestion = f["Suggestion JSON"] ? JSON.parse(f["Suggestion JSON"]) : null; } catch { suggestion = null; }
  return {
    id: r.id, summary: f.Summary || "", receivedAt: f["Received at"] || "", from: f.From || "", kind: sel(f.Kind) || "Supplier bill", status: sel(f.Status) || "New",
    caption: f.Caption || "", savedAs: f["Saved as"] || "", error: f.Error || "", suggestion,
    file: file ? { url: file.url, type: file.type || "", thumb: file.thumbnails?.large?.url || null, filename: file.filename || "" } : null,
  };
}

// Used by the save routes: the inbox file goes onto the new record by URL.
async function takeFromInbox(inboxId) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(inboxId || "")) return null;
  const it = inboxOut(await db.get("inbox", inboxId));
  if (it.status === "Saved") throw Object.assign(new Error("This inbox item is already saved."), { status: 400 });
  return it;
}
async function markSaved(inboxId, ref) {
  await db.update("inbox", [{ id: inboxId, fields: { Status: "Saved", "Saved as": ref } }]);
}

function register(router, { wrap }) {
  router.get("/inbox", wrap(async (req, res) => {
    const list = (await db.list("inbox")).map(inboxOut).sort((a, b) => (b.receivedAt || "").localeCompare(a.receivedAt || ""));
    res.json({ inbox: list, whatsapp: { enabled: enabled(), allowed: env().allowed.map((n) => "…" + n.slice(-4)) } });
  }));
  router.patch("/inbox/:id", wrap(async (req, res) => {
    if (!/^rec[A-Za-z0-9]{14}$/.test(req.params.id)) throw Object.assign(new Error("Unknown item."), { status: 400 });
    const fields = {};
    if ("status" in (req.body || {})) {
      if (!["New", "Ignored"].includes(req.body.status)) throw Object.assign(new Error("Unknown status."), { status: 400 });
      fields.Status = req.body.status;
    }
    if ("kind" in (req.body || {})) {
      if (!["Supplier bill", "Expense", "Payment slip"].includes(req.body.kind)) throw Object.assign(new Error("Unknown kind."), { status: 400 });
      fields.Kind = req.body.kind;
    }
    await db.get("inbox", req.params.id);
    const [row] = await db.update("inbox", [{ id: req.params.id, fields }]);
    res.json(inboxOut(row));
  }));
}

module.exports = { register, verifyRoute, receiveRoute, takeFromInbox, markSaved, inboxOut, kindOf, signatureOk, enabled, http, get lastJob() { return lastJob; } };
