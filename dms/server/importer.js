// One-time import of old records (e.g. from an Excel workbook) prepared as
// JSON. Safe to run twice: anything already in the DMS is skipped (same
// customer name, plate, part, package name, invoice no, receipt no...).
//
// JSON: { version: 1, source, customers[], vehicles[], parts[], packages[],
//         jobs[{ invoiceNo, date, customerKey, plate, discount, total, groups, payments[] }],
//         purchases[], expenses[], settings{} }

const crypto = require("crypto");
const multer = require("multer");
const db = require("./airtable");
const M = require("./money");
const P = require("./pricing");

const text = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : v === null || v === undefined ? "" : String(v).trim().slice(0, max));
const iso = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const plateKey = (p) => String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
const token = (k) => k + crypto.randomBytes(16).toString("hex");
const n2 = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : 0);
const CATS = ["Rent", "Utilities", "Wages", "Workshop supplies", "Sublet (outside work)", "Tools & equipment (asset)", "Transport", "Marketing", "Phone & internet", "Bank fees", "Insurance & licences", "Owner drawings", "Other"];
const METHODS = ["Bank transfer", "DuitNow", "Cash", "Card", "Cheque", "E-wallet", "Other"];

async function runImport(data) {
  if (!data || data.version !== 1) throw Object.assign(new Error("This is not a DMS import file."), { status: 400 });
  const out = { created: {}, skipped: {}, problems: [] };
  const add = (k, n = 1) => (out.created[k] = (out.created[k] || 0) + n);
  const skip = (k) => (out.skipped[k] = (out.skipped[k] || 0) + 1);
  const today = P.todayKL();

  // Customers (by name)
  const custRows = await db.list("customers");
  const custId = new Map(custRows.map((r) => [String(r.fields.Name || "").toLowerCase().replace(/\./g, "").trim(), r.id]));
  const custByKey = new Map();
  const newCust = [];
  for (const c of data.customers || []) {
    const k = String(c.name || "").toLowerCase().replace(/\./g, "").trim();
    if (!k) continue;
    custByKey.set(c.key, { ...c, k });
    if (custId.has(k)) { skip("customers"); continue; }
    newCust.push({ Name: text(c.name, 120), Phone: text(c.phone, 30), Address: text(c.address, 300), Notes: text(c.notes, 1000), Type: "Customer", Source: "Returning" });
    custId.set(k, null);
  }
  for (const r of await db.create("customers", newCust)) custId.set(String(r.fields.Name).toLowerCase().replace(/\./g, "").trim(), r.id);
  add("customers", newCust.length);
  const cid = (key) => {
    const c = custByKey.get(key);
    return c ? { id: custId.get(c.k) || "", name: text(c.name, 120), phone: text(c.phone, 30), address: text(c.address, 300) } : { id: "", name: "", phone: "", address: "" };
  };

  // Vehicles (by plate)
  const vKeys = new Set((await db.list("vehicles")).map((r) => r.fields["Plate key"] || plateKey(r.fields.Plate)));
  const newV = [];
  for (const v of data.vehicles || []) {
    const k = plateKey(v.plate);
    if (!k || vKeys.has(k)) { skip("vehicles"); continue; }
    vKeys.add(k);
    const c = cid(v.customerKey);
    newV.push({ Plate: text(v.plate, 20).toUpperCase(), "Plate key": k, "Make model": text(v.makeModel, 80), "Chassis no": text(v.chassisNo, 30).toUpperCase(), "Customer record": c.id, "Owner name": c.name, "Owner phone": c.phone });
  }
  await db.create("vehicles", newV);
  add("vehicles", newV.length);

  // Parts (by part no + name)
  const pk = (no, name, sup, cost) => `${String(no || "").toUpperCase().replace(/\s/g, "")}|${String(name || "").toLowerCase().trim()}|${String(sup || "").toLowerCase().trim()}|${n2(cost)}`;
  const partKeys = new Set((await db.list("parts")).map((r) => pk(r.fields["Part no"], r.fields.Part, r.fields.Supplier, r.fields["Unit cost"])));
  const newP = [];
  for (const p of data.parts || []) {
    const k = pk(p.partNo, p.name, p.supplier, p.unitCost);
    if (!text(p.name) || partKeys.has(k)) { skip("parts"); continue; }
    partKeys.add(k);
    const cost = n2(p.unitCost);
    const sell = n2(p.sellingPrice);
    newP.push({ Part: text(p.name, 200), "Part no": text(p.partNo, 60), Brand: text(p.brand, 60), "Qty bought": Math.max(0, n2(p.qtyLeft)), "Qty left": n2(p.qtyLeft), "Unit cost": cost, "Selling price": sell, "Markup percent": cost > 0 ? Math.round(((sell - cost) / cost) * 100) : null, Supplier: text(p.supplier, 120), "Bought on": iso(p.boughtOn) || null, "Purchase ref": "Imported" });
  }
  await db.create("parts", newP);
  add("parts", newP.length);

  // Packages (by name)
  const pkgNames = new Set((await db.list("packages")).map((r) => String(r.fields.Name || "").toLowerCase()));
  const newPk = [];
  for (const p of data.packages || []) {
    const name = text(p.name, 80);
    if (!name || pkgNames.has(name.toLowerCase())) { skip("packages"); continue; }
    try {
      const [g] = M.cleanGroups([{ request: p.request, lines: p.lines }]);
      pkgNames.add(name.toLowerCase());
      newPk.push({ Name: name, Request: g.request, "Lines JSON": JSON.stringify(g.lines), Active: p.active !== false, Notes: "Imported" });
    } catch (err) {
      out.problems.push(`Package "${name}": ${err.message}`);
    }
  }
  await db.create("packages", newPk);
  add("packages", newPk.length);

  // Jobs (invoices) and their payments
  const quotes = await db.list("quotes", { fields: ["Invoice no", "Quote no"] });
  const invNos = new Set(quotes.map((r) => r.fields["Invoice no"]).filter(Boolean));
  const pays = await db.list("payments", { fields: ["Receipt no"] });
  const receiptNos = pays.map((r) => r.fields["Receipt no"]).filter(Boolean);
  const company = require("../config/company.json");
  for (const j of data.jobs || []) {
    const no = text(j.invoiceNo, 20);
    if (!no || invNos.has(no)) { skip("invoices"); continue; }
    let groups;
    try {
      groups = M.cleanGroups(j.groups);
    } catch (err) {
      out.problems.push(`Invoice ${no}: ${err.message}`);
      continue;
    }
    const t = M.computeTotals(groups, { discount: j.discount || 0, sst: { on: !!company.sstRegistrationNo, rate: company.serviceTaxRate }, round5: false });
    const total = t.grand / 100;
    if (j.total !== undefined && Math.abs(total - Number(j.total)) > 0.01) out.problems.push(`Invoice ${no}: lines come to RM${M.fmt(t.grand)}, the old total was RM${M.fmt(Math.round(Number(j.total) * 100))}.`);
    const payList = (j.payments || []).filter((p) => n2(p.amount) > 0);
    const paid = n2(payList.reduce((s, p) => s + n2(p.amount), 0));
    const state = P.paymentState(total, paid);
    const date = iso(j.date) || today;
    const c = cid(j.customerKey);
    const [row] = await db.create("quotes", [{
      "Doc type": "Invoice", "Invoice no": no, "Invoice date": date, "Repair date": date, "Due date": date,
      "Customer record": c.id, "Customer name": c.name, Phone: c.phone, Plate: text(j.plate, 20).toUpperCase(), Car: text(j.car, 80),
      "Items JSON": JSON.stringify(groups), Items: groups.map((g) => g.lines.map((l) => `${l.type === "part" ? `${l.qty} x ` : ""}${l.description} = RM${M.fmt(M.lineSen(l))}`).join("\n")).join("\n"),
      Subtotal: t.subtotal / 100, Discount: 0, Total: total, Paid: state.paid, Balance: state.balance, Status: state.status || "Sent", Stage: "Collected",
      "Stock taken": true, "Invoice token": token("i"),
      "Job JSON": JSON.stringify({ invoiceTo: { name: company.defaultInvoiceTo?.name || "", address: [] }, customerAddress: c.address ? [c.address.slice(0, 80)] : [], vehicle: { chassisNo: "", engineNo: "", regDate: "" }, advisor: {}, discount: n2(j.discount), surcharge: 0, menus: 0 }),
      Notes: `Imported from ${text(data.source, 80) || "old records"}`,
    }]);
    invNos.add(no);
    add("invoices");
    const prow = [];
    for (const p of payList) {
      const paidOn = iso(p.date) || date;
      let rno = text(p.receiptNo, 20);
      if (!rno || receiptNos.includes(rno)) rno = P.nextNumber("OR", receiptNos, paidOn);
      receiptNos.push(rno);
      prow.push({ "Receipt no": rno, "Paid on": paidOn, Amount: n2(p.amount), Method: METHODS.includes(p.method) ? p.method : "Bank transfer", Reference: text(p.reference, 80), "Quote no": no, "Quotation record": row.id, "Customer name": c.name, "Link token": token("r"), Notes: "Imported" });
    }
    await db.create("payments", prow);
    add("payments", prow.length);
  }

  // Supplier receipts (history)
  const purRows = await db.list("purchases", { fields: ["Ref", "Supplier", "Date", "Supplier receipt no"] });
  const purKeys = new Set(purRows.map((r) => `${r.fields.Date}|${String(r.fields.Supplier || "").toLowerCase()}|${r.fields["Supplier receipt no"] || ""}`));
  const refs = purRows.map((r) => r.fields.Ref);
  const newPur = [];
  for (const p of data.purchases || []) {
    const date = iso(p.date) || today;
    const k = `${date}|${text(p.supplier).toLowerCase()}|${text(p.receiptNo, 60)}`;
    if (purKeys.has(k)) { skip("purchases"); continue; }
    purKeys.add(k);
    const ref = P.nextNumber("PUR", refs, date);
    refs.push(ref);
    newPur.push({ Ref: ref, Supplier: text(p.supplier, 120), Date: date, "Supplier receipt no": text(p.receiptNo, 60), "Total paid": n2(p.total), Items: (p.items || []).map((x) => text(x, 200)).join("\n"), Notes: "Imported", "Payment status": "Paid", "Paid on": date });
  }
  await db.create("purchases", newPur);
  add("purchases", newPur.length);

  // Expenses
  const exKeys = new Set((await db.list("expenses")).map((r) => `${r.fields.Date}|${String(r.fields.Description || "").toLowerCase()}|${r.fields.Amount}`));
  const newE = [];
  for (const e of data.expenses || []) {
    const k = `${iso(e.date)}|${text(e.description, 120).toLowerCase()}|${n2(e.amount)}`;
    if (!(n2(e.amount) > 0) || exKeys.has(k)) { skip("expenses"); continue; }
    exKeys.add(k);
    newE.push({ Description: text(e.description, 120) || "Expense", Date: iso(e.date) || today, Category: CATS.includes(e.category) ? e.category : "Other", Amount: n2(e.amount), Method: text(e.method, 40), "Paid to": text(e.paidTo, 120), Notes: text(e.notes, 1000) });
  }
  await db.create("expenses", newE);
  add("expenses", newE.length);

  // Settings: only fill empty boxes
  if (data.settings && typeof data.settings === "object") {
    const rows = await db.list("settings");
    const row = rows.find((r) => r.fields.Key === "main") || rows[0];
    const fields = {};
    if (row && !row.fields["Registration no"] && text(data.settings.registrationNo)) fields["Registration no"] = text(data.settings.registrationNo, 40);
    if (row && Object.keys(fields).length) await db.update("settings", [{ id: row.id, fields }]);
  }
  return out;
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

function register(router, { wrap }) {
  router.post("/import", (req, res, next) => upload.single("file")(req, res, (err) => (err ? res.status(400).json({ error: "Could not read the file (max 5 MB)." }) : next())), wrap(async (req, res) => {
    let data;
    try {
      data = JSON.parse(req.file ? req.file.buffer.toString("utf8") : "");
    } catch {
      throw Object.assign(new Error("Please choose the import file (.json) I sent you."), { status: 400 });
    }
    res.json(await runImport(data));
  }));
}

module.exports = { register, runImport };
