// All /api routes. Flow:
//   1. Upload supplier receipt → AI reads it → owner checks → parts saved
//      with selling price = cost + markup.
//   2. Job: ESTIMATE (before work) → INVOICE (after work, copies the lines)
//      → links to send to the client (A4 documents, see template.js).
//   3. Upload payment slip → AI reads it → matched to the job → payment
//      recorded → OFFICIAL RECEIPT link for the client.

const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const db = require("./airtable");
const ai = require("./ai");
const P = require("./pricing");
const M = require("./money");
const V = require("./vehicles");
const WA = require("./whatsapp");
const company = require("../config/company.json");

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
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    console.error("[api]", status, err.message);
    res.locals.errorMessage = err.message;
    // A planned error (with a status) has a message written for the user; an
    // unexpected one (a code bug) gets a plain message, the details go to the log.
    res.status(status).json({ error: err.status ? err.message : "Something went wrong on our side. Please try again." });
  });

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const isRec = (id) => /^rec[A-Za-z0-9]{14}$/.test(id || "");
const newToken = (kind) => kind + crypto.randomBytes(16).toString("hex");
const text = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// ---------- settings ----------
// Personal details live in Airtable (editable on the phone); fixed brand
// settings and switches live in config/company.json.

const SETTINGS_FIELDS = {
  legalName: "Legal name",
  registrationNo: "Registration no",
  hotline: "Hotline",
  address: "Address",
  tel: "Phone",
  email: "Email",
  whatsapp: "WhatsApp",
  bankName: "Bank name",
  bankAccountName: "Bank account name",
  bankAccountNo: "Bank account no",
  partsWarrantyMonths: "Parts warranty months",
  markupPercent: "Markup percent",
  roundTo: "Round to",
  estimateValidityDays: "Quote valid days",
  serviceIntervalKm: "Service interval km",
  serviceIntervalMonths: "Service interval months",
  openingCash: "Opening cash",
  openingDate: "Opening date",
  ownerCapital: "Owner capital",
  labourRate: "Labour rate per hour",
};
const NUMERIC_SETTINGS = ["markupPercent", "roundTo", "estimateValidityDays", "partsWarrantyMonths", "serviceIntervalKm", "serviceIntervalMonths", "openingCash", "ownerCapital", "labourRate"];
const MONEY_SETTINGS = ["openingCash", "ownerCapital", "labourRate"];

// Settings are read on almost every screen and every document link, so they
// are kept for a short time (SETTINGS_CACHE_MS, default 60 s). Saving
// settings in the app clears the copy at once.
let settingsCache = null;
function clearSettingsCache() {
  settingsCache = null;
}
async function loadSettings() {
  const ttl = process.env.SETTINGS_CACHE_MS !== undefined ? Number(process.env.SETTINGS_CACHE_MS) : 60000;
  if (ttl > 0 && settingsCache && Date.now() - settingsCache.at < ttl) return { ...settingsCache.value };
  const value = await readSettings();
  settingsCache = { at: Date.now(), value };
  return { ...value };
}
async function readSettings() {
  const rows = await db.list("settings");
  const row = rows.find((r) => r.fields.Key === "main") || rows[0];
  const s = { id: row ? row.id : null };
  for (const [k, f] of Object.entries(SETTINGS_FIELDS)) s[k] = row ? row.fields[f] ?? null : null;
  const qr = row?.fields["DuitNow QR"];
  s.duitNowQr = Array.isArray(qr) && qr.length ? qr[qr.length - 1].url : null;
  if (!(s.markupPercent >= 0)) s.markupPercent = 30;
  if (!(s.roundTo >= 0)) s.roundTo = 0;
  if (!(s.estimateValidityDays > 0)) s.estimateValidityDays = company.estimateValidityDays || 7;
  if (!(s.serviceIntervalKm > 0)) s.serviceIntervalKm = 10000;
  if (!(s.serviceIntervalMonths > 0)) s.serviceIntervalMonths = 12;
  s.sst = !!company.sstRegistrationNo;
  return s;
}

// company.json + the owner's Settings → what the documents print.
function companyFor(s) {
  const pick = (v, d) => (v === null || v === undefined || v === "" ? d : v);
  const legalName = pick(s.legalName, company.legalName);
  return {
    ...company,
    legalName,
    registrationNo: pick(s.registrationNo, company.registrationNo),
    hotline: pick(s.hotline, company.hotline),
    address: pick(s.address, company.address),
    tel: pick(s.tel, company.tel),
    email: pick(s.email, company.email),
    whatsapp: pick(s.whatsapp, company.whatsapp),
    partsWarrantyMonths: pick(s.partsWarrantyMonths, company.partsWarrantyMonths),
    estimateValidityDays: pick(s.estimateValidityDays, company.estimateValidityDays),
    duitNowQrImage: pick(s.duitNowQr, company.duitNowQrImage),
    bank: {
      name: pick(s.bankName, company.bank.name),
      accountName: pick(s.bankAccountName, pick(company.bank.accountName, legalName)),
      accountNo: pick(s.bankAccountNo, company.bank.accountNo),
    },
  };
}

router.get("/settings", wrap(async (req, res) => res.json(await loadSettings())));

router.put("/settings", wrap(async (req, res) => {
  const fields = {};
  for (const [k, f] of Object.entries(SETTINGS_FIELDS)) {
    if (!(k in req.body)) continue;
    if (k === "openingDate") {
      fields[f] = /^\d{4}-\d{2}-\d{2}$/.test(req.body[k] || "") ? req.body[k] : null;
      continue;
    }
    if (NUMERIC_SETTINGS.includes(k)) {
      if (req.body[k] === "" || req.body[k] === null) {
        if (k === "partsWarrantyMonths" || MONEY_SETTINGS.includes(k)) fields[f] = null;
        continue;
      }
      const n = Number(req.body[k]);
      const max = MONEY_SETTINGS.includes(k) ? 1e8 : k === "serviceIntervalKm" ? 100000 : 1000;
      if (!Number.isFinite(n) || n < 0 || n > max) throw bad(`${f} must be a number from 0 to ${max}.`);
      fields[f] = n;
    } else fields[f] = text(req.body[k], 1000);
  }
  const s = await loadSettings();
  if (s.id) await db.update("settings", [{ id: s.id, fields }]);
  else await db.create("settings", [{ Key: "main", ...fields }]);
  clearSettingsCache();
  res.json(await loadSettings());
}));

router.post("/settings/qr", oneFile, wrap(async (req, res) => {
  const file = fileOf(req);
  if (!file || !file.mimeType.startsWith("image/")) throw bad("Please choose the DuitNow QR picture (JPG or PNG).");
  const s = await loadSettings();
  if (!s.id) throw bad("Save the settings once first.");
  await db.upload("settingsQr", s.id, { filename: file.filename, contentType: file.mimeType, base64: file.base64 });
  clearSettingsCache();
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

  const inbox = await WA.takeFromInbox(d.inboxId);
  const existing = await db.list("purchases", { fields: ["Ref"] });
  const ref = P.nextNumber("PUR", existing.map((r) => r.fields.Ref), date);
  const total = Number(d.total) >= 0 && d.total !== "" && d.total !== null ? P.round2(d.total) : P.round2(items.reduce((t, i) => t + i.qty * i.unitCost, 0));
  const [purchase] = await db.create("purchases", [{
    Ref: ref,
    Supplier: supplier,
    Date: date,
    "Supplier receipt no": text(d.receiptNo, 60),
    "Total paid": total,
    Items: items.map((i) => `${i.qty} x ${i.name}${i.partNo ? ` (${i.partNo})` : ""} @ RM${i.unitCost.toFixed(2)}`).join("\n"),
    Notes: text(d.notes, 1000),
    "Payment status": d.paid === false ? "Unpaid" : "Paid",
    "Paid on": d.paid === false ? null : date,
    "Due date": d.paid === false && /^\d{4}-\d{2}-\d{2}$/.test(d.dueDate || "") ? d.dueDate : null,
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
  if (inbox) {
    if (inbox.file) await db.update("purchases", [{ id: purchase.id, fields: { Receipt: [{ url: inbox.file.url, filename: inbox.file.filename }] } }]).catch(() => (fileSaved = false));
    await WA.markSaved(d.inboxId, ref);
  } else if (file) {
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

const sel = (v) => (v && typeof v === "object" ? v.name : v) || "";
const customerOut = (r) => ({
  id: r.id, name: r.fields.Name || "", phone: r.fields.Phone || "", email: r.fields.Email || "", car: r.fields.Car || "", plate: r.fields.Plate || "",
  address: r.fields.Address || "", notes: r.fields.Notes || "", createdTime: r.createdTime || "",
  type: sel(r.fields.Type) || "Customer", source: sel(r.fields.Source), tags: r.fields.Tags || "", nextFollowUp: r.fields["Next follow-up"] || "", followUpNote: r.fields["Follow-up note"] || "",
});

router.get("/customers", wrap(async (req, res) => {
  const rows = await db.list("customers");
  res.json({ customers: rows.map(customerOut).sort((a, b) => a.name.localeCompare(b.name)) });
}));

// ---------- jobs (estimate → invoice) ----------
// One Airtable record per job, in the "Quotations" table. "Quote no" holds
// the estimate number; "Invoice no" is added when the invoice is made.

const parseJson = (s, d) => {
  try {
    const v = JSON.parse(s || "");
    return v ?? d;
  } catch {
    return d;
  }
};

function jobOut(r) {
  const f = r.fields;
  const details = parseJson(f["Job JSON"], {});
  const groups = parseJson(f["Items JSON"], []);
  return {
    id: r.id,
    docType: f["Doc type"] || "Estimate",
    estimateNo: f["Quote no"] || "",
    invoiceNo: f["Invoice no"] || "",
    date: f.Date || "",
    invoiceDate: f["Invoice date"] || "",
    validUntil: f["Valid until"] || "",
    repairDate: f["Repair date"] || "",
    dueDate: f["Due date"] || "",
    customerId: f["Customer record"] || "",
    customerName: f["Customer name"] || "",
    phone: f.Phone || "",
    car: f.Car || "",
    plate: f.Plate || "",
    mileageKm: f["Mileage km"] ?? null,
    groups: Array.isArray(groups) ? groups : [],
    estimateGroups: parseJson(f["Estimate JSON"], null),
    details,
    subtotal: f.Subtotal ?? 0,
    total: f.Total ?? 0,
    paid: f.Paid ?? 0,
    credited: f.Credited ?? 0,
    balance: f.Balance ?? f.Total ?? 0,
    status: f.Status || "Draft",
    stage: f.Stage || "",
    stockTaken: !!f["Stock taken"],
    token: f["Link token"] || "",
    invoiceToken: f["Invoice token"] || "",
    notes: f.Notes || "",
    checkin: parseJson(f["Check-in JSON"], null),
    inspection: parseJson(f["Inspection JSON"], null),
    inspectionToken: f["Inspection token"] || "",
    approvedAt: f["Approved at"] || "",
    approvedName: f["Approved name"] || "",
    photos: Object.fromEntries((Array.isArray(f["Job photos"]) ? f["Job photos"] : []).map((a) => [a.id, { url: a.url, thumb: a.thumbnails?.large?.url || a.url }])),
  };
}

const docNoOf = (j) => j.invoiceNo || j.estimateNo;

const isoOrEmpty = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const linesOf = (v, n = 3) => (Array.isArray(v) ? v : String(v || "").split("\n")).map((l) => text(String(l), 80)).filter(Boolean).slice(0, n);
const nowTimeKL = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(11, 16);

// Validate the job form. Mileage is required on every estimate and invoice.
function parseJob(d) {
  const name = text(d.customer?.name, 120);
  if (!name) throw bad("Customer name is needed.");
  const km = Number(String(d.vehicle?.mileageKm ?? "").replace(/[, ]/g, ""));
  if (!(km > 0) || !Number.isInteger(km)) throw bad("Mileage (Km) is needed and cannot be 0.");
  const groups = M.cleanGroups(d.groups);
  const money = (v, label) => {
    if (v === undefined || v === null || v === "") return 0;
    const sen = M.toSen(v);
    if (sen === null || sen < 0) throw bad(`${label} must be an amount in RM.`);
    return sen / 100;
  };
  return {
    customer: { name, phone: text(d.customer?.phone, 30), address: linesOf(d.customer?.address) },
    vehicle: {
      makeModel: text(d.vehicle?.makeModel, 80),
      regNo: text(d.vehicle?.regNo, 20).toUpperCase(),
      chassisNo: text(d.vehicle?.chassisNo, 30).toUpperCase(),
      engineNo: text(d.vehicle?.engineNo, 30).toUpperCase(),
      regDate: isoOrEmpty(d.vehicle?.regDate),
      mileageKm: km,
    },
    invoiceTo: { name: text(d.invoiceTo?.name, 120) || company.defaultInvoiceTo.name, address: linesOf(d.invoiceTo?.address, 2) },
    advisor: { name: text(d.advisor?.name, 60), operatorId: text(d.advisor?.operatorId, 20) },
    refs: { accountNo: text(d.accountNo, 30), orderNo: text(d.orderNo, 30), referenceNo: text(d.referenceNo, 30), wipNo: text(d.wipNo, 30), jobNo: text(d.jobNo, 30) },
    surcharge: money(d.surcharge, "Surcharge"),
    menus: money(d.menus, "Menus"),
    discount: money(d.discount, "Discount"),
    plannedDate: isoOrEmpty(d.plannedDate),
    repairDate: isoOrEmpty(d.repairDate),
    dueDate: isoOrEmpty(d.dueDate),
    groups,
    notes: text(d.notes, 1000),
  };
}

const totalsFor = (job) => M.computeTotals(job.groups, { surcharge: job.surcharge, menus: job.menus, discount: job.discount, sst: { on: !!company.sstRegistrationNo, rate: company.serviceTaxRate }, round5: !!company.roundTo5Sen });

const readable = (groups) => groups.map((g) => [`${g.code} ${g.request}`.trim(), ...g.lines.map((l) => `  ${l.type === "part" ? `${l.qty} x ` : ""}${l.description} = RM${M.fmt(M.lineSen(l))}`)].join("\n")).join("\n");

async function saveCustomer(customerId, job) {
  const cust = { Name: job.customer.name, Phone: job.customer.phone, Car: job.vehicle.makeModel, Plate: job.vehicle.regNo, Address: job.customer.address.join("\n") };
  if (!isRec(customerId)) customerId = await findExistingCustomer(job);
  if (isRec(customerId)) {
    await db.update("customers", [{ id: customerId, fields: cust }]);
    return customerId;
  }
  return (await db.create("customers", [cust]))[0].id;
}

// Before creating a customer, look for one already in the DMS: same phone number,
// the car's plate already linked to a customer, or the same name (ignoring titles).
async function findExistingCustomer(job) {
  const digits = (s) => String(s || "").replace(/\D/g, "").replace(/^60/, "0").slice(-9);
  const norm = (s) => String(s || "").toLowerCase().replace(/\b(mr|mrs|ms|miss|encik|en|puan|pn|cik|dr|tuan|tn|haji|hj|hajah|hjh|datuk|dato|datin)\b\.?/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  const phone = digits(job.customer.phone);
  const pk = String(job.vehicle.regNo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const customers = await db.list("customers");
  if (phone.length >= 7) {
    const c = customers.find((r) => digits(r.fields.Phone) === phone);
    if (c) return c.id;
  }
  if (pk) {
    const v = (await db.list("vehicles")).find((r) => (r.fields["Plate key"] || "") === pk && isRec(r.fields["Customer record"]));
    if (v && customers.some((r) => r.id === v.fields["Customer record"])) return v.fields["Customer record"];
  }
  // Name only when no phone was given, so two different people with the same name are not merged.
  if (phone.length >= 7) return "";
  const n = norm(job.customer.name);
  const same = customers.filter((r) => n && norm(r.fields.Name) === n);
  return same.length === 1 ? same[0].id : "";
}

function jobFields(job, details) {
  const t = totalsFor(job);
  if (job.discount && Math.round(job.discount * 100) > t.gross) throw bad("The discount cannot be more than the total.");
  return {
    t,
    fields: {
      "Customer name": job.customer.name,
      Phone: job.customer.phone,
      Car: job.vehicle.makeModel,
      Plate: job.vehicle.regNo,
      "Mileage km": job.vehicle.mileageKm,
      "Items JSON": JSON.stringify(job.groups),
      Items: readable(job.groups),
      Subtotal: t.subtotal / 100,
      Discount: 0,
      Total: t.grand / 100,
      "Job JSON": JSON.stringify(details),
      Notes: job.notes,
    },
  };
}

const detailsOf = (job, prev = {}) => ({
  ...prev,
  invoiceTo: job.invoiceTo,
  customerAddress: job.customer.address,
  vehicle: { chassisNo: job.vehicle.chassisNo, engineNo: job.vehicle.engineNo, regDate: job.vehicle.regDate },
  advisor: job.advisor,
  ...job.refs,
  surcharge: job.surcharge,
  menus: job.menus,
  discount: job.discount,
  plannedDate: job.plannedDate || prev.plannedDate || "",
});

// The car's record follows the latest job. A failure here must not lose the job.
async function syncVehicle(job, customerId, next) {
  try {
    await V.syncFromJob(job, customerId, next ? { date: P.addMonths(next.date, next.s.serviceIntervalMonths), km: job.vehicle.mileageKm + next.s.serviceIntervalKm } : null);
  } catch (err) {
    console.error("[vehicle]", err.message);
  }
}

// Take parts used on an invoice out of stock (once per job).
async function takeStock(groups) {
  const use = new Map();
  for (const g of groups) for (const l of g.lines) if (l.type === "part" && isRec(l.partId)) use.set(l.partId, (use.get(l.partId) || 0) + l.qty);
  if (!use.size) return [];
  const parts = new Map((await db.list("parts")).map((r) => [r.id, partOut(r)]));
  const updates = [];
  const low = [];
  for (const [id, qty] of use) {
    const p = parts.get(id);
    if (!p) continue;
    const left = P.round2(p.qtyLeft - qty);
    if (left < 0) low.push(p.name);
    updates.push({ id, fields: { "Qty left": left } });
  }
  if (updates.length) await db.update("parts", updates);
  return low;
}

router.get("/jobs", wrap(async (req, res) => {
  const rows = await db.list("quotes");
  const jobs = rows.map(jobOut).sort((a, b) => (b.invoiceDate || b.date).localeCompare(a.invoiceDate || a.date) || docNoOf(b).localeCompare(docNoOf(a)));
  res.json({ jobs });
}));

router.get("/jobs/:id", wrap(async (req, res) => {
  if (!isRec(req.params.id)) throw bad("Unknown job.");
  res.json(jobOut(await db.get("quotes", req.params.id)));
}));

// New job: saved as an estimate, or straight as an invoice (walk-in, work done).
router.post("/jobs", wrap(async (req, res) => {
  const job = parseJob(req.body || {});
  const asInvoice = req.body?.asInvoice === true;
  const s = await loadSettings();
  const today = P.todayKL();
  const customerId = await saveCustomer(req.body.customerId, job);
  const existing = await db.list("quotes", { fields: ["Quote no", "Invoice no"] });
  const details = detailsOf(job);
  const { t, fields } = jobFields(job, details);
  Object.assign(fields, { "Customer record": customerId, Paid: 0, Balance: t.grand / 100, Status: "Draft", Stage: asInvoice ? "Ready" : "Booked" });

  if (asInvoice) {
    details.invoiceTime = nowTimeKL();
    Object.assign(fields, {
      "Doc type": "Invoice",
      "Invoice no": P.nextNumber("INV", existing.map((r) => r.fields["Invoice no"]), today),
      "Invoice date": today,
      "Repair date": job.repairDate || today,
      "Due date": job.dueDate || today,
      "Invoice token": newToken("i"),
      "Job JSON": JSON.stringify(details),
    });
  } else {
    details.estimateTime = nowTimeKL();
    Object.assign(fields, {
      "Doc type": "Estimate",
      "Quote no": P.nextNumber("EST", existing.map((r) => r.fields["Quote no"]), today),
      Date: today,
      "Valid until": P.addDays(today, s.estimateValidityDays),
      "Link token": newToken("q"),
      "Job JSON": JSON.stringify(details),
    });
  }
  const [row] = await db.create("quotes", [fields]);
  await syncVehicle(job, customerId, asInvoice && req.body?.nextService === true ? { date: fields["Repair date"], s } : null);
  let lowStock = [];
  if (asInvoice) {
    lowStock = await takeStock(job.groups);
    await db.update("quotes", [{ id: row.id, fields: { "Stock taken": true } }]);
  }
  res.status(201).json({ job: jobOut({ ...row, fields: { ...row.fields, "Stock taken": asInvoice } }), lowStock });
}));

// Estimate approved and work done → invoice. Lines can be changed (final
// lines); the estimate's lines are kept in "Estimate JSON".
router.post("/jobs/:id/invoice", wrap(async (req, res) => {
  if (!isRec(req.params.id)) throw bad("Unknown job.");
  const cur = jobOut(await db.get("quotes", req.params.id));
  if (cur.invoiceNo) throw bad(`This job already has invoice ${cur.invoiceNo}.`);
  if (cur.status === "Cancelled") throw bad("This estimate is cancelled.");
  const job = parseJob(req.body || {});
  const today = P.todayKL();
  const existing = await db.list("quotes", { fields: ["Invoice no"] });
  const details = detailsOf(job, cur.details);
  details.invoiceTime = nowTimeKL();
  const { t, fields } = jobFields(job, details);
  const grand = t.grand / 100;
  if (cur.paid - grand > 0.009) throw bad(`The invoice total RM${M.fmt(t.grand)} is less than the RM${M.fmt(Math.round(cur.paid * 100))} already paid.`);
  const state = P.paymentState(grand, cur.paid);
  Object.assign(fields, {
    "Doc type": "Invoice",
    "Invoice no": P.nextNumber("INV", existing.map((r) => r.fields["Invoice no"]), today),
    "Invoice date": today,
    "Repair date": job.repairDate || today,
    "Due date": job.dueDate || today,
    "Invoice token": newToken("i"),
    "Estimate JSON": JSON.stringify(cur.groups),
    Paid: state.paid,
    Balance: state.balance,
    Status: state.status || "Draft",
    "Stock taken": true,
  });
  if (cur.stage !== "Collected") fields.Stage = "Ready";
  const custId = await saveCustomer(cur.customerId, job);
  await syncVehicle(job, custId, req.body?.nextService === true ? { date: fields["Repair date"], s: await loadSettings() } : null);
  const [row] = await db.update("quotes", [{ id: cur.id, fields }]);
  const lowStock = cur.stockTaken ? [] : await takeStock(job.groups);
  res.json({ job: jobOut(row), lowStock });
}));

router.post("/jobs/:id/status", wrap(async (req, res) => {
  if (!isRec(req.params.id)) throw bad("Unknown job.");
  const status = req.body?.status;
  if (!["Sent", "Cancelled"].includes(status)) throw bad("Unknown status.");
  const j = jobOut(await db.get("quotes", req.params.id));
  if (status === "Cancelled" && j.paid > 0) throw bad("This job already has a payment, so it cannot be cancelled.");
  if (status === "Cancelled" && j.invoiceNo) throw bad("An invoice cannot be cancelled here. Its number stays in the records.");
  if (j.paid > 0 || j.status === "Cancelled") return res.json(j);
  const [row] = await db.update("quotes", [{ id: j.id, fields: { Status: status } }]);
  res.json(jobOut(row));
}));

// Mileage only (also on issued invoices: it is not money, and documents
// cannot be made without it, e.g. old imported invoices).
router.post("/jobs/:id/mileage", wrap(async (req, res) => {
  if (!isRec(req.params.id)) throw bad("Unknown job.");
  const km = Number(String(req.body?.mileageKm ?? "").replace(/[, ]/g, ""));
  if (!Number.isInteger(km) || km <= 0 || km > 2000000) throw bad("Mileage must be a whole number of km, more than 0.");
  const j = jobOut(await db.get("quotes", req.params.id));
  const [row] = await db.update("quotes", [{ id: j.id, fields: { "Mileage km": km } }]);
  res.json(jobOut(row));
}));

const STAGES = ["Booked", "In workshop", "Waiting parts", "Ready", "Collected"];

router.post("/jobs/:id/stage", wrap(async (req, res) => {
  if (!isRec(req.params.id)) throw bad("Unknown job.");
  const stage = req.body?.stage;
  if (!STAGES.includes(stage)) throw bad("Unknown stage.");
  const j = jobOut(await db.get("quotes", req.params.id));
  if (j.status === "Cancelled") throw bad("This job is cancelled.");
  const [row] = await db.update("quotes", [{ id: j.id, fields: { Stage: stage } }]);
  res.json(jobOut(row));
}));

// ---------- payments ----------

const OPEN = ["Draft", "Sent", "Part paid"];

// Rank open jobs against a payment: the estimate/invoice number written in
// the payment note, amount = balance, car plate, and the payer's name.
function rankMatches(jobs, p) {
  const words = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !["bin", "binti", "bte", "sdn", "bhd", "enterprise"].includes(w));
  const payer = new Set(words(p.payerName));
  const note = `${p.recipientNote || ""} ${p.reference || ""}`.toUpperCase();
  const flat = note.replace(/[\s-]/g, "");
  return jobs
    .filter((j) => OPEN.includes(j.status) && j.balance > 0)
    .map((j) => {
      let score = 0;
      const why = [];
      const nos = [j.invoiceNo, j.estimateNo].filter(Boolean).map((n) => n.toUpperCase().replace(/[\s-]/g, ""));
      if (nos.some((n) => flat.includes(n))) { score += 5; why.push("document no in payment note"); }
      if (p.amount && Math.abs(j.balance - p.amount) < 0.01) { score += 3; why.push("amount = balance"); }
      else if (p.amount && Math.abs(j.total - p.amount) < 0.01) { score += 2; why.push("amount = total"); }
      else if (p.amount && p.amount < j.balance) score += 0.5;
      if (j.plate && flat.includes(j.plate.replace(/\s/g, ""))) { score += 2; why.push("car plate in note"); }
      const shared = words(j.customerName).filter((w) => payer.has(w)).length;
      if (shared) { score += Math.min(shared, 2); why.push("payer name"); }
      return { id: j.id, docNo: docNoOf(j), customerName: j.customerName, plate: j.plate, total: j.total, balance: j.balance, score, why };
    })
    .sort((a, b) => b.score - a.score || b.docNo.localeCompare(a.docNo));
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
  const jobs = (await db.list("quotes")).map(jobOut);
  res.json({ suggestion, matches: rankMatches(jobs, suggestion) });
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
    docNo: f["Quote no"] || "",
    jobId: f["Quotation record"] || "",
    customerName: f["Customer name"] || "",
    token: f["Link token"] || "",
    notes: f.Notes || "",
    createdTime: r.createdTime || "",
  };
}

router.get("/payments", wrap(async (req, res) => {
  const rows = await db.list("payments");
  res.json({ payments: rows.map(paymentOut).sort((a, b) => b.receiptNo.localeCompare(a.receiptNo)) });
}));

router.post("/payments", oneFile, wrap(async (req, res) => {
  const d = bodyData(req);
  if (!isRec(d.jobId)) throw bad("Choose which estimate or invoice this payment is for.");
  const amountSen = M.toSen(d.amount);
  if (!(amountSen > 0)) throw bad("Amount must be more than 0.");
  const amount = amountSen / 100;
  const method = ai.METHODS.includes(d.method) ? d.method : "Bank transfer";
  const paidOn = ai.cleanDate(d.paidOn) || P.todayKL();

  const j = jobOut(await db.get("quotes", d.jobId));
  if (j.status === "Cancelled") throw bad(`${docNoOf(j)} is cancelled.`);
  if (amount - j.balance > 0.009) throw bad(`RM${M.fmt(amountSen)} is more than the balance of RM${M.fmt(Math.round(j.balance * 100))} on ${docNoOf(j)}. Check the amount.`);

  const inbox = await WA.takeFromInbox(d.inboxId);
  // Same slip saved twice? Stop it.
  const reference = text(d.reference, 80);
  const payments = await db.list("payments", { fields: ["Receipt no", "Reference", "Amount"] });
  if (reference && payments.some((p) => (p.fields.Reference || "").toLowerCase() === reference.toLowerCase() && Math.abs((p.fields.Amount || 0) - amount) < 0.01)) {
    throw bad(`This payment (ref ${reference}) is already recorded.`);
  }

  const receiptNo = P.nextNumber("OR", payments.map((p) => p.fields["Receipt no"]), paidOn);
  const [row] = await db.create("payments", [{
    "Receipt no": receiptNo,
    "Paid on": paidOn,
    Amount: amount,
    Method: method,
    Reference: reference,
    "Payer name": text(d.payerName, 120),
    "Quote no": docNoOf(j),
    "Quotation record": j.id,
    "Customer name": j.customerName,
    "Link token": newToken("r"),
    Notes: text(d.notes, 1000),
  }]);

  const state = P.paymentState(P.round2(j.total - j.credited), j.paid + amount);
  await db.update("quotes", [{ id: j.id, fields: { Paid: state.paid, Balance: state.balance, Status: state.status } }]);

  let fileSaved = true;
  const file = fileOf(req);
  if (inbox) {
    if (inbox.file) await db.update("payments", [{ id: row.id, fields: { Proof: [{ url: inbox.file.url, filename: inbox.file.filename }] } }]).catch(() => (fileSaved = false));
    await WA.markSaved(d.inboxId, receiptNo);
  } else if (file) {
    try {
      await db.upload("paymentProof", row.id, { filename: file.filename, contentType: file.mimeType, base64: file.base64 });
    } catch {
      fileSaved = false;
    }
  }
  res.status(201).json({ payment: paymentOut(row), job: { ...j, paid: state.paid, balance: state.balance, status: state.status }, fileSaved });
}));

V.register(router, { wrap, oneFile, fileOf, bodyData, jobOut, customerOut });
require("./workshop").register(router, { wrap, oneFile, fileOf, bodyData, jobOut, newToken });
require("./crm").register(router, { wrap, customerOut });
WA.register(router, { wrap });
require("./importer").register(router, { wrap });
require("./finance").register(router, { wrap, oneFile, fileOf, bodyData, jobOut, newToken });
require("./assistant").register(router, { wrap });
require("./ops").register(router, { wrap });

module.exports = { router, rankMatches, jobOut, paymentOut, partOut, loadSettings, clearSettingsCache, companyFor, parseJob, docNoOf };
