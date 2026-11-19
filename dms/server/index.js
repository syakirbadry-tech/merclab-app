// The Merc Lab DMS server.
// Env: AIRTABLE_BASE_ID, AIRTABLE_PAT, GEMINI_API_KEY, APP_PASSWORD,
//      SESSION_SECRET (optional), PORT.

const path = require("path");
const express = require("express");
const auth = require("./auth");
const { router } = require("./routes");
const { docRoute } = require("./docs");

function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.use(express.json({ limit: "200kb" }));

  app.get("/health", (req, res) => res.json({ ok: true }));

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

  app.use("/api", auth.requireLogin, router);
  app.get("/d/:token", docRoute);

  app.use(express.static(path.join(__dirname, "..", "public"), { etag: true, maxAge: 0 }));
  return app;
}

if (require.main === module) {
  if (!process.env.APP_PASSWORD) console.warn("[dms] APP_PASSWORD is not set: nobody can log in.");
  const port = process.env.PORT || 3000;
  createApp().listen(port, () => console.log(`[dms] listening on ${port}`));
}

module.exports = { createApp };
