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
  const field = { vehiclePhoto: "Photo", conditionPhotos: "Condition photos", jobPhotos: "Job photos" }[key];
  if (field) {
    const r = store[key === "jobPhotos" ? "quotes" : "vehicles"].find((x) => x.id === id);
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

// ================= workshop pack =================
test("discount comes off before tax and prints on the document", () => {
  const groups = M.cleanGroups(clone(reference.groups));
  const t = M.computeTotals(groups, { discount: "83.45" });
  assert.equal(t.gross, 238345);
  assert.equal(t.discount, 8345);
  assert.equal(t.grand, 230000);
  const html = T.render({ ...clone(reference), type: "estimate", groups, discount: 83.45 }, company, { screen: false });
  assert.match(html, /Less Discount/);
  assert.match(html, /2,300\.00/);
});

test("packages, fault cases, check-in, inspection report, online approval", async () => {
  reset();
  await login();
  // Packages
  assert.equal((await call("POST", "/api/packages", { body: { name: "Service B", request: "x", lines: [] } })).status, 400);
  const pk = await call("POST", "/api/packages", { body: { name: "Service B", request: "to perform service b", setsService: true, lines: [{ type: "labour", description: "Perform Service B", amount: "200" }, { type: "part", description: "Oil filter", qty: 1, unitPrice: "26" }] } });
  assert.equal(pk.status, 201);
  assert.equal(pk.body.request, "TO PERFORM SERVICE B");
  assert.equal(pk.body.lines.length, 2);
  assert.equal(pk.body.active, true);
  const pk2 = await call("PATCH", `/api/packages/${pk.body.id}`, { body: { active: false } });
  assert.equal(pk2.body.active, false);
  assert.equal((await call("GET", "/api/packages")).body.packages.length, 1);

  // Job with a discount; too big a discount is refused.
  assert.equal((await call("POST", "/api/jobs", { body: jobBody(["", ""], { discount: "9999" }) })).status, 400);
  const est = await call("POST", "/api/jobs", { body: jobBody(["", ""], { discount: "26" }) });
  assert.equal(est.status, 201);
  assert.equal(est.body.job.total, 350);
  const id = est.body.job.id;

  // Fault case
  assert.equal((await call("POST", "/api/faults", { body: { makeModel: "C200" } })).status, 400);
  const fc = await call("POST", "/api/faults", { body: { jobId: id, plate: "WXY 1234", makeModel: "C200 W205", symptom: "Coolant level drops\nno visible leak", codes: "P0128", cause: "Water pump weep", fix: "Replaced water pump", mileageKm: "85210", hours: "2.5", verified: true } });
  assert.equal(fc.status, 201);
  assert.equal(fc.body.title, "C200 W205: Coolant level drops");
  assert.equal(fc.body.plateKey, "WXY1234");
  assert.equal(fc.body.hours, 2.5);
  assert.equal((await call("GET", "/api/faults")).body.faults.length, 1);

  // Check-in with an odometer photo
  const ci = await call("POST", `/api/jobs/${id}/checkin`, { file: { type: "image/jpeg" }, data: { fuel: "1/2", items: "Child seat", keys: "2 keys" } });
  assert.equal(ci.status, 200);
  assert.equal(ci.body.checkin.fuel, "1/2");
  assert.ok(ci.body.photos[ci.body.checkin.odoPhotoId]);

  // Inspection: photo, then the checklist; a client page with no prices.
  const ph = await call("POST", `/api/jobs/${id}/photo`, { file: { type: "image/jpeg" } });
  assert.equal(ph.status, 201);
  const ins = await call("PUT", `/api/jobs/${id}/inspection`, { body: { summary: "Front pads low.", items: [
    { key: "pads_f", group: "Brakes", label: "Front brake pads", status: "now", value: "2 mm", note: "Replace now", photoIds: [ph.body.id, "bogus"] },
    { key: "tyre_fl", group: "Tyres", label: "Tyre front left", status: "ok", value: "6 mm" },
    { key: "wipers", group: "Other", label: "Wipers", status: "na" },
    { key: "<bad>", label: "" },
  ] } });
  assert.equal(ins.status, 200);
  assert.equal(ins.body.inspection.items.length, 3);
  assert.deepEqual(ins.body.inspection.items[0].photoIds, [ph.body.id]);
  assert.match(ins.body.inspectionToken, /^h[a-f0-9]{32}$/);
  const page = await call("GET", `/d/${ins.body.inspectionToken}`, { noAuth: true });
  assert.equal(page.status, 200);
  assert.match(page.text, /Needs attention now \(1\)/);
  assert.match(page.text, /2 mm/);
  assert.doesNotMatch(page.text, /RM ?\d/);

  // Online approval from the estimate page.
  const estPage = await call("GET", `/d/${est.body.job.token}`, { noAuth: true });
  assert.match(estPage.text, /Approve estimate/);
  assert.match(estPage.text, /See the inspection report/);
  assert.equal((await call("POST", `/d/${est.body.job.token}/approve`, { noAuth: true, body: { name: "A" } })).status, 400);
  const ap = await call("POST", `/d/${est.body.job.token}/approve`, { noAuth: true, body: { name: "Ali Ahmad" } });
  assert.equal(ap.status, 200);
  const j = (await call("GET", `/api/jobs/${id}`)).body;
  assert.equal(j.approvedName, "Ali Ahmad");
  assert.equal(j.stage, "In workshop");
  assert.match((await call("GET", `/d/${est.body.job.token}`, { noAuth: true })).text, /Approved by Ali Ahmad/);
  assert.equal((await call("POST", `/d/q${"0".repeat(32)}/approve`, { noAuth: true, body: { name: "X Y" } })).status, 404);
});

// ================= CRM =================
test("CRM: customer details, contact log with follow-up, bookings, next service on invoice", async () => {
  reset();
  await login();
  const c = await call("POST", "/api/customers", { body: { name: "Mei Ling", phone: "016-1112222", type: "Lead", source: "Threads", tags: "W213, VIP", nextFollowUp: "2026-12-01", followUpNote: "Call about brake job" } });
  assert.equal(c.status, 201);
  assert.equal(c.body.type, "Lead");
  assert.equal(c.body.source, "Threads");
  assert.equal(c.body.nextFollowUp, "2026-12-01");
  const odd = await call("PATCH", `/api/customers/${c.body.id}`, { body: { source: "Pigeon" } });
  assert.equal(odd.body.source, "");

  // Contact log; it can move the follow-up date or clear it.
  assert.equal((await call("POST", "/api/interactions", { body: { customerId: c.body.id, type: "Note", note: "" } })).status, 400);
  const ia = await call("POST", "/api/interactions", { body: { customerId: c.body.id, type: "WhatsApp", note: "Sent price for pads", nextFollowUp: "2026-12-05", followUpNote: "Check if she agrees" } });
  assert.equal(ia.status, 201);
  assert.equal(ia.body.interaction.customerName, "Mei Ling");
  assert.equal(ia.body.customer.nextFollowUp, "2026-12-05");
  const done = await call("POST", "/api/interactions", { body: { customerId: c.body.id, type: "Call", note: "Booked in", nextFollowUp: "" } });
  assert.equal(done.body.customer.nextFollowUp, "");
  assert.equal((await call("GET", "/api/interactions")).body.interactions.length, 2);

  // Bookings
  assert.equal((await call("POST", "/api/bookings", { body: { customerName: "Mei Ling" } })).status, 400);
  assert.equal((await call("POST", "/api/bookings", { body: { date: "2026-12-06", time: "9am", customerName: "Mei Ling" } })).status, 400);
  const bk = await call("POST", "/api/bookings", { body: { date: "2026-12-06", time: "09:30", customerId: c.body.id, customerName: "Mei Ling", plate: "vbe 5", work: "Front brake pads" } });
  assert.equal(bk.status, 201);
  assert.equal(bk.body.status, "Booked");
  assert.equal(bk.body.plate, "VBE 5");
  const arr = await call("PATCH", `/api/bookings/${bk.body.id}`, { body: { status: "Arrived" } });
  assert.equal(arr.body.status, "Arrived");
  assert.equal((await call("PATCH", `/api/bookings/${bk.body.id}`, { body: { status: "Gone" } })).status, 400);

  // Walk-in invoice with "set next service": +12 months and +10,000 km by default.
  const st = await call("PUT", "/api/settings", { body: { serviceIntervalKm: "15000" } });
  assert.equal(st.body.serviceIntervalKm, 15000);
  assert.equal(st.body.serviceIntervalMonths, 12);
  const inv = await call("POST", "/api/jobs", { body: { ...jobBody(["", ""]), asInvoice: true, nextService: true, repairDate: "2026-11-19" } });
  assert.equal(inv.status, 201);
  const v = store.vehicles.find((r) => r.fields["Plate key"] === "WXY1234").fields;
  assert.equal(v["Next service date"], "2027-11-19");
  assert.equal(v["Next service km"], 85210 + 15000);
  const rem = await call("PATCH", "/api/vehicles/WXY1234", { body: { lastReminded: "2026-11-19" } });
  assert.equal(rem.body.lastReminded, "2026-11-19");
  assert.equal(P.addMonths("2026-01-31", 1), "2026-02-28");
});

// ================= finance & stock =================
test("finance: expenses, credit notes with refund, suppliers owed, part orders, stock count, opening balances", async () => {
  reset();
  await login();
  // Expenses
  assert.equal((await call("POST", "/api/expenses", { data: { description: "Rent", amount: "1500", category: "Nope" } })).status, 400);
  const ex = await call("POST", "/api/expenses", { file: { type: "image/jpeg" }, data: { description: "Rent November", amount: "1,500", category: "Rent", date: "2026-11-01", paidTo: "Landlord" } });
  assert.equal(ex.status, 201);
  assert.equal(ex.body.expense.amount, 1500);
  assert.equal(uploads.at(-1).key, "expenseReceipt");
  assert.equal((await call("GET", "/api/expenses")).body.expenses.length, 1);

  // Credit notes: only on invoices; partial credit lowers the balance; credit after payment = refund.
  const est = await call("POST", "/api/jobs", { body: jobBody(["", ""]) });
  assert.equal((await call("POST", "/api/creditnotes", { body: { jobId: est.body.job.id, amount: "10", reason: "x" } })).status, 400);
  const inv = await call("POST", "/api/jobs", { body: { ...jobBody(["", ""]), asInvoice: true } });
  const id = inv.body.job.id; // total 376
  assert.equal((await call("POST", "/api/creditnotes", { body: { jobId: id, amount: "500", reason: "too much" } })).status, 400);
  assert.equal((await call("POST", "/api/creditnotes", { body: { jobId: id, amount: "26" } })).status, 400);
  const cn1 = await call("POST", "/api/creditnotes", { body: { jobId: id, amount: "26", reason: "Oil filter returned" } });
  assert.equal(cn1.status, 201);
  assert.match(cn1.body.creditnote.no, /^CN-\d{4}-00001$/);
  assert.equal(cn1.body.creditnote.refund, 0);
  assert.equal(cn1.body.job.balance, 350);
  // Pay the rest, then a goodwill credit of 50 → refund 50.
  const pay = await call("POST", "/api/payments", { data: { jobId: id, amount: "350", method: "Cash" } });
  assert.equal(pay.status, 201);
  assert.equal(pay.body.job.status, "Paid");
  const cn2 = await call("POST", "/api/creditnotes", { body: { jobId: id, amount: "50", reason: "Goodwill", refundMethod: "Cash" } });
  assert.equal(cn2.body.creditnote.refund, 50);
  assert.equal(cn2.body.job.credited, 76);
  assert.equal(cn2.body.job.balance, 0);
  const page = await call("GET", `/d/${cn2.body.creditnote.token}`, { noAuth: true });
  assert.match(page.text, /CREDIT NOTE/);
  assert.match(page.text, /Refunded to Customer/);

  // Suppliers and what you owe them.
  const sp = await call("POST", "/api/suppliers", { body: { name: "Auto Parts KL", termsDays: "30" } });
  assert.equal(sp.body.termsDays, 30);
  const pu = await call("POST", "/api/purchases", { data: { supplier: "Auto Parts KL", date: "2026-11-18", paid: false, dueDate: "2026-12-18", items: [{ name: "Pad set", qty: 1, unitCost: 210 }] } });
  assert.equal(pu.status, 201);
  let list = (await call("GET", "/api/purchases")).body.purchases;
  assert.equal(list[0].status, "Unpaid");
  assert.equal(list[0].dueDate, "2026-12-18");
  const paid = await call("PATCH", `/api/purchases/${list[0].id}`, { body: { status: "Paid", paidOn: "2026-11-25" } });
  assert.equal(paid.body.status, "Paid");
  assert.equal(paid.body.paidOn, "2026-11-25");

  // Part ordered for a job
  const po = await call("POST", "/api/partorders", { body: { part: "Water pump", supplier: "Auto Parts KL", jobId: id, docNo: inv.body.job.invoiceNo, plate: "wxy 1234", cost: "480", eta: "2026-11-22" } });
  assert.equal(po.status, 201);
  assert.equal(po.body.status, "Ordered");
  assert.equal(po.body.plate, "WXY 1234");
  assert.equal((await call("PATCH", `/api/partorders/${po.body.id}`, { body: { status: "Arrived" } })).body.status, "Arrived");

  // Stock count keeps a record of changes only.
  const partId = store.parts[0].id;
  const sc = await call("POST", "/api/stockcount", { body: { reason: "Monthly count", counts: [{ id: partId, qty: "0" }, { id: "recXXXXXXXXXXXXXX", qty: 3 }] } });
  assert.equal(sc.body.changed, 1);
  assert.equal(store.parts[0].fields["Qty left"], 0);
  const adj = (await call("GET", "/api/stockadjustments")).body.stockadjustments;
  assert.equal(adj.length, 1);
  assert.equal(adj[0].before, 1);

  // Opening balances for the balance sheet.
  const st = await call("PUT", "/api/settings", { body: { openingCash: "5000", openingDate: "2026-11-01", ownerCapital: "20000" } });
  assert.equal(st.body.openingCash, 5000);
  assert.equal(st.body.openingDate, "2026-11-01");
});

// ================= WhatsApp inbox =================
test("WhatsApp: only signed messages from the owner's number land in the Inbox, then save as a parts receipt", async () => {
  reset();
  const WA = require("../server/whatsapp");
  const crypto = require("crypto");
  // Feature is off until every key is set.
  assert.equal((await call("GET", "/wa/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1", { noAuth: true })).status, 404);
  Object.assign(process.env, { WA_TOKEN: "t", WA_PHONE_ID: "111", WA_APP_SECRET: "s3cret", WA_VERIFY_TOKEN: "verify-me", WA_ALLOWED: "60123456789" });
  const v = await call("GET", "/wa/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=4242", { noAuth: true });
  assert.equal(v.status, 200);
  assert.equal(v.text, "4242");
  assert.equal((await call("GET", "/wa/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1", { noAuth: true })).status, 403);

  const sent = [];
  WA.http.fetch = async (url, opts = {}) => {
    if (url.endsWith("/111/messages")) { sent.push(JSON.parse(opts.body)); return new Response("{}", { status: 200 }); }
    if (url.includes("/media-1")) return new Response(JSON.stringify({ url: "https://lookaside.test/file", mime_type: "image/jpeg", file_size: 5 }), { status: 200 });
    if (url === "https://lookaside.test/file") return new Response("jpegbytes", { status: 200 });
    return new Response("nope", { status: 404 });
  };
  aiError = null;
  aiReply = { supplier: "Auto Parts KL", date: "2026-11-18", receiptNo: "A1", total: 52, items: [{ name: "Oil filter", qty: 2, unitPrice: 26, amount: 52 }] };
  const post = async (payload, secret = "s3cret") => {
    const raw = JSON.stringify(payload);
    const sig = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
    const res = await fetch(base + "/wa/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig }, body: raw });
    await WA.lastJob;
    return res.status;
  };
  const msg = (from, id) => ({ entry: [{ changes: [{ value: { messages: [{ from, id, timestamp: "1763540000", type: "image", image: { id: "media-1", caption: "" } }] } }] }] });
  assert.equal(await post(msg("60123456789", "wamid.1"), "wrong"), 401);
  assert.equal(store.inbox.length, 0);
  assert.equal(await post(msg("60999999999", "wamid.2")), 200);
  assert.equal(store.inbox.length, 0, "stranger ignored");
  assert.equal(await post(msg("60123456789", "wamid.3")), 200);
  assert.equal(await post(msg("60123456789", "wamid.3")), 200); // Meta retry
  assert.equal(store.inbox.length, 1);
  assert.equal(store.inbox[0].fields.Kind, "Supplier bill");
  assert.match(store.inbox[0].fields.Summary, /Auto Parts KL · RM 52\.00/);
  assert.equal(uploads.at(-1).key, "inboxFile");
  assert.match(sent.at(-1).text.body, /Got it/);
  assert.equal(WA.kindOf("TNB bil"), "Expense");
  assert.equal(WA.kindOf("customer slip"), "Payment slip");

  // In the app: list, then save as parts receipt (once).
  await login();
  const ib = await call("GET", "/api/inbox");
  assert.equal(ib.body.whatsapp.enabled, true);
  const item = ib.body.inbox[0];
  assert.equal(item.suggestion.supplier, "Auto Parts KL");
  store.inbox[0].fields.File = [{ id: "attX", url: "https://files.test/bill.jpg", filename: "bill.jpg" }];
  const sv = await call("POST", "/api/purchases", { data: { inboxId: item.id, supplier: "Auto Parts KL", date: "2026-11-18", items: [{ name: "Oil filter", qty: 2, unitCost: 26 }] } });
  assert.equal(sv.status, 201);
  assert.equal(store.purchases[0].fields.Receipt[0].url, "https://files.test/bill.jpg");
  assert.equal(store.inbox[0].fields.Status, "Saved");
  assert.equal((await call("POST", "/api/purchases", { data: { inboxId: item.id, supplier: "x", items: [{ name: "a", qty: 1, unitCost: 1 }] } })).status, 400);
  for (const k of ["WA_TOKEN", "WA_PHONE_ID", "WA_APP_SECRET", "WA_VERIFY_TOKEN", "WA_ALLOWED"]) delete process.env[k];
});

// ================= import =================
test("import from old records: creates, links, and skips on a second run", async () => {
  reset();
  await login();
  const data = {
    version: 1, source: "test workbook",
    customers: [{ key: "ali", name: "Ali Ahmad", phone: "012-1112222", address: "Sungai Petani" }],
    vehicles: [{ plate: "abc 123", customerKey: "ali", chassisNo: "wdd2050421f123456" }],
    parts: [{ name: "Oil filter", partNo: "A 270 180 01 09", supplier: "SH PEN", qtyLeft: 3, unitCost: 50, sellingPrice: 100 }],
    packages: [{ name: "Service B", request: "To perform service B", lines: [{ type: "labour", description: "Service B", amount: 100 }] }],
    jobs: [{ invoiceNo: "100012", date: "2026-01-08", customerKey: "ali", plate: "ABC 123", discount: 10, total: 190,
      groups: [{ code: "C1", request: "WORK AS INVOICED", lines: [{ type: "part", description: "OIL FILTER", qty: 1, unitPrice: 100 }, { type: "labour", description: "SERVICE", amount: 100 }] }],
      payments: [{ date: "2026-01-08", amount: 100, method: "Cash", receiptNo: "" }] }],
    purchases: [{ date: "2026-01-01", supplier: "SH PEN", receiptNo: "CBT1", total: 150, items: ["3 x Oil filter"] }],
    expenses: [{ date: "2026-01-10", description: "Workshop equipment", category: "Tools & equipment (asset)", amount: 1194, method: "Other" }],
    settings: { registrationNo: "CA0000000-X" },
  };
  const file = { type: "application/json", name: "import.json", content: JSON.stringify(data) };
  assert.equal((await call("POST", "/api/import", { file: { type: "application/json", content: "{}" } })).status, 400);
  const r1 = await call("POST", "/api/import", { file });
  assert.equal(r1.status, 200);
  assert.deepEqual(r1.body.created, { customers: 1, vehicles: 1, parts: 1, packages: 1, invoices: 1, payments: 1, purchases: 1, expenses: 1 });
  const job = store.quotes[0].fields;
  assert.equal(job["Invoice no"], "100012");
  assert.equal(job.Total, 190);
  assert.equal(job.Balance, 90);
  assert.equal(job.Status, "Part paid");
  assert.equal(job["Customer record"], store.customers[0].id);
  assert.match(store.payments[0].fields["Receipt no"], /^OR-2026-00001$/);
  assert.equal(store.vehicles[0].fields["Plate key"], "ABC123");
  assert.equal(store.settings[0].fields["Registration no"], "CA0000000-X");
  const r2 = await call("POST", "/api/import", { file });
  assert.ok(Object.values(r2.body.created).every((n) => n === 0));
  assert.equal(r2.body.skipped.invoices, 1);
  assert.equal(store.quotes.length, 1);
});

test("import sets opening balances once, and the new 'Parts for jobs' cost type is accepted", async () => {
  reset();
  await login();
  const data = { version: 1, source: "t", settings: { openingDate: "2026-11-01", openingCash: 2453.17, ownerCapital: 0 },
    expenses: [{ date: "2026-10-31", description: "Parts paid to suppliers not in stock records", category: "Parts for jobs (no stock)", amount: 100 }] };
  const r = await call("POST", "/api/import", { file: { type: "application/json", content: JSON.stringify(data) } });
  assert.equal(r.status, 200);
  assert.equal(store.settings[0].fields["Opening date"], "2026-11-01");
  assert.equal(store.settings[0].fields["Opening cash"], 2453.17);
  assert.equal(store.expenses[0].fields.Category, "Parts for jobs (no stock)");
  data.settings.openingCash = 1;
  await call("POST", "/api/import", { file: { type: "application/json", content: JSON.stringify(data) } });
  assert.equal(store.settings[0].fields["Opening cash"], 2453.17, "not overwritten");
});
