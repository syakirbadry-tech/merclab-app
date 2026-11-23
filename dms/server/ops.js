// Running the live site safely: rate limits, error log, friendly error
// pages, health checks and a full data backup.

const db = require("./airtable");

const startedAt = new Date().toISOString();
const version = (process.env.RENDER_GIT_COMMIT || "").slice(0, 7) || "local";

// ---------- rate limits ----------
// A simple fixed window per address. One server, so memory is enough.
function limiter(name, { max, windowMs, message = "Too many requests. Please wait a few minutes." }) {
  const hits = new Map();
  let lastSweep = Date.now();
  const mw = (req, res, next) => {
    const now = Date.now();
    if (now - lastSweep > windowMs) {
      for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k);
      lastSweep = now;
    }
    const key = req.ip || "x";
    let h = hits.get(key);
    if (!h || now - h.start >= windowMs) {
      h = { start: now, count: 0 };
      hits.set(key, h);
    }
    h.count += 1;
    const limit = typeof max === "function" ? max() : max;
    if (h.count > limit) {
      res.setHeader("Retry-After", String(Math.ceil((h.start + windowMs - now) / 1000)));
      noteError({ status: 429, method: req.method, path: req.originalUrl, message: `${name} limit` });
      if (req.originalUrl.startsWith("/api") || req.method !== "GET") return res.status(429).json({ error: message });
      return res.status(429).send(page("Please wait a moment", "Too many requests came from your connection. Please try again in a few minutes."));
    }
    next();
  };
  mw._hits = hits;
  return mw;
}

const envNum = (k, d) => () => (Number(process.env[k]) > 0 ? Number(process.env[k]) : d);

// Logged-in app: generous, only stops runaway scripts.
const apiLimit = limiter("api", { max: envNum("RATE_API_MAX", 600), windowMs: 5 * 60 * 1000 });
// AI reading of receipts and slips costs money per call.
const aiLimit = limiter("ai", { max: envNum("RATE_AI_MAX", 60), windowMs: 60 * 60 * 1000, message: "Too many AI reads this hour. Please wait a bit." });
// Customer document links (no login).
const docLimit = limiter("doc", { max: envNum("RATE_DOC_MAX", 60), windowMs: 5 * 60 * 1000 });

// ---------- error log ----------
// The last 100 problems, kept in memory and shown on the System page.
// Document links are masked so a log never holds a usable link.
const errors = [];
const mask = (p) => String(p || "").replace(/\/d\/([qirhc])[a-f0-9]{32}/g, "/d/$1…").split("?")[0];
function noteError({ status, method, path, message }) {
  errors.push({ at: new Date().toISOString(), status, method, path: mask(path), message: String(message || "").slice(0, 300) });
  if (errors.length > 100) errors.shift();
  if (status >= 500) alert(`${status} ${method} ${mask(path)}: ${message}`);
}

// Optional alert: if ALERT_WEBHOOK_URL is set (Slack, Discord, ntfy.sh, etc.),
// a server error posts one short line there, at most once every 15 minutes.
let lastAlert = 0;
function alert(line) {
  const url = process.env.ALERT_WEBHOOK_URL;
  const now = Date.now();
  if (!url || now - lastAlert < 15 * 60 * 1000) return;
  lastAlert = now;
  const text = `[Merc Lab DMS] ${line}`.slice(0, 500);
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, content: text }) }).catch(() => {});
}

// Logs every server error and slow request in one line (Render keeps these logs).
function requestLog(req, res, next) {
  const t0 = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - t0;
    if (res.statusCode >= 500) {
      console.error(`[http] ${res.statusCode} ${req.method} ${mask(req.originalUrl)} ${ms}ms`);
      noteError({ status: res.statusCode, method: req.method, path: req.originalUrl, message: res.locals.errorMessage || "server error" });
    } else if (ms > 8000) console.warn(`[http] slow ${req.method} ${mask(req.originalUrl)} ${ms}ms`);
  });
  next();
}

// ---------- friendly pages ----------
const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function page(title, text) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escHtml(title)} · The Merc Lab</title>
<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;background:#f4f4f2;color:#1b1b1b;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}.b{background:#fff;border-radius:14px;padding:28px 24px;max-width:420px;box-shadow:0 1px 3px rgba(0,0,0,.08)}h1{font-size:20px;margin:0 0 8px}p{margin:0;line-height:1.5;color:#444}.m{font-size:12px;letter-spacing:.12em;color:#888;margin-bottom:14px}</style></head>
<body><div class="b"><div class="m">THE MERC LAB</div><h1>${escHtml(title)}</h1><p>${escHtml(text)}</p></div></body></html>`;
}

function notFound(req, res) {
  if (req.originalUrl.startsWith("/api")) return res.status(404).json({ error: "Not found." });
  res.status(404).send(page("Page not found", "This link is not right or is no longer available. Please check the link, or contact the workshop."));
}

// Last stop for any error: never shows code details to the visitor.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const bodyError = err.type === "entity.parse.failed" || err.type === "entity.too.large";
  const code = bodyError ? (err.type === "entity.too.large" ? 413 : 400) : status >= 400 && status < 600 ? status : 500;
  if (code >= 500) {
    console.error("[error]", err.stack || err.message);
    res.locals.errorMessage = err.message;
  }
  if (res.headersSent) return;
  const msg = code === 413 ? "That is too large to send." : code === 400 ? "The request was not readable. Please try again." : "Something went wrong on our side. Please try again in a minute.";
  if (req.originalUrl.startsWith("/api") || req.method !== "GET") return res.status(code).json({ error: msg });
  res.status(code).send(page("Something went wrong", "This page cannot be shown right now. Please try again in a minute, or contact the workshop."));
}

// ---------- health ----------
// /health: is the server up (Render uses it to restart a stuck server).
// /health?deep=1: also checks the database. The answer is kept 60 s, so the
// check cannot be used to flood the database.
let deepCache = null;
async function health(req, res) {
  if (!req.query.deep) return res.json({ ok: true });
  const now = Date.now();
  if (!deepCache || now - deepCache.at > 60 * 1000) {
    const t0 = Date.now();
    let dbOk = true;
    try {
      await db.ping();
    } catch {
      dbOk = false;
    }
    const hourAgo = new Date(now - 3600e3).toISOString();
    deepCache = { at: now, body: { ok: dbOk, database: dbOk ? "ok" : "down", databaseMs: Date.now() - t0, serverErrorsLastHour: errors.filter((e) => e.status >= 500 && e.at >= hourAgo).length, version } };
  }
  res.status(deepCache.body.ok ? 200 : 503).json(deepCache.body);
}

// ---------- logged-in routes: system status and backup ----------
function register(router, { wrap }) {
  router.get("/system", wrap(async (req, res) => {
    let dbOk = true;
    let dbMs = 0;
    const t0 = Date.now();
    try {
      await db.ping();
    } catch {
      dbOk = false;
    }
    dbMs = Date.now() - t0;
    res.json({ version, startedAt, database: dbOk ? "ok" : "down", databaseMs: dbMs, alerts: !!process.env.ALERT_WEBHOOK_URL, errors: errors.slice().reverse() });
  }));

  // Every table as one JSON file. Keep it somewhere safe; it holds customer data.
  router.get("/backup", wrap(async (req, res) => {
    const out = { madeAt: new Date().toISOString(), version, tables: {} };
    for (const t of Object.keys(db.TABLES)) {
      out.tables[t] = (await db.list(t)).map((r) => ({ id: r.id, fields: r.fields }));
    }
    const day = out.madeAt.slice(0, 10);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="merclab-dms-backup-${day}.json"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(JSON.stringify(out, null, 1));
  }));
}

function _reset() {
  errors.length = 0;
  deepCache = null;
  lastAlert = 0;
  for (const l of [apiLimit, aiLimit, docLimit]) l._hits.clear();
}

module.exports = { limiter, apiLimit, aiLimit, docLimit, requestLog, notFound, errorHandler, health, register, noteError, errors, page, mask, _reset };
