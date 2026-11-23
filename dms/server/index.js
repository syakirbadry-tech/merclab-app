// The Merc Lab DMS server.
// Env: AIRTABLE_BASE_ID, AIRTABLE_PAT, GEMINI_API_KEY, APP_PASSWORD,
//      SESSION_SECRET (optional), PORT.

const path = require("path");
const express = require("express");
const auth = require("./auth");
const { router } = require("./routes");
const { docRoute, approveRoute } = require("./docs");
const wa = require("./whatsapp");
const ops = require("./ops");

function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    // No other site may show our pages inside a frame (stops click tricks on the approve button).
    res.setHeader("X-Frame-Options", "DENY");
    if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=15552000");
    next();
  });
  app.use(ops.requestLog);
  // WhatsApp webhook needs the raw body to check Meta's signature.
  app.get("/wa/webhook", wa.verifyRoute);
  app.post("/wa/webhook", express.raw({ type: "*/*", limit: "1mb" }), wa.receiveRoute);
  app.use(express.json({ limit: "200kb" }));

  app.get("/health", ops.health);

  app.post("/api/login", (req, res) => {
    const ip = req.ip || "x";
    if (auth.tooManyFails(ip)) return res.status(429).json({ error: "Too many wrong tries. Wait 15 minutes." });
    if (!auth.passwordOk(req.body?.password)) {
      auth.noteFail(ip);
      return res.status(401).json({ error: "Wrong password." });
    }
    auth.setCookie(res, auth.makeToken());
    res.json({ ok: true });
  });
  app.post("/api/logout", (req, res) => {
    auth.clearCookie(res);
    res.json({ ok: true });
  });
  app.get("/api/me", (req, res) => res.json({ loggedIn: auth.validToken(auth.readCookie(req)) }));

  // AI reading costs money per call, so it has its own hourly limit.
  app.post(["/api/purchases/extract", "/api/payments/extract", "/api/expenses/extract", "/api/assistant/ask"], auth.requireLogin, ops.aiLimit);
  app.use("/api", auth.requireLogin, ops.apiLimit, router);
  app.get("/d/:token", ops.docLimit, docRoute);
  app.post("/d/:token/approve", ops.docLimit, (req, res, next) => (auth.tooManyFails("ap:" + (req.ip || "x")) ? res.status(429).json({ error: "Too many tries. Wait 15 minutes." }) : next()), approveRoute);

  // The app's own files are always re-checked, so an installed iPhone app picks up
  // every update on the next open instead of keeping an old copy.
  app.use(express.static(path.join(__dirname, "..", "public"), {
    etag: true,
    maxAge: 0,
    setHeaders: (res, file) => {
      if (/\.(html|js|css|json)$/.test(file)) res.setHeader("Cache-Control", "no-cache, must-revalidate");
    },
  }));
  app.use(ops.notFound);
  app.use(ops.errorHandler);
  return app;
}

if (require.main === module) {
  process.on("unhandledRejection", (err) => {
    console.error("[unhandled]", err?.stack || err);
    ops.noteError({ status: 500, method: "-", path: "background", message: err?.message || String(err) });
  });
  if (!process.env.APP_PASSWORD) console.warn("[dms] APP_PASSWORD is not set: nobody can log in.");
  const port = process.env.PORT || 3000;
  createApp().listen(port, () => console.log(`[dms] listening on ${port}`));
}

module.exports = { createApp };
