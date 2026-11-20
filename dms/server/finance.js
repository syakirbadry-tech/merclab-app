// Finance and stock: expenses, credit notes, suppliers and what you owe them,
// parts ordered for a job, stock count. Reports (P&L, balance sheet) are
// worked out in the app from these records.

const db = require("./airtable");
const P = require("./pricing");
const M = require("./money");
const ai = require("./ai");
const { esc } = require("./template");
const WA = require("./whatsapp");

const text = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const isRec = (id) => /^rec[A-Za-z0-9]{14}$/.test(id || "");
const iso = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const sel = (v) => (v && typeof v === "object" ? v.name : v) || "";
const money = (v, label, { allowZero = false } = {}) => {
  const sen = M.toSen(v);
  if (sen === null || sen < 0 || (!allowZero && sen === 0)) throw bad(`${label} must be an amount in RM.`);
  return sen / 100;
};

const CATS = ["Rent", "Utilities", "Wages", "Workshop supplies", "Sublet (outside work)", "Parts for jobs (no stock)", "Tools & equipment (asset)", "Transport", "Marketing", "Phone & internet", "Bank fees", "Insurance & licences", "Owner drawings", "Other"];
const ORDER = ["Ordered", "Arrived", "Fitted", "Cancelled"];

const expenseOut = (r) => {
  const f = r.fields;
  const rc = Array.isArray(f.Receipt) && f.Receipt.length ? f.Receipt[f.Receipt.length - 1] : null;
  return { id: r.id, description: f.Description || "", date: f.Date || "", category: sel(f.Category) || "Other", amount: f.Amount ?? 0, paidTo: f["Paid to"] || "", method: f.Method || "", notes: f.Notes || "", receipt: rc ? rc.url : null };
};
function expenseFields(b, partial) {
  const fields = {};
  if (!partial || "description" in b) {
    const d = text(b.description, 120);
    if (!d) throw bad("Write what the expense was for.");
    fields.Description = d;
  }
  if (!partial || "amount" in b) fields.Amount = money(b.amount, "Amount");
  if (!partial || "date" in b) fields.Date = iso(b.date) || P.todayKL();
  if (!partial || "category" in b) {
    if (!CATS.includes(b.category)) throw bad("Choose a category.");
    fields.Category = b.category;
  }
  for (const [k, f, max] of [["paidTo", "Paid to", 120], ["method", "Method", 40], ["notes", "Notes", 1000]]) if (k in b) fields[f] = text(b[k], max);
  return fields;
}

const creditOut = (r) => {
  const f = r.fields;
  return { id: r.id, no: f["CN no"] || "", date: f.Date || "", jobId: f["Job record"] || "", invoiceNo: f["Invoice no"] || "", customerName: f["Customer name"] || "", amount: f.Amount ?? 0, reason: f.Reason || "", refund: f["Refund amount"] ?? 0, refundMethod: f["Refund method"] || "", token: f["Link token"] || "" };
};

const supplierOut = (r) => ({ id: r.id, name: r.fields.Name || "", phone: r.fields.Phone || "", contact: r.fields["Contact person"] || "", accountNo: r.fields["Account no"] || "", termsDays: r.fields["Terms days"] ?? null, notes: r.fields.Notes || "" });

const purchaseOut = (r) => {
  const f = r.fields;
  const rc = Array.isArray(f.Receipt) && f.Receipt.length ? f.Receipt[f.Receipt.length - 1] : null;
  return { id: r.id, ref: f.Ref || "", supplier: f.Supplier || "", date: f.Date || "", receiptNo: f["Supplier receipt no"] || "", total: f["Total paid"] ?? 0, items: f.Items || "", status: sel(f["Payment status"]) || "Paid", dueDate: f["Due date"] || "", paidOn: f["Paid on"] || "", receipt: rc ? rc.url : null };
};

const orderOut = (r) => {
  const f = r.fields;
  return { id: r.id, part: f.Part || "", partNo: f["Part no"] || "", supplier: f.Supplier || "", jobId: f["Job record"] || "", docNo: f["Doc no"] || "", plate: f.Plate || "", qty: f.Qty ?? 1, cost: f.Cost ?? null, orderedOn: f["Ordered on"] || "", eta: f.ETA || "", status: sel(f.Status) || "Ordered", notes: f.Notes || "" };
};
function orderFields(b, partial) {
  const fields = {};
  if (!partial || "part" in b) {
    const p = text(b.part, 120);
    if (!p) throw bad("Which part?");
    fields.Part = p;
  }
  for (const [k, f, max] of [["partNo", "Part no", 40], ["supplier", "Supplier", 120], ["docNo", "Doc no", 20], ["notes", "Notes", 1000]]) if (k in b) fields[f] = text(b[k], max);
  if ("plate" in b) fields.Plate = text(b.plate, 20).toUpperCase();
  if ("jobId" in b) fields["Job record"] = isRec(b.jobId) ? b.jobId : "";
  if ("qty" in b) {
    const q = Number(b.qty);
    if (!(q > 0)) throw bad("Quantity must be more than 0.");
    fields.Qty = Math.round(q * 100) / 100;
  }
  if ("cost" in b) fields.Cost = b.cost === "" || b.cost === null ? null : money(b.cost, "Cost", { allowZero: true });
  if ("eta" in b) fields.ETA = iso(b.eta) || null;
  if (!partial) fields["Ordered on"] = iso(b.orderedOn) || P.todayKL();
  if ("status" in b) {
    if (!ORDER.includes(b.status)) throw bad("Unknown status.");
    fields.Status = b.status;
  }
  return fields;
}

// Client page for a credit note.
function creditNotePage(cn, job, company) {
  const row = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>Credit note ${esc(cn.no)}</title><style>
body{margin:0;background:#e9ebef;font:14px/1.5 Arial,Arimo,sans-serif;color:#111}.p{max-width:760px;margin:16px auto;background:#fff;padding:32px 36px;box-shadow:0 1px 6px rgba(0,0,0,.15)}
.lh{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #111;padding-bottom:10px;flex-wrap:wrap}.lh b{font-size:20px}.co{text-align:right;font-size:12px;color:#333}
h1{text-align:center;font-size:24px;margin:18px 0}table{width:100%;border-collapse:collapse}th,td{border:1px solid #8a8a8a;padding:7px 10px;text-align:left;vertical-align:top}th{background:#e2e2e2;width:38%;font-size:13px}
.big{font-size:20px;font-weight:700}.f{border-top:1px solid #8a8a8a;margin-top:28px;padding-top:6px;font-size:12px;color:#333}
@media print{body{background:#fff}.p{box-shadow:none;margin:0}.bar{display:none}}.bar{text-align:center;margin:16px}.bar button{font:700 16px Arial;padding:12px 26px;border:0;border-radius:10px;background:#111;color:#fff}
</style></head><body><div class="p">
<div class="lh"><div><b>${esc(company.brandName || "THE MERC LAB")}</b>${company.hotline ? `<div>Hotline ${esc(company.hotline)}</div>` : ""}</div>
<div class="co"><div style="font-size:15px;font-weight:700;color:#111">${esc(company.legalName)}</div>${company.registrationNo ? `<div>SSM Registration No: ${esc(company.registrationNo)}</div>` : ""}${company.address ? `<div>${esc(company.address).replace(/\n/g, ", ")}</div>` : ""}${[company.tel, company.email].filter(Boolean).length ? `<div>${[company.tel ? "Tel: " + esc(company.tel) : "", esc(company.email || "")].filter(Boolean).join(" · ")}</div>` : ""}</div></div>
<h1>CREDIT NOTE</h1>
<table>${row("Credit Note No.", esc(cn.no))}${row("Date", esc(cn.date.split("-").reverse().join("/")))}${row("Customer", esc(cn.customerName))}${row("For Invoice No.", esc(cn.invoiceNo))}
${row("Vehicle", esc([job?.car, job?.plate].filter(Boolean).join(" · ")))}${row("Reason", esc(cn.reason).replace(/\n/g, "<br>"))}
${row("Amount Credited (RM)", `<span class="big">${M.fmt(Math.round(cn.amount * 100))}</span>`)}${cn.refund ? row("Refunded to Customer (RM)", `${M.fmt(Math.round(cn.refund * 100))}${cn.refundMethod ? " by " + esc(cn.refundMethod) : ""}`) : ""}</table>
<div class="f">This is a computer generated credit note, no signature is required. ${esc(company.legalName)}</div></div>
<div class="bar"><button onclick="window.print()">Save as PDF / Print</button></div></body></html>`;
}

function register(router, { wrap, oneFile, fileOf, bodyData, jobOut, newToken }) {
  const crud = (path, table, out, fieldsFn, sort) => {
    router.get(`/${path}`, wrap(async (req, res) => {
      const list = (await db.list(table)).map(out);
      if (sort) list.sort(sort);
      res.json({ [path]: list });
    }));
    router.patch(`/${path}/:id`, wrap(async (req, res) => {
      if (!isRec(req.params.id)) throw bad("Unknown record.");
      await db.get(table, req.params.id);
      const [row] = await db.update(table, [{ id: req.params.id, fields: fieldsFn(req.body || {}, true) }]);
      res.json(out(row));
    }));
  };
  const byDateDesc = (k) => (a, b) => (b[k] || "").localeCompare(a[k] || "");

  // Expenses
  crud("expenses", "expenses", expenseOut, expenseFields, byDateDesc("date"));
  router.post("/expenses/extract", oneFile, wrap(async (req, res) => {
    const file = fileOf(req);
    if (!file) throw bad("Please choose the receipt photo or PDF.");
    let s;
    try {
      s = await ai.readPurchase(file);
    } catch (err) {
      return res.status(err.status === 503 ? 503 : 502).json({ error: err.message });
    }
    res.json({ suggestion: { paidTo: s.supplier || "", date: s.date || "", amount: s.total ?? null, description: s.items?.[0]?.name ? (s.items.length > 1 ? `${s.items[0].name} and ${s.items.length - 1} more` : s.items[0].name) : s.supplier || "" } });
  }));
  router.post("/expenses", oneFile, wrap(async (req, res) => {
    const d = bodyData(req);
    const inbox = await WA.takeFromInbox(d.inboxId);
    const [row] = await db.create("expenses", [expenseFields(d, false)]);
    const file = fileOf(req);
    let fileSaved = true;
    if (inbox) {
      if (inbox.file) await db.update("expenses", [{ id: row.id, fields: { Receipt: [{ url: inbox.file.url, filename: inbox.file.filename }] } }]).catch(() => (fileSaved = false));
      await WA.markSaved(d.inboxId, `Expense: ${row.fields.Description}`);
    } else if (file) {
      try {
        await db.upload("expenseReceipt", row.id, { filename: file.filename, contentType: file.mimeType, base64: file.base64 });
      } catch {
        fileSaved = false;
      }
    }
    res.status(201).json({ expense: expenseOut(row), fileSaved });
  }));

  // Credit notes
  router.get("/creditnotes", wrap(async (req, res) => {
    res.json({ creditnotes: (await db.list("credits")).map(creditOut).sort((a, b) => b.no.localeCompare(a.no)) });
  }));
  router.post("/creditnotes", wrap(async (req, res) => {
    const b = req.body || {};
    if (!isRec(b.jobId)) throw bad("Choose the invoice.");
    const j = jobOut(await db.get("quotes", b.jobId));
    if (!j.invoiceNo) throw bad("A credit note is only for an invoice. Change the estimate instead.");
    if (j.status === "Cancelled") throw bad("This job is cancelled.");
    const amount = money(b.amount, "Amount");
    const left = P.round2(j.total - j.credited);
    if (amount - left > 0.009) throw bad(`The most you can credit on ${j.invoiceNo} is RM${M.fmt(Math.round(left * 100))}.`);
    const reason = text(b.reason, 1000);
    if (!reason) throw bad("Write the reason for the credit note.");
    const credited = P.round2(j.credited + amount);
    const net = P.round2(j.total - credited);
    const refundBefore = Math.max(0, P.round2(j.paid - left));
    const refund = P.round2(Math.max(0, j.paid - net) - refundBefore);
    const balance = Math.max(0, P.round2(net - j.paid));
    const status = balance > 0 ? (j.paid > 0 ? "Part paid" : j.status) : net <= 0.009 && j.paid <= 0 ? "Credited" : "Paid";
    const today = P.todayKL();
    const existing = await db.list("credits", { fields: ["CN no"] });
    const [row] = await db.create("credits", [{
      "CN no": P.nextNumber("CN", existing.map((r) => r.fields["CN no"]), today),
      Date: today, "Job record": j.id, "Invoice no": j.invoiceNo, "Customer name": j.customerName, Amount: amount, Reason: reason,
      "Refund amount": refund, "Refund method": refund ? text(b.refundMethod, 40) || "Bank transfer" : "", "Link token": newToken("c"),
    }]);
    const [jr] = await db.update("quotes", [{ id: j.id, fields: { Credited: credited, Balance: balance, Status: status } }]);
    res.status(201).json({ creditnote: creditOut(row), job: jobOut(jr) });
  }));

  // Suppliers
  const supplierFields = (b, partial) => {
    const fields = {};
    if (!partial || "name" in b) {
      const n = text(b.name, 120);
      if (!n) throw bad("Supplier name is needed.");
      fields.Name = n;
    }
    for (const [k, f, max] of [["phone", "Phone", 30], ["contact", "Contact person", 80], ["accountNo", "Account no", 40], ["notes", "Notes", 1000]]) if (k in b) fields[f] = text(b[k], max);
    if ("termsDays" in b) fields["Terms days"] = b.termsDays === "" || b.termsDays === null ? null : Math.max(0, Math.min(365, Math.round(Number(b.termsDays) || 0)));
    return fields;
  };
  crud("suppliers", "suppliers", supplierOut, supplierFields, (a, b) => a.name.localeCompare(b.name));
  router.post("/suppliers", wrap(async (req, res) => {
    const [row] = await db.create("suppliers", [supplierFields(req.body || {}, false)]);
    res.status(201).json(supplierOut(row));
  }));

  // Supplier receipts: paid or still owed.
  crud("purchases", "purchases", purchaseOut, (b) => {
    const fields = {};
    if ("status" in b) {
      if (!["Paid", "Unpaid"].includes(b.status)) throw bad("Unknown payment status.");
      fields["Payment status"] = b.status;
      fields["Paid on"] = b.status === "Paid" ? iso(b.paidOn) || P.todayKL() : null;
    }
    if ("dueDate" in b) fields["Due date"] = iso(b.dueDate) || null;
    return fields;
  }, byDateDesc("date"));

  // Parts ordered for a job
  crud("partorders", "orders", orderOut, orderFields, byDateDesc("orderedOn"));
  router.post("/partorders", wrap(async (req, res) => {
    const [row] = await db.create("orders", [{ Status: "Ordered", Qty: 1, ...orderFields(req.body || {}, false) }]);
    res.status(201).json(orderOut(row));
  }));

  // Stock count: set the counted quantities and keep a record of each change.
  router.get("/stockadjustments", wrap(async (req, res) => {
    const list = (await db.list("adjustments")).map((r) => ({ id: r.id, part: r.fields.Part || "", partId: r.fields["Part record"] || "", date: r.fields.Date || "", before: r.fields.Before ?? 0, after: r.fields.After ?? 0, reason: r.fields.Reason || "" }));
    res.json({ stockadjustments: list.sort(byDateDesc("date")) });
  }));
  router.post("/stockcount", wrap(async (req, res) => {
    const b = req.body || {};
    const counts = (Array.isArray(b.counts) ? b.counts : []).filter((c) => isRec(c.id) && c.qty !== "" && c.qty !== null && Number.isFinite(Number(c.qty)));
    if (!counts.length) throw bad("No counts entered.");
    const parts = new Map((await db.list("parts")).map((r) => [r.id, r]));
    const reason = text(b.reason, 120) || "Stock count";
    const updates = [];
    const rows = [];
    for (const c of counts) {
      const p = parts.get(c.id);
      if (!p) continue;
      const before = p.fields["Qty left"] ?? 0;
      const after = Math.round(Number(c.qty) * 100) / 100;
      if (after < 0) throw bad(`Count for ${p.fields.Part} cannot be below 0.`);
      if (Math.abs(after - before) < 0.001) continue;
      updates.push({ id: c.id, fields: { "Qty left": after } });
      rows.push({ Part: p.fields.Part || "", "Part record": c.id, Date: P.todayKL(), Before: before, After: after, Reason: reason });
    }
    if (updates.length) {
      await db.update("parts", updates);
      await db.create("adjustments", rows);
    }
    res.json({ changed: updates.length });
  }));
}

module.exports = { register, creditNotePage, creditOut, CATS };
