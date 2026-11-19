// End-to-end tests of the DMS flow with an in-memory database and a fake AI.
// Run: npm test

const test = require("node:test");
const assert = require("node:assert/strict");

process.env.APP_PASSWORD = "test-pass";
process.env.SESSION_SECRET = "test-secret";

const db = require("../server/airtable");
const ai = require("../server/ai");
const P = require("../server/pricing");
const { createApp } = require("../server/index");
const { rankMatches } = require("../server/routes");

// ---------- fake Airtable ----------
const store = {};
let seq = 0;
const newId = () => "rec" + String(++seq).padStart(14, "0");
const uploads = [];
function reset() {
  for (const t of Object.keys(db.TABLES)) store[t] = [];
  uploads.length = 0;
  store.settings.push({ id: newId(), fields: { Key: "main", "Workshop name": "The Merc Lab", "Markup percent": 30, "Round to": 1, "Quote valid days": 14, "Bank account no": "1234567890", "Bank name": "Maybank", "Bank account name": "The Merc Lab" } });
}
db.list = async (t) => store[t].map((r) => ({ id: r.id, fields: { ...r.fields } }));
db.get = async (t, id) => {
  const r = store[t].find((x) => x.id === id);
  if (!r) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
  return { id: r.id, fields: { ...r.fields } };
};
db.create = async (t, list) => list.map((fields) => {
  const r = { id: newId(), fields: { ...fields } };
  store[t].push(r);
  return { id: r.id, fields: { ...r.fields } };
});
db.update = async (t, ups) => ups.map((u) => {
  const r = store[t].find((x) => x.id === u.id);
  Object.assign(r.fields, u.fields);
  return { id: r.id, fields: { ...r.fields } };
});
db.upload = async (key, id, file) => { uploads.push({ key, id, file }); return true; };

// ---------- fake AI ----------
let aiReply = null;
let aiError = null;
ai.callGemini = async () => {
  if (aiError) throw aiError;
  return JSON.parse(JSON.stringify(aiReply));
};

// ---------- tiny HTTP client ----------
let server;
let base;
let cookie = "";
test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function call(method, path, { body, file, data, noAuth } = {}) {
  const headers = {};
  if (cookie && !noAuth) headers.cookie = cookie;
  let payload;
  if (file || data) {
    const fd = new FormData();
    if (file) fd.append("file", new Blob([file.content || "x"], { type: file.type }), file.name || "slip.jpg");
    if (data) fd.append("data", JSON.stringify(data));
    payload = fd;
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(base + path, { method, headers, body: payload });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, body: json, text };
}

async function login() {
  cookie = "";
  const r = await call("POST", "/api/login", { body: { password: "test-pass" } });
  assert.equal(r.status, 200);
}

// ================= pricing =================

test("selling price = cost + markup, rounded up", () => {
  assert.equal(P.sellingPrice(100, 30, 0), 130);
  assert.equal(P.sellingPrice(100, 30, 1), 130); // exact stays exact
  assert.equal(P.sellingPrice(45.5, 30, 1), 60); // 59.15 → 60
  assert.equal(P.sellingPrice(45.5, 30, 0.1), 59.2);
  assert.equal(P.sellingPrice(12, 25, 5), 15);
  assert.equal(P.sellingPrice(-1, 30, 1), null);
});

test("running numbers per month", () => {
  assert.equal(P.nextNumber("Q", [], "2026-11-19"), "Q-2611-001");
  assert.equal(P.nextNumber("Q", ["Q-2611-001", "Q-2611-009", "Q-2610-050"], "2026-11-19"), "Q-2611-010");
  assert.equal(P.nextNumber("R", ["Q-2611-004"], "2026-12-01"), "R-2612-001");
});

test("WhatsApp phone format", () => {
  assert.equal(P.waPhone("012-345 6789"), "60123456789");
  assert.equal(P.waPhone("+60 11-2345 6789"), "601123456789");
  assert.equal(P.waPhone("abc"), "");
});

test("payment state", () => {
  assert.deepEqual(P.paymentState(500, 200), { paid: 200, balance: 300, status: "Part paid" });
  assert.deepEqual(P.paymentState(500, 500), { paid: 500, balance: 0, status: "Paid" });
});

// ================= AI cleaning =================

test("purchase AI answer is cleaned", () => {
  const out = ai.cleanPurchase({
    supplier: "  Auto Parts Sdn Bhd ",
    date: "2099-01-01", // future → dropped
    total: "RM 150.00",
    items: [
      { name: "Oil filter", qty: 2, unitPrice: null, amount: 50 },
      { name: "", qty: 1, unitPrice: 5 }, // no name → dropped
      { name: "Engine oil 5W40", qty: 0, unitPrice: 100 }, // qty 0 → 1
      { name: "Wiper", qty: 1, unitPrice: -3 }, // negative → null cost
    ],
  }, "2026-11-19");
  assert.equal(out.supplier, "Auto Parts Sdn Bhd");
  assert.equal(out.date, null);
  assert.equal(out.total, 150);
  assert.equal(out.items.length, 3);
  assert.equal(out.items[0].unitCost, 25);
  assert.equal(out.items[1].qty, 1);
  assert.equal(out.items[2].unitCost, null);
  assert.equal(ai.cleanDate("2026-02-30", "2026-11-19"), null);
  assert.equal(ai.cleanDate("2026-11-18", "2026-11-19"), "2026-11-18");
});

test("payment AI answer is cleaned", () => {
  const out = ai.cleanPayment({ amount: -5, method: "Crypto", date: "2026-11-18", payerName: "ALI BIN AHMAD" }, "2026-11-19");
  assert.equal(out.amount, null);
  assert.equal(out.method, "Bank transfer");
  assert.equal(out.payerName, "ALI BIN AHMAD");
});

// ================= login =================

test("API needs login; wrong password refused", async () => {
  reset();
  cookie = "";
  assert.equal((await call("GET", "/api/parts")).status, 401);
  assert.equal((await call("POST", "/api/login", { body: { password: "nope" } })).status, 401);
  await login();
  assert.equal((await call("GET", "/api/parts")).status, 200);
});

// ================= full flow =================

test("receipt → parts → quotation → payment → receipt", async () => {
  reset();
  await login();

  // 1. Supplier receipt read by AI, prices suggested with 30% markup, round up RM1.
  aiReply = { supplier: "Auto Parts KL", date: "2026-11-18", receiptNo: "INV-77", total: 140, items: [
    { name: "Oil filter", partNo: "A2761800009", brand: "Mann", qty: 2, unitPrice: 20, amount: 40 },
    { name: "Engine oil 5W40 1L", qty: 5, unitPrice: 20, amount: 100 },
  ] };
  aiError = null;
  const ex = await call("POST", "/api/purchases/extract", { file: { type: "image/jpeg" } });
  assert.equal(ex.status, 200);
  assert.equal(ex.body.suggestion.items[0].sellingPrice, 26);
  assert.equal(ex.body.suggestion.items[0].markupPercent, 30);
  assert.equal(store.purchases.length, 0, "extract saves nothing");

  // Owner changes the oil markup to 50% and leaves selling price empty → recalculated.
  const items = ex.body.suggestion.items.map((i) => ({ ...i }));
  items[1].markupPercent = 50;
  items[1].sellingPrice = "";
  const sv = await call("POST", "/api/purchases", { file: { type: "image/jpeg", name: "inv77.jpg" }, data: { supplier: "Auto Parts KL", date: "2026-11-18", receiptNo: "INV-77", total: 140, items } });
  assert.equal(sv.status, 201);
  assert.equal(sv.body.ref, "P-2611-001");
  assert.equal(sv.body.parts.length, 2);
  assert.equal(sv.body.parts[1].sellingPrice, 30);
  assert.equal(store.parts[0].fields["Qty left"], 2);
  assert.equal(uploads[0].key, "purchaseReceipt");

  const filter = store.parts[0].id;
  const oil = store.parts[1].id;

  // 2. Quotation with 1 filter, 4 oil, labour, discount.
  const q = await call("POST", "/api/quotes", { body: {
    customerName: "Ali Ahmad", phone: "012-345 6789", car: "C200 W205", plate: "wxy 1234", discount: 10,
    items: [
      { type: "part", partId: filter, description: "Mann Oil filter", qty: 1, unitPrice: 26 },
      { type: "part", partId: oil, description: "Engine oil 5W40 1L", qty: 4, unitPrice: 30 },
      { type: "labour", description: "Service labour", qty: 1, unitPrice: 80 },
      { type: "other", description: "", qty: 1, unitPrice: 5 }, // empty → dropped
    ],
  } });
  assert.equal(q.status, 201);
  assert.equal(q.body.quoteNo, `Q-${P.todayKL().slice(2, 4)}${P.todayKL().slice(5, 7)}-001`);
  assert.equal(q.body.subtotal, 226);
  assert.equal(q.body.total, 216);
  assert.equal(q.body.plate, "WXY 1234");
  assert.equal(store.customers.length, 1);
  assert.match(q.body.token, /^q[a-f0-9]{32}$/);

  // Client page opens without login and shows bank details.
  cookie = cookie; // keep
  const page = await call("GET", `/d/${q.body.token}`, { noAuth: true });
  assert.equal(page.status, 200);
  assert.match(page.text, /QUOTATION/);
  assert.match(page.text, /RM 216\.00/);
  assert.match(page.text, /1234567890/);
  assert.equal((await call("GET", "/d/qdeadbeef", { noAuth: true })).status, 404);

  // 3. Payment slip: deposit RM100 with the quote number in the note.
  aiReply = { amount: 100, date: "2026-11-19", reference: "MBB123", payerName: "ALI BIN AHMAD", recipientNote: q.body.quoteNo, method: "DuitNow" };
  const pe = await call("POST", "/api/payments/extract", { file: { type: "image/png" } });
  assert.equal(pe.status, 200);
  assert.equal(pe.body.matches[0].id, q.body.id);
  assert.ok(pe.body.matches[0].why.includes("quote no in payment note"));

  const pay1 = await call("POST", "/api/payments", { file: { type: "image/png" }, data: { quoteId: q.body.id, amount: 100, paidOn: "2026-11-19", method: "DuitNow", reference: "MBB123", payerName: "ALI BIN AHMAD" } });
  assert.equal(pay1.status, 201);
  assert.equal(pay1.body.payment.receiptNo, "R-2611-001");
  assert.equal(pay1.body.quote.status, "Part paid");
  assert.equal(pay1.body.quote.balance, 116);
  // Stock taken once, on the first payment.
  assert.equal(store.parts.find((p) => p.id === filter).fields["Qty left"], 1);
  assert.equal(store.parts.find((p) => p.id === oil).fields["Qty left"], 1);

  // Same slip twice → refused.
  const dup = await call("POST", "/api/payments", { data: { quoteId: q.body.id, amount: 100, reference: "mbb123" } });
  assert.equal(dup.status, 400);
  assert.match(dup.body.error, /already recorded/);

  // More than the balance → refused.
  const over = await call("POST", "/api/payments", { data: { quoteId: q.body.id, amount: 200, method: "Cash" } });
  assert.equal(over.status, 400);

  // Cash balance → Paid, stock not taken again.
  const pay2 = await call("POST", "/api/payments", { data: { quoteId: q.body.id, amount: 116, method: "Cash" } });
  assert.equal(pay2.status, 201);
  assert.equal(pay2.body.quote.status, "Paid");
  assert.equal(pay2.body.payment.receiptNo, `R-${P.todayKL().slice(2, 4)}${P.todayKL().slice(5, 7)}-${P.todayKL().slice(5, 7) === "11" ? "002" : "001"}`);
  assert.equal(store.parts.find((p) => p.id === oil).fields["Qty left"], 1);

  // Receipt page.
  const rp = await call("GET", `/d/${pay2.body.payment.token}`, { noAuth: true });
  assert.equal(rp.status, 200);
  assert.match(rp.text, /RECEIPT/);
  assert.match(rp.text, /PAID IN FULL/);

  // Paid quotation cannot be cancelled.
  const cx = await call("POST", `/api/quotes/${q.body.id}/status`, { body: { status: "Cancelled" } });
  assert.equal(cx.status, 400);
});

test("AI failure gives a clear message and saves nothing", async () => {
  reset();
  await login();
  aiError = Object.assign(new Error("The AI could not read this file. Try a clearer photo, or fill in the form by hand."), { status: 502 });
  const r = await call("POST", "/api/purchases/extract", { file: { type: "image/jpeg" } });
  assert.equal(r.status, 502);
  assert.match(r.body.error, /by hand/);
  assert.equal(store.purchases.length, 0);
  aiError = null;
});

test("wrong file type and missing data are refused", async () => {
  reset();
  await login();
  const r = await call("POST", "/api/purchases/extract", { file: { type: "text/plain", name: "a.txt" } });
  assert.equal(r.status, 400);
  const q = await call("POST", "/api/quotes", { body: { customerName: "", items: [] } });
  assert.equal(q.status, 400);
  const p = await call("POST", "/api/payments", { data: { quoteId: "nope", amount: 5 } });
  assert.equal(p.status, 400);
});

test("client pages escape text (no script injection)", async () => {
  reset();
  await login();
  const q = await call("POST", "/api/quotes", { body: { customerName: "<script>alert(1)</script>", items: [{ type: "labour", description: "<img src=x onerror=alert(1)>", qty: 1, unitPrice: 10 }] } });
  const page = await call("GET", `/d/${q.body.token}`, { noAuth: true });
  assert.ok(!page.text.includes("<script>alert"));
  assert.ok(!page.text.includes("<img src=x"));
});

test("settings update and markup example", async () => {
  reset();
  await login();
  const r = await call("PUT", "/api/settings", { body: { markupPercent: "40", roundTo: "0.5", workshopName: "The Merc Lab" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.markupPercent, 40);
  assert.equal(r.body.roundTo, 0.5);
  const bad = await call("PUT", "/api/settings", { body: { markupPercent: "abc" } });
  assert.equal(bad.status, 400);
});

test("matching ranks by amount and payer name", () => {
  const quotes = [
    { id: "a", quoteNo: "Q-2611-001", customerName: "Ali Ahmad", plate: "", total: 300, balance: 300, status: "Sent" },
    { id: "b", quoteNo: "Q-2611-002", customerName: "Siti Aminah", plate: "", total: 150, balance: 150, status: "Sent" },
    { id: "c", quoteNo: "Q-2611-003", customerName: "Old", plate: "", total: 150, balance: 0, status: "Paid" },
  ];
  const m = rankMatches(quotes, { amount: 150, payerName: "SITI AMINAH BINTI ABU" });
  assert.equal(m[0].id, "b");
  assert.equal(m.length, 2, "paid quotes are not offered");
});
