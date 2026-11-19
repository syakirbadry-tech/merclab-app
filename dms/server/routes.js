// All /api routes. Flow:
//   1. Upload supplier receipt → AI reads it → owner checks → parts saved
//      with selling price = cost + markup.
//   2. Make a quotation from parts + labour → link to send to the client.
//   3. Upload payment slip → AI reads it → matched to the quotation →
//      payment recorded → receipt link for the client.

const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const db = require("./airtable");
const ai = require("./ai");
const P = require("./pricing");

const router = express.Router();

const FILE_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

function oneFile(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "File is too big (max 10 MB)." : "Could not read the file." });
    if (req.file && !FILE_TYPES.includes(req.file.mimetype)) return res.status(400).json({ error: "Please upload a photo (JPG/PNG) or a PDF." });
    next();
  });
}

const fileOf = (req) => (req.file ? { base64: req.file.buffer.toString("base64"), mimeType: req.file.mimetype === "image/jpg" ? "image/jpeg" : req.file.mimetype, filename: req.file.originalname || "file" } : null);

// The form data comes as a JSON string next to the file.
function bodyData(req) {
  if (typeof req.body?.data === "string") {
    try {
      return JSON.parse(req.body.data);
    } catch {
      return {};
    }
  }
  return req.body || {};
}

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error("[api]", err.message);
    res.status(err.status && err.status < 600 ? err.status : 500).json({ error: err.message || "Something went wrong." });
  });

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const isRec = (id) => /^rec[A-Za-z0-9]{14}$/.test(id || "");
const newToken = (kind) => kind + crypto.randomBytes(16).toString("hex");
const text = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// ---------- settings ----------

const SETTINGS_FIELDS = {
  workshopName: "Workshop name",
  address: "Address",
  phone: "Phone",
  email: "Email",
  registrationNo: "Registration no",
  bankName: "Bank name",
  bankAccountName: "Bank account name",
  bankAccountNo: "Bank account no",
  markupPercent: "Markup percent",
  roundTo: "Round to",
  quoteValidDays: "Quote valid days",
  quoteNotes: "Quote notes",
  receiptNotes: "Receipt notes",
};
const NUMERIC_SETTINGS = ["markupPercent", "roundTo", "quoteValidDays"];

async function loadSettings() {
  const rows = await db.list("settings");
  const row = rows.find((r) => r.fields.Key === "main") || rows[0];
  const s = { id: row ? row.id : null };
  for (const [k, f] of Object.entries(SETTINGS_FIELDS)) s[k] = row ? row.fields[f] ?? null : null;
  if (!(s.markupPercent >= 0)) s.markupPercent = 30;
  if (!(s.roundTo >= 0)) s.roundTo = 0;
  if (!(s.quoteValidDays > 0)) s.quoteValidDays = 14;
  return s;
}

router.get("/settings", wrap(async (req, res) => res.json(await loadSettings())));

router.put("/settings", wrap(async (req, res) => {
  const fields = {};
  for (const [k, f] of Object.entries(SETTINGS_FIELDS)) {
    if (!(k in req.body)) continue;
    if (NUMERIC_SETTINGS.includes(k)) {
      const n = Number(req.body[k]);
      if (!Number.isFinite(n) || n < 0 || n > 1000) throw bad(`${f} must be a number from 0 to 1000.`);
      fields[f] = n;
    } else fields[f] = text(req.body[k], 1000);
  }
  const s = await loadSettings();
  if (s.id) await db.update("settings", [{ id: s.id, fields }]);
  else await db.create("settings", [{ Key: "main", ...fields }]);
  res.json(await loadSettings());
}));

// ---------- purchases & parts ----------

function partOut(r) {
  const f = r.fields;
  return {
    id: r.id,
    name: f.Part || "",
    partNo: f["Part no"] || "",
    brand: f.Brand || "",
    qtyBought: f["Qty bought"] ?? 0,
    qtyLeft: f["Qty left"] ?? 0,
    unitCost: f["Unit cost"] ?? 0,
    markupPercent: f["Markup percent"] ?? null,
    sellingPrice: f["Selling price"] ?? 0,
    supplier: f.Supplier || "",
    boughtOn: f["Bought on"] || "",
  };
}

router.post("/purchases/extract", oneFile, wrap(async (req, res) => {
  const file = fileOf(req);
  if (!file) throw bad("Please choose the receipt photo or PDF.");
  let suggestion;
  try {
    suggestion = await ai.readPurchase(file);
  } catch (err) {
    return res.status(err.status === 503 ? 503 : 502).json({ error: err.message });
  }
  const s = await loadSettings();
  suggestion.items = suggestion.items.map((it) => ({
    ...it,
    markupPercent: s.markupPercent,
    sellingPrice: it.unitCost === null ? null : P.sellingPrice(it.unitCost, s.markupPercent, s.roundTo),
  }));
  res.json({ suggestion, settings: { markupPercent: s.markupPercent, roundTo: s.roundTo } });
}));

router.post("/purchases", oneFile, wrap(async (req, res) => {
  const d = bodyData(req);
  const s = await loadSettings();
  const date = ai.cleanDate(d.date) || P.todayKL();
  const supplier = text(d.supplier, 120);
  const items = (Array.isArray(d.items) ? d.items : []).map((it) => {
    const name = text(it.name, 200);
    const qty = Number(it.qty);
    const unitCost = Number(it.unitCost);
    if (!name) return null;
    if (!(qty > 0)) throw bad(`Quantity for "${name}" must be more than 0.`);
    if (!(unitCost >= 0)) throw bad(`Cost for "${name}" is missing.`);
    const markup = Number.isFinite(Number(it.markupPercent)) && it.markupPercent !== "" && it.markupPercent !== null ? Number(it.markupPercent) : s.markupPercent;
    let sell = Number(it.sellingPrice);
    if (!(sell >= 0) || it.sellingPrice === "" || it.sellingPrice === null) sell = P.sellingPrice(unitCost, markup, s.roundTo);
    return { name, partNo: text(it.partNo, 60), brand: text(it.brand, 60), qty: P.round2(qty), unitCost: P.round2(unitCost), markup, sell: P.round2(sell) };
  }).filter(Boolean);
  if (!items.length) throw bad("Add at least one part.");

  const existing = await db.list("purchases", { fields: ["Ref"] });
  const ref = P.nextNumber("P", existing.map((r) => r.fields.Ref), date);
  const total = Number(d.total) >= 0 && d.total !== "" && d.total !== null ? P.round2(d.total) : P.round2(items.reduce((t, i) => t + i.qty * i.unitCost, 0));
  const [purchase] = await db.create("purchases", [{
    Ref: ref,
    Supplier: supplier,
    Date: date,
    "Supplier receipt no": text(d.receiptNo, 60),
    "Total paid": total,
    Items: items.map((i) => `${i.qty} x ${i.name}${i.partNo ? ` (${i.partNo})` : ""} @ RM${i.unitCost.toFixed(2)}`).join("\n"),
    Notes: text(d.notes, 1000),
  }]);

  const parts = await db.create("parts", items.map((i) => ({
    Part: i.name,
    "Part no": i.partNo,
    Brand: i.brand,
    "Qty bought": i.qty,
    "Qty left": i.qty,
    "Unit cost": i.unitCost,
    "Markup percent": i.markup,
    "Selling price": i.sell,
    Supplier: supplier,
    "Bought on": date,
    "Purchase ref": ref,
    "Purchase record": purchase.id,
  })));

  let fileSaved = true;
  const file = fileOf(req);
  if (file) {
    try {
      await db.upload("purchaseReceipt", purchase.id, { filename: file.filename, contentType: file.mimeType, base64: file.base64 });
    } catch (err) {
      fileSaved = false;
    }
  }
  res.status(201).json({ ref, purchaseId: purchase.id, parts: parts.map(partOut), fileSaved });
}));

router.get("/parts", wrap(async (req, res) => {
  const rows = await db.list("parts");
  const parts = rows.map(partOut).sort((a, b) => (b.boughtOn || "").localeCompare(a.boughtOn || "") || a.name.localeCompare(b.name));
  res.json({ parts });
}));

router.patch("/parts/:id", wrap(async (req, res) => {
  if (!isRec(req.params.id)) throw bad("Unknown part.");
  const fields = {};
  const map = { sellingPrice: "Selling price", qtyLeft: "Qty left", markupPercent: "Markup percent", unitCost: "Unit cost" };
  for (const [k, f] of Object.entries(map)) {
    if (!(k in req.body)) continue;
    const n = Number(req.body[k]);
    if (!Number.isFinite(n) || (k !== "qtyLeft" && n < 0)) throw bad(`${f} must be a number.`);
    fields[f] = P.round2(n);
  }
  if ("name" in req.body) {
    const name = text(req.body.name, 200);
    if (!name) throw bad("Part name cannot be empty.");
    fields.Part = name;
  }
  // Changing cost or markup recalculates the price unless a price was given.
  if (("unitCost" in req.body || "markupPercent" in req.body) && !("sellingPrice" in req.body)) {
    const cur = partOut(await db.get("parts", req.params.id));
    const s = await loadSettings();
    const cost = fields["Unit cost"] ?? cur.unitCost;
    const markup = fields["Markup percent"] ?? cur.markupPercent ?? s.markupPercent;
    fields["Selling price"] = P.sellingPrice(cost, markup, s.roundTo);
  }
  const [row] = await db.update("parts", [{ id: req.params.id, fields }]);
  res.json(partOut(row));
}));

// ---------- customers ----------

const customerOut = (r) => ({ id: r.id, name: r.fields.Name || "", phone: r.fields.Phone || "", car: r.fields.Car || "", plate: r.fields.Plate || "" });

router.get("/customers", wrap(async (req, res) => {
  const rows = await db.list("customers");
  res.json({ customers: rows.map(customerOut).sort((a, b) => a.name.localeCompare(b.name)) });
}));

// ---------- quotations ----------

function quoteOut(r) {
  const f = r.fields;
  let items = [];
  try {
    items = JSON.parse(f["Items JSON"] || "[]");
  } catch {}
  return {
    id: r.id,
    quoteNo: f["Quote no"] || "",
    date: f.Date || "",
    validUntil: f["Valid until"] || "",
    customerId: f["Customer record"] || "",
    customerName: f["Customer name"] || "",
    phone: f.Phone || "",
    car: f.Car || "",
    plate: f.Plate || "",
    items,
    subtotal: f.Subtotal ?? 0,
    discount: f.Discount ?? 0,
    total: f.Total ?? 0,
    paid: f.Paid ?? 0,
    balance: f.Balance ?? f.Total ?? 0,
    status: f.Status || "Draft",
    stockTaken: !!f["Stock taken"],
    token: f["Link token"] || "",
    notes: f.Notes || "",
  };
}

router.get("/quotes", wrap(async (req, res) => {
  const rows = await db.list("quotes");
  const quotes = rows.map(quoteOut).sort((a, b) => b.quoteNo.localeCompare(a.quoteNo));
  res.json({ quotes });
}));

router.get("/quotes/:id", wrap(async (req, res) => {
  if (!isRec(req.params.id)) throw bad("Unknown quotation.");
  res.json(quoteOut(await db.get("quotes", req.params.id)));
}));

router.post("/quotes", wrap(async (req, res) => {
  const d = req.body || {};
  const name = text(d.customerName, 120);
  if (!name) throw bad("Customer name is needed.");
  const items = P.cleanItems(d.items);
  if (!items.length) throw bad("Add at least one item with a price.");
  const { subtotal, discount, total } = P.quoteTotals(items, d.discount);
  const s = await loadSettings();
  const date = P.todayKL();

  // Save a new customer, or update the phone/car on an existing one.
  let customerId = isRec(d.customerId) ? d.customerId : "";
  const cust = { Name: name, Phone: text(d.phone, 30), Car: text(d.car, 80), Plate: text(d.plate, 20).toUpperCase() };
  if (customerId) await db.update("customers", [{ id: customerId, fields: cust }]);
  else customerId = (await db.create("customers", [cust]))[0].id;

  const existing = await db.list("quotes", { fields: ["Quote no"] });
  const quoteNo = P.nextNumber("Q", existing.map((r) => r.fields["Quote no"]), date);
  const [row] = await db.create("quotes", [{
    "Quote no": quoteNo,
    Date: date,
    "Valid until": P.addDays(date, s.quoteValidDays),
    "Customer record": customerId,
    "Customer name": name,
    Phone: cust.Phone,
    Car: cust.Car,
    Plate: cust.Plate,
    "Items JSON": JSON.stringify(items),
    Items: items.map((i) => `${i.qty} x ${i.description} @ RM${i.unitPrice.toFixed(2)} = RM${i.amount.toFixed(2)}`).join("\n"),
    Subtotal: subtotal,
    Discount: discount,
    Total: total,
    Paid: 0,
    Balance: total,
    Status: "Draft",
    "Link token": newToken("q"),
    Notes: text(d.notes, 1000),
  }]);
  res.status(201).json(quoteOut(row));
}));

router.post("/quotes/:id/status", wrap(async (req, res) => {
  if (!isRec(req.params.id)) throw bad("Unknown quotation.");
  const status = req.body?.status;
  if (!["Draft", "Sent", "Cancelled"].includes(status)) throw bad("Unknown status.");
  const q = quoteOut(await db.get("quotes", req.params.id));
  if (q.paid > 0 && status === "Cancelled") throw bad("This quotation already has a payment, so it cannot be cancelled.");
  if (q.paid > 0) return res.json(q); // Part paid / Paid stay as they are
  const [row] = await db.update("quotes", [{ id: q.id, fields: { Status: status } }]);
  res.json(quoteOut(row));
}));

// ---------- payments ----------

const OPEN = ["Draft", "Sent", "Part paid"];

// Rank open quotations against a payment: same amount as the balance, the
// quote number written in the payment note, and the payer's name.
function rankMatches(quotes, p) {
  const words = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !["bin", "binti", "bte", "sdn", "bhd", "enterprise"].includes(w));
  const payer = new Set(words(p.payerName));
  const note = `${p.recipientNote || ""} ${p.reference || ""}`.toUpperCase();
  return quotes
    .filter((q) => OPEN.includes(q.status) && q.balance > 0)
    .map((q) => {
      let score = 0;
      const why = [];
      if (q.quoteNo && note.includes(q.quoteNo.toUpperCase())) { score += 5; why.push("quote no in payment note"); }
      if (p.amount && Math.abs(q.balance - p.amount) < 0.01) { score += 3; why.push("amount = balance"); }
      else if (p.amount && Math.abs(q.total - p.amount) < 0.01) { score += 2; why.push("amount = total"); }
      else if (p.amount && p.amount < q.balance) { score += 0.5; }
      if (q.plate && note.replace(/\s/g, "").includes(q.plate.replace(/\s/g, ""))) { score += 2; why.push("car plate in note"); }
      const shared = words(q.customerName).filter((w) => payer.has(w)).length;
      if (shared) { score += Math.min(shared, 2); why.push("payer name"); }
      return { id: q.id, quoteNo: q.quoteNo, customerName: q.customerName, plate: q.plate, total: q.total, balance: q.balance, score, why };
    })
    .sort((a, b) => b.score - a.score || b.quoteNo.localeCompare(a.quoteNo));
}

router.post("/payments/extract", oneFile, wrap(async (req, res) => {
  const file = fileOf(req);
  if (!file) throw bad("Please choose the payment slip photo or PDF.");
  let suggestion;
  try {
    suggestion = await ai.readPayment(file);
  } catch (err) {
    return res.status(err.status === 503 ? 503 : 502).json({ error: err.message });
  }
  const quotes = (await db.list("quotes")).map(quoteOut);
  res.json({ suggestion, matches: rankMatches(quotes, suggestion) });
}));

function paymentOut(r) {
  const f = r.fields;
  return {
    id: r.id,
    receiptNo: f["Receipt no"] || "",
    paidOn: f["Paid on"] || "",
    amount: f.Amount ?? 0,
    method: f.Method || "",
    reference: f.Reference || "",
    payerName: f["Payer name"] || "",
    quoteNo: f["Quote no"] || "",
    quoteId: f["Quotation record"] || "",
    customerName: f["Customer name"] || "",
    token: f["Link token"] || "",
    notes: f.Notes || "",
  };
}

router.get("/payments", wrap(async (req, res) => {
  const rows = await db.list("payments");
  res.json({ payments: rows.map(paymentOut).sort((a, b) => b.receiptNo.localeCompare(a.receiptNo)) });
}));

router.post("/payments", oneFile, wrap(async (req, res) => {
  const d = bodyData(req);
  if (!isRec(d.quoteId)) throw bad("Choose which quotation this payment is for.");
  const amount = P.round2(Number(d.amount));
  if (!(amount > 0)) throw bad("Amount must be more than 0.");
  const method = ai.METHODS.includes(d.method) ? d.method : "Bank transfer";
  const paidOn = ai.cleanDate(d.paidOn) || P.todayKL();

  const q = quoteOut(await db.get("quotes", d.quoteId));
  if (q.status === "Cancelled") throw bad(`${q.quoteNo} is cancelled.`);
  if (amount - q.balance > 0.009) throw bad(`RM${amount.toFixed(2)} is more than the balance of RM${q.balance.toFixed(2)} on ${q.quoteNo}. Check the amount.`);

  // Same slip saved twice? Stop it.
  const reference = text(d.reference, 80);
  const payments = await db.list("payments", { fields: ["Receipt no", "Reference", "Amount"] });
  if (reference && payments.some((p) => (p.fields.Reference || "").toLowerCase() === reference.toLowerCase() && Math.abs((p.fields.Amount || 0) - amount) < 0.01)) {
    throw bad(`This payment (ref ${reference}) is already recorded.`);
  }

  const receiptNo = P.nextNumber("R", payments.map((p) => p.fields["Receipt no"]), paidOn);
  const [row] = await db.create("payments", [{
    "Receipt no": receiptNo,
    "Paid on": paidOn,
    Amount: amount,
    Method: method,
    Reference: reference,
    "Payer name": text(d.payerName, 120),
    "Quote no": q.quoteNo,
    "Quotation record": q.id,
    "Customer name": q.customerName,
    "Link token": newToken("r"),
    Notes: text(d.notes, 1000),
  }]);

  const state = P.paymentState(q.total, q.paid + amount);
  const qFields = { Paid: state.paid, Balance: state.balance, Status: state.status };

  // First money in = the job is going ahead: take the parts out of stock once.
  const lowStock = [];
  if (!q.stockTaken) {
    const partLines = q.items.filter((i) => i.type === "part" && isRec(i.partId));
    if (partLines.length) {
      const parts = new Map((await db.list("parts")).map((r) => [r.id, partOut(r)]));
      const use = new Map();
      for (const l of partLines) use.set(l.partId, (use.get(l.partId) || 0) + l.qty);
      const updates = [];
      for (const [id, qty] of use) {
        const part = parts.get(id);
        if (!part) continue;
        const left = P.round2(part.qtyLeft - qty);
        if (left < 0) lowStock.push(part.name);
        updates.push({ id, fields: { "Qty left": left } });
      }
      if (updates.length) await db.update("parts", updates);
    }
    qFields["Stock taken"] = true;
  }
  await db.update("quotes", [{ id: q.id, fields: qFields }]);

  let fileSaved = true;
  const file = fileOf(req);
  if (file) {
    try {
      await db.upload("paymentProof", row.id, { filename: file.filename, contentType: file.mimeType, base64: file.base64 });
    } catch {
      fileSaved = false;
    }
  }
  res.status(201).json({ payment: paymentOut(row), quote: { ...q, ...{ paid: state.paid, balance: state.balance, status: state.status } }, lowStock, fileSaved });
}));

module.exports = { router, rankMatches, quoteOut, paymentOut, partOut, loadSettings };
