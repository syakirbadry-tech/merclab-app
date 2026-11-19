// One owner login: a password set in APP_PASSWORD on the server.
// The session is a signed cookie (no database needed).

const crypto = require("crypto");

const COOKIE = "mldms";
const DAYS = 30;

function secret() {
  const s = process.env.SESSION_SECRET || process.env.APP_PASSWORD || "";
  return crypto.createHash("sha256").update("mldms:" + s).digest();
}

function sign(value) {
  return crypto.createHmac("sha256", secret()).update(value).digest("hex");
}

function makeToken(now = Date.now()) {
  const exp = String(now + DAYS * 86400 * 1000);
  return `${exp}.${sign(exp)}`;
}

function validToken(token, now = Date.now()) {
  if (typeof token !== "string") return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  const good = Buffer.from(sign(exp));
  const given = Buffer.from(sig);
  return good.length === given.length && crypto.timingSafeEqual(good, given);
}

function passwordOk(given) {
  const real = process.env.APP_PASSWORD;
  if (!real || typeof given !== "string") return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

function readCookie(req) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

function setCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${DAYS * 86400}${secure}`);
}

function clearCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

// Slow down password guessing: 8 wrong tries per 15 minutes per address.
const fails = new Map();
function tooManyFails(ip, now = Date.now()) {
  const f = fails.get(ip);
  return !!f && f.count >= 8 && now - f.first < 15 * 60 * 1000;
}
function noteFail(ip, now = Date.now()) {
  const f = fails.get(ip);
  if (!f || now - f.first >= 15 * 60 * 1000) fails.set(ip, { count: 1, first: now });
  else f.count += 1;
}

function requireLogin(req, res, next) {
  if (validToken(readCookie(req))) return next();
  res.status(401).json({ error: "Please log in." });
}

module.exports = { makeToken, validToken, passwordOk, readCookie, setCookie, clearCookie, tooManyFails, noteFail, requireLogin, _fails: fails };
