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
const M = require("../server/money");
const T = require("../server/template");
const company = require("../config/company.json");
const reference = require("./fixtures/reference-estimate.json");

// ---------- fake Airtable ----------
const store = {};
let seq = 0;
const newId = () => "rec" + String(++seq).padStart(14, "0");
const uploads = [];
function reset() {
  for (const t of Object.keys(db.TABLES)) store[t] = [];
  uploads.length = 0;
  store.settings.push({ id: newId(), fields: { Key: "main", "Legal name": "TNS Legacy", "Markup percent": 30, "Round to": 1, "Quote valid days": 7, "Bank account no": "1234567890", "Bank name": "Maybank", "Bank account name": "TNS Legacy" } });
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
db.upload = async (key, id, file) => {
  uploads.push({ key, id, file });
  const att = { id: "att" + String(++seq).padStart(14, "0"), url: `https://files.test/${key}/${seq}.jpg`, thumbnails: { small: { url: "https://files.test/s.jpg" }, large: { url: "https://files.test/l.jpg" } } };
  const field = { vehiclePhoto: "Photo", conditionPhotos: "Condition photos" }[key];
  if (field) {
    const r = store.vehicles.find((x) => x.id === id);
    r.fields[field] = [...(r.fields[field] || []), att];
  }
  return { attachment: att };
};

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


const Y = () => P.todayKL().slice(0, 4);
const clone = (o) => JSON.parse(JSON.stringify(o));
const SST_ON = { ...company, sstRegistrationNo: "W10-1234-56789012" };

// ================= pricing & numbering =================

test("selling price = cost + markup, rounded up", () => {
  assert.equal(P.sellingPrice(100, 30, 0), 130);
  assert.equal(P.sellingPrice(100, 30, 1), 130);
  assert.equal(P.sellingPrice(45.5, 30, 1), 60);
  assert.equal(P.sellingPrice(45.5, 30, 0.1), 59.2);
  assert.equal(P.sellingPrice(-1, 30, 1), null);
});

test("gap-free numbers per type per year", () => {
  assert.equal(P.nextNumber("EST", [], "2026-11-19"), "EST-2026-00001");
  assert.equal(P.nextNumber("INV", ["INV-2026-00001", "INV-2026-00009", "INV-2025-00050", ""], "2026-11-19"), "INV-2026-00010");
  assert.equal(P.nextNumber("OR", ["OR-2026-00004"], "2027-01-02"), "OR-2027-00001");
});

test("WhatsApp phone format", () => {
  assert.equal(P.waPhone("012-345 6789"), "60123456789");
  assert.equal(P.waPhone("abc"), "");
});

// ================= money (handover section 5) =================

test("money is in sen, formatted with separators", () => {
  assert.equal(M.toSen("96.30"), 9630);
  assert.equal(M.toSen(0.1), 10);
  assert.equal(M.toSen("1,234.5"), 123450);
  assert.equal(M.toSen("abc"), null);
  assert.equal(M.fmt(238345), "2,383.45");
  assert.equal(M.fmt(0), "0.00");
  assert.equal(M.roundTo5Sen(238342), 238340);
  assert.equal(M.roundTo5Sen(238343), 238345);
  assert.equal(M.roundTo5Sen(238348), 238350);
});

test("reference test case: not SST-registered", () => {
  const t = M.computeTotals(M.cleanGroups(reference.groups));
  assert.equal(M.fmt(t.parts), "1,623.70");
  assert.equal(M.fmt(t.labour), "759.75");
  assert.equal(M.fmt(t.subtotal), "2,383.45");
  assert.equal(t.tax, 0);
  assert.equal(M.fmt(t.grand), "2,383.45");
});

test("reference test case: SST switched on → 33.60 tax, 2,417.05", () => {
  const t = M.computeTotals(M.cleanGroups(reference.groups), { sst: { on: true, rate: 0.08 }, round5: true });
  assert.equal(M.fmt(t.taxable), "420.00");
  assert.equal(M.fmt(t.tax), "33.60");
  assert.equal(M.fmt(t.grand), "2,417.05");
  assert.equal(t.rounding, 0);
});

test("bad lines are refused with a clear message", () => {
  assert.throws(() => M.cleanGroups([{ lines: [{ type: "part", description: "X", qty: 0, unitPrice: 5 }] }]), /Quantity/);
  assert.throws(() => M.cleanGroups([{ lines: [{ type: "labour", description: "X", amount: "" }] }]), /Amount/);
  assert.throws(() => M.cleanGroups([{ request: "ONLY A REQUEST", lines: [] }]), /at least one/);
});

// ================= template (handover sections 4, 6, 10) =================

function doc(type, extra = {}) {
  const d = clone(reference);
  d.type = type;
  d.groups = M.cleanGroups(d.groups);
  return Object.assign(d, extra);
}

test("estimate renders on one A4 page with the reference totals", () => {
  const html = T.render(doc("estimate"), company, { screen: false });
  assert.equal((html.match(/class="page"/g) || []).length, 1);
  assert.match(html, /<h1>ESTIMATE<\/h1>/);
  assert.match(html, /Customer copy/);
  assert.match(html, /Grand Total \(RM\)<\/td><td[^>]*>2,383\.45/);
  assert.match(html, /Total Amount<\/td>/);
  assert.ok(!/Service Tax/.test(html));
  assert.ok(!/SST Registration/.test(html));
  assert.match(html, /valid for 7 days/);
  assert.match(html, /computer generated estimate/);
  assert.match(html, /The Merc Lab is a trading name of TNS Legacy/);
  assert.match(html, /Order Number/);
});

test("invoice: title INVOICE, due date, amount due; TAX INVOICE only with SST", () => {
  const d = doc("invoice", { number: "INV-2026-00001", repairDate: "2026-11-19", dueDate: "2026-11-26", amountDueSen: 238345 });
  const html = T.render(d, company, { screen: false });
  assert.match(html, /<h1>INVOICE<\/h1>/);
  assert.ok(!/TAX INVOICE/.test(html));
  assert.ok(!/Customer copy/.test(html));
  assert.match(html, /Due Date<\/div>/);
  assert.match(html, /26\/11\/2026/);
  assert.match(html, /Amount Due/);
  assert.match(html, /computer generated invoice/);

  const sst = T.render(doc("invoice", { number: "INV-2026-00001", repairDate: "2026-11-19" }), SST_ON, { screen: false });
  assert.match(sst, /<h1>TAX INVOICE<\/h1>/);
  assert.match(sst, /SST Registration No: W10-1234-56789012/);
  assert.match(sst, /Total Amount Exclusive of Service Tax/);
  assert.match(sst, /Service Tax @ 8%<\/td>.*?33\.60/s);
  assert.match(sst, /Total Amount Inclusive of Service Tax/);
  assert.match(sst, /2,417\.05/);
});

test("receipt: PAID watermark, payment received box, invoice no", () => {
  const d = doc("receipt", { number: "OR-2026-00001", invoiceNo: "INV-2026-00001", payment: { date: "2026-11-20", method: "DuitNow", reference: "MBB1", amount: 1000 }, balanceAfterSen: 138345 });
  const html = T.render(d, company, { screen: false });
  assert.match(html, /<h1>OFFICIAL RECEIPT<\/h1>/);
  assert.match(html, />PAID</);
  assert.match(html, /Payment Received/);
  assert.match(html, /Invoice No\./);
  assert.match(html, /Payment Date/);
  assert.match(html, /RM 1,000\.00/);
  assert.match(html, /RM 1,383\.45/);
  assert.match(html, /Received with thanks/);
  assert.match(html, /computer generated receipt/);
  const summary = T.render(clone(d), { ...company, receiptLineItems: "summary" }, { screen: false });
  assert.ok(!summary.includes("FUEL ADDITIVE"));
  assert.match(summary, /INVOICE INV-2026-00001/);
});

test("mileage 0 or empty blocks the document", () => {
  assert.throws(() => T.render(doc("estimate", { vehicle: { ...reference.vehicle, mileageKm: 0 } }), company), /Mileage/);
  assert.throws(() => T.render(doc("estimate", { vehicle: { ...reference.vehicle, mileageKm: "" } }), company), /Mileage/);
});

test("more than one page of lines flows to page 2 with Page x of y", () => {
  const lines = Array.from({ length: 30 }, (_, i) => ({ type: "part", description: `PART ${i + 1}`, qty: 1, unitPrice: 10 }));
  const d = doc("estimate", { groups: M.cleanGroups([{ request: "BIG JOB", lines }]) });
  const html = T.render(d, company, { screen: false });
  const pages = (html.match(/class="page"/g) || []).length;
  assert.equal(pages, 2);
  assert.match(html, />1 of 2</);
  assert.match(html, />2 of 2</);
  assert.match(html, /Continued on next page/);
  assert.equal((html.match(/Grand Total/g) || []).length, 1, "totals only on the last page");
  assert.equal((html.match(/<h1>ESTIMATE<\/h1>/g) || []).length, 2, "header repeated");
});

test("placeholders show when company details are missing", () => {
  const html = T.render(doc("estimate"), company, { screen: false });
  assert.match(html, /Hotline \[PHONE NO\.\]/);
  assert.match(html, /\[X\]-month parts warranty/);
});

// ================= AI cleaning =================

test("purchase AI answer is cleaned", () => {
  const out = ai.cleanPurchase({
    supplier: "  Auto Parts Sdn Bhd ", date: "2099-01-01", total: "RM 150.00",
    items: [{ name: "Oil filter", qty: 2, unitPrice: null, amount: 50 }, { name: "", qty: 1, unitPrice: 5 }, { name: "Engine oil", qty: 0, unitPrice: 100 }, { name: "Wiper", qty: 1, unitPrice: -3 }],
  }, "2026-11-19");
  assert.equal(out.supplier, "Auto Parts Sdn Bhd");
  assert.equal(out.date, null);
  assert.equal(out.total, 150);
  assert.equal(out.items.length, 3);
  assert.equal(out.items[0].unitCost, 25);
  assert.equal(out.items[2].unitCost, null);
});

test("payment AI answer is cleaned", () => {
  const out = ai.cleanPayment({ amount: -5, method: "Crypto", date: "2026-11-18", payerName: "ALI BIN AHMAD" }, "2026-11-19");
  assert.equal(out.amount, null);
  assert.equal(out.method, "Bank transfer");
});

// ================= login =================

test("API needs login; wrong password refused", async () => {
  reset();
  cookie = "";
  assert.equal((await call("GET", "/api/jobs")).status, 401);
  assert.equal((await call("POST", "/api/login", { body: { password: "nope" } })).status, 401);
  await login();
  assert.equal((await call("GET", "/api/jobs")).status, 200);
});

// ================= full flow =================

function jobBody(partIds, extra = {}) {
  return {
    customer: { name: "Ali Ahmad", phone: "012-345 6789", address: "12 Jalan Satu\n47000 Sungai Buloh, Selangor" },
    vehicle: { makeModel: "Mercedes-Benz C200 W205", regNo: "wxy 1234", mileageKm: "85,210", chassisNo: "wdd2050421f123456" },
    advisor: { name: "Kazumi", operatorId: "ML01" },
    groups: [
      { request: "to perform service b", lines: [
        { type: "sundry", description: "WORKSHOP CONSUMABLES - SUNDRIES", amount: "30" },
        { type: "part", partId: partIds[0], description: "MANN OIL FILTER", qty: 1, unitPrice: "26" },
        { type: "part", partId: partIds[1], description: "ENGINE OIL 5W40 1L", qty: 4, unitPrice: "30" },
        { type: "labour", opCode: "00115800", description: "Perform Service B", amount: "200" },
        { type: "labour", description: "", amount: "5" },
      ] },
      { request: "complimentary carwash", lines: [] },
    ],
    ...extra,
  };
}

test("receipt → parts → estimate → deposit → invoice → final payment → receipts", async () => {
  reset();
  await login();

  // 1. Supplier receipt (AI) → parts with 30% markup, rounded up to RM1.
  aiReply = { supplier: "Auto Parts KL", date: "2026-11-18", receiptNo: "INV-77", total: 140, items: [
    { name: "Oil filter", partNo: "A2761800009", brand: "Mann", qty: 2, unitPrice: 20, amount: 40 },
    { name: "Engine oil 5W40 1L", qty: 5, unitPrice: 20, amount: 100 },
  ] };
  aiError = null;
  const ex = await call("POST", "/api/purchases/extract", { file: { type: "image/jpeg" } });
  assert.equal(ex.status, 200);
  assert.equal(ex.body.suggestion.items[0].sellingPrice, 26);
  assert.equal(store.purchases.length, 0, "extract saves nothing");
  const sv = await call("POST", "/api/purchases", { file: { type: "image/jpeg" }, data: { supplier: "Auto Parts KL", date: "2026-11-18", total: 140, items: ex.body.suggestion.items } });
  assert.equal(sv.status, 201);
  assert.equal(sv.body.ref, "PUR-2026-00001");
  const [filter, oil] = store.parts.map((p) => p.id);

  // 2. Estimate: mileage is required.
  const noKm = await call("POST", "/api/jobs", { body: jobBody([filter, oil], { vehicle: { makeModel: "C200", mileageKm: "0" } }) });
  assert.equal(noKm.status, 400);
  assert.match(noKm.body.error, /Mileage/);

  const est = await call("POST", "/api/jobs", { body: jobBody([filter, oil]) });
  assert.equal(est.status, 201);
  const job = est.body.job;
  assert.equal(job.estimateNo, `EST-${Y()}-00001`);
  assert.equal(job.invoiceNo, "");
  assert.equal(job.total, 376); // 30 + 26 + 4×30 + 200
  assert.equal(job.plate, "WXY 1234");
  assert.equal(job.mileageKm, 85210);
  assert.equal(job.groups[0].request, "TO PERFORM SERVICE B");
  assert.equal(job.groups[0].lines.length, 4, "empty line ignored");
  assert.equal(store.parts.find((p) => p.id === filter).fields["Qty left"], 2, "estimate does not take stock");
  assert.equal(store.customers[0].fields.Address, "12 Jalan Satu\n47000 Sungai Buloh, Selangor");

  const estPage = await call("GET", `/d/${job.token}`, { noAuth: true });
  assert.equal(estPage.status, 200);
  assert.match(estPage.text, /<h1>ESTIMATE<\/h1>/);
  assert.match(estPage.text, /376\.00/);
  assert.match(estPage.text, /85,210/);
  assert.match(estPage.text, /TNS Legacy/);
  assert.match(estPage.text, /1234567890/);
  assert.equal((await call("GET", "/d/qdeadbeef", { noAuth: true })).status, 404);

  // 3. Deposit RM100 against the estimate (slip mentions the estimate no).
  aiReply = { amount: 100, date: "2026-11-19", reference: "MBB123", payerName: "ALI BIN AHMAD", recipientNote: job.estimateNo, method: "DuitNow" };
  const pe = await call("POST", "/api/payments/extract", { file: { type: "image/png" } });
  assert.equal(pe.body.matches[0].id, job.id);
  assert.ok(pe.body.matches[0].why.includes("document no in payment note"));
  const dep = await call("POST", "/api/payments", { file: { type: "image/png" }, data: { jobId: job.id, amount: "100", paidOn: "2026-11-19", method: "DuitNow", reference: "MBB123" } });
  assert.equal(dep.status, 201);
  assert.equal(dep.body.payment.receiptNo, "OR-2026-00001");
  assert.equal(dep.body.job.status, "Part paid");
  const dup = await call("POST", "/api/payments", { data: { jobId: job.id, amount: 100, reference: "mbb123" } });
  assert.equal(dup.status, 400);

  // 4. Work done → invoice. Final lines differ: one more litre of oil.
  const tooSmall = await call("POST", `/api/jobs/${job.id}/invoice`, { body: jobBody([filter, oil], { groups: [{ request: "X", lines: [{ type: "labour", description: "Check", amount: 50 }] }] }) });
  assert.equal(tooSmall.status, 400, "invoice cannot be below what was already paid");
  const finalBody = jobBody([filter, oil], { repairDate: "2026-11-20", dueDate: "2026-11-27" });
  finalBody.groups[0].lines[2].qty = 5;
  const inv = await call("POST", `/api/jobs/${job.id}/invoice`, { body: finalBody });
  assert.equal(inv.status, 200);
  const j2 = inv.body.job;
  assert.equal(j2.invoiceNo, `INV-${Y()}-00001`);
  assert.equal(j2.estimateNo, job.estimateNo);
  assert.equal(j2.total, 406);
  assert.equal(j2.paid, 100);
  assert.equal(j2.balance, 306);
  assert.equal(j2.estimateGroups[0].lines[2].qty, 4, "estimate lines kept");
  assert.equal(store.parts.find((p) => p.id === oil).fields["Qty left"], 0, "stock taken at invoice");
  assert.equal(store.parts.find((p) => p.id === filter).fields["Qty left"], 1);
  const again = await call("POST", `/api/jobs/${job.id}/invoice`, { body: finalBody });
  assert.equal(again.status, 400, "only one invoice per job");

  const invPage = await call("GET", `/d/${j2.invoiceToken}`, { noAuth: true });
  assert.match(invPage.text, /<h1>INVOICE<\/h1>/);
  assert.match(invPage.text, /406\.00/);
  assert.match(invPage.text, /RM 306\.00/, "amount due");
  assert.match(invPage.text, /27\/11\/2026/);
  // Estimate link still shows the estimate as it was.
  const estAgain = await call("GET", `/d/${job.token}`, { noAuth: true });
  assert.match(estAgain.text, /376\.00/);

  // 5. Over-payment refused, then the balance in cash.
  assert.equal((await call("POST", "/api/payments", { data: { jobId: job.id, amount: 400, method: "Cash" } })).status, 400);
  const last = await call("POST", "/api/payments", { data: { jobId: job.id, amount: 306, method: "Cash", paidOn: "2026-11-20" } });
  assert.equal(last.status, 201);
  assert.equal(last.body.job.status, "Paid");
  assert.equal(last.body.payment.receiptNo, "OR-2026-00002");

  // 6. Receipts: balance correct across partial payments, and the first
  //    receipt still shows the balance right after it.
  const r2 = await call("GET", `/d/${last.body.payment.token}`, { noAuth: true });
  assert.match(r2.text, /OFFICIAL RECEIPT/);
  assert.match(r2.text, /Invoice No\./);
  assert.match(r2.text, /RM 306\.00/);
  assert.match(r2.text, /Balance Outstanding<\/div><div[^>]*>RM 0\.00/);
  const r1 = await call("GET", `/d/${dep.body.payment.token}`, { noAuth: true });
  assert.match(r1.text, /Balance Outstanding<\/div><div[^>]*>RM 276\.00/);

  // Paid / invoiced jobs cannot be cancelled.
  assert.equal((await call("POST", `/api/jobs/${job.id}/status`, { body: { status: "Cancelled" } })).status, 400);
});

test("walk-in: straight to invoice takes stock and needs no estimate", async () => {
  reset();
  await login();
  store.parts.push({ id: "recPART0000000001", fields: { Part: "Wiper", "Qty left": 3, "Selling price": 40 } });
  const r = await call("POST", "/api/jobs", { body: { ...jobBody(["recPART0000000001", ""]), asInvoice: true } });
  assert.equal(r.status, 201);
  assert.equal(r.body.job.estimateNo, "");
  assert.match(r.body.job.invoiceNo, /^INV-\d{4}-00001$/);
  assert.equal(store.parts[0].fields["Qty left"], 2);
  const page = await call("GET", `/d/${r.body.job.invoiceToken}`, { noAuth: true });
  assert.match(page.text, /<h1>INVOICE<\/h1>/);
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
  assert.equal((await call("POST", "/api/purchases/extract", { file: { type: "text/plain", name: "a.txt" } })).status, 400);
  assert.equal((await call("POST", "/api/jobs", { body: { customer: { name: "" } } })).status, 400);
  assert.equal((await call("POST", "/api/payments", { data: { jobId: "nope", amount: 5 } })).status, 400);
});

test("client pages escape text (no script injection)", async () => {
  reset();
  await login();
  const b = jobBody(["", ""]);
  b.customer.name = "<script>alert(1)</script>";
  b.groups[0].lines[0].description = "<img src=x onerror=alert(1)>";
  const r = await call("POST", "/api/jobs", { body: b });
  const page = await call("GET", `/d/${r.body.job.token}`, { noAuth: true });
  assert.ok(!page.text.includes("<script>alert"));
  assert.ok(!page.text.includes("<img src=x"));
});

test("settings update; owner details print on documents", async () => {
  reset();
  await login();
  const r = await call("PUT", "/api/settings", { body: { markupPercent: "40", roundTo: "0.5", hotline: "012-000 0000", partsWarrantyMonths: "6", registrationNo: "202603123456" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.markupPercent, 40);
  assert.equal((await call("PUT", "/api/settings", { body: { markupPercent: "abc" } })).status, 400);
  const j = await call("POST", "/api/jobs", { body: jobBody(["", ""]) });
  const page = await call("GET", `/d/${j.body.job.token}`, { noAuth: true });
  assert.match(page.text, /Hotline 012-000 0000/);
  assert.match(page.text, /6-month parts warranty/);
  assert.match(page.text, /SSM Registration No: 202603123456/);
});

test("matching ranks by document no, amount and payer name", () => {
  const jobs = [
    { id: "a", estimateNo: "EST-2026-00001", invoiceNo: "", customerName: "Ali Ahmad", plate: "", total: 300, balance: 300, status: "Sent" },
    { id: "b", estimateNo: "EST-2026-00002", invoiceNo: "INV-2026-00001", customerName: "Siti Aminah", plate: "", total: 150, balance: 150, status: "Sent" },
    { id: "c", estimateNo: "EST-2026-00003", invoiceNo: "", customerName: "Old", plate: "", total: 150, balance: 0, status: "Paid" },
  ];
  const m = rankMatches(jobs, { amount: 150, payerName: "SITI AMINAH BINTI ABU" });
  assert.equal(m[0].id, "b");
  assert.equal(m.length, 2, "paid jobs are not offered");
  assert.equal(rankMatches(jobs, { amount: 1, recipientNote: "inv 2026 00001" })[0].id, "b");
});

// ================= vehicles, condition marks, stages, customers =================
test("car from a job → vehicle page data → edit, photo, body marks; stages; customers", async () => {
  reset();
  await login();

  // A job makes (or updates) the car's record.
  const est = await call("POST", "/api/jobs", { body: jobBody(["", ""]) });
  assert.equal(est.status, 201);
  assert.equal(est.body.job.stage, "Booked");
  assert.equal(store.vehicles.length, 1);
  assert.equal(store.vehicles[0].fields["Plate key"], "WXY1234");
  assert.equal(store.vehicles[0].fields["Mileage km"], 85210);

  let list = await call("GET", "/api/vehicles");
  assert.equal(list.status, 200);
  assert.equal(list.body.vehicles.length, 1);
  const v = list.body.vehicles[0];
  assert.equal(v.key, "WXY1234");
  assert.equal(v.ownerName, "Ali Ahmad");
  assert.equal(v.visits, 1);
  assert.equal(v.chassisNo, "WDD2050421F123456");

  // A car known only from an old job (no record) is still listed.
  store.quotes.push({ id: newId(), fields: { "Quote no": "EST-2025-00009", Date: "2025-03-01", "Customer name": "Siti", Plate: "BKL 77", Car: "E250", "Mileage km": 120000, Status: "Paid", Total: 100, Balance: 0 } });
  list = await call("GET", "/api/vehicles");
  const old = list.body.vehicles.find((x) => x.key === "BKL77");
  assert.ok(old && old.id === null && old.ownerName === "Siti" && old.mileageKm === 120000);

  // Edit makes the record; bad year is refused.
  const badYear = await call("PATCH", "/api/vehicles/BKL77", { body: { year: "19" } });
  assert.equal(badYear.status, 400);
  const ed = await call("PATCH", "/api/vehicles/bkl-77", { body: { year: "2016", fuel: "Diesel", nextServiceDate: "2026-12-01", chassisNo: "wdd123" } });
  assert.equal(ed.status, 200);
  assert.equal(ed.body.year, 2016);
  assert.equal(ed.body.chassisNo, "WDD123");
  assert.equal(store.vehicles.length, 2);

  // New car by hand; same plate twice is refused.
  const nv = await call("POST", "/api/vehicles", { body: { plate: "vbe 5", makeModel: "GLC 300" } });
  assert.equal(nv.status, 201);
  assert.equal(nv.body.plate, "VBE 5");
  assert.equal((await call("POST", "/api/vehicles", { body: { plate: "VBE5" } })).status, 409);

  // Photo.
  const ph = await call("POST", "/api/vehicles/WXY1234/photo", { file: { type: "image/jpeg" } });
  assert.equal(ph.status, 200);
  assert.equal(ph.body.photo, "https://files.test/l.jpg");
  assert.equal((await call("POST", "/api/vehicles/WXY1234/photo", { file: { type: "application/pdf", name: "x.pdf" } })).status, 400);

  // Body marks: spot must be on the picture.
  assert.equal((await call("POST", "/api/vehicles/WXY1234/marks", { data: { view: "front", x: 500, y: 10, kind: "dent" } })).status, 400);
  const mk = await call("POST", "/api/vehicles/WXY1234/marks", { file: { type: "image/jpeg" }, data: { view: "left", x: 100, y: 60, kind: "scratch", area: "Left front door", note: "10 cm", jobNo: est.body.job.estimateNo } });
  assert.equal(mk.status, 201);
  assert.equal(mk.body.photoSaved, true);
  const mark = mk.body.vehicle.marks[0];
  assert.equal(mark.kind, "scratch");
  assert.equal(mark.area, "Left front door");
  assert.match(mark.photo, /conditionPhotos/);
  assert.equal(mk.body.vehicle.openMarks, 1);
  const fx = await call("PATCH", `/api/vehicles/WXY1234/marks/${mark.id}`, { body: { fixed: true } });
  assert.equal(fx.body.marks[0].fixed, true);
  assert.equal(fx.body.openMarks, 0);
  const del = await call("DELETE", `/api/vehicles/WXY1234/marks/${mark.id}`);
  assert.equal(del.body.marks.length, 0);
  assert.equal((await call("DELETE", `/api/vehicles/WXY1234/marks/${mark.id}`)).status, 404);

  // Stages.
  assert.equal((await call("POST", `/api/jobs/${est.body.job.id}/stage`, { body: { stage: "Flying" } })).status, 400);
  const sg = await call("POST", `/api/jobs/${est.body.job.id}/stage`, { body: { stage: "In workshop" } });
  assert.equal(sg.body.stage, "In workshop");
  list = await call("GET", "/api/vehicles");
  assert.equal(list.body.vehicles.find((x) => x.key === "WXY1234").stage, "In workshop");
  const inv = await call("POST", `/api/jobs/${est.body.job.id}/invoice`, { body: jobBody(["", ""], { vehicle: { makeModel: "C200", regNo: "WXY 1234", mileageKm: "85300" } }) });
  assert.equal(inv.status, 200);
  assert.equal(inv.body.job.stage, "Ready");
  assert.equal(store.vehicles.find((r) => r.fields["Plate key"] === "WXY1234").fields["Mileage km"], 85300);

  // Customers: add, edit, bad email refused.
  assert.equal((await call("POST", "/api/customers", { body: { name: " " } })).status, 400);
  const c = await call("POST", "/api/customers", { body: { name: "Mei Ling", phone: "016-1112222", email: "mei@example.com" } });
  assert.equal(c.status, 201);
  assert.equal(c.body.email, "mei@example.com");
  assert.equal((await call("PATCH", `/api/customers/${c.body.id}`, { body: { email: "nope" } })).status, 400);
  const ce = await call("PATCH", `/api/customers/${c.body.id}`, { body: { notes: "Prefers WhatsApp" } });
  assert.equal(ce.body.notes, "Prefers WhatsApp");
  assert.equal(ce.body.name, "Mei Ling");
});
