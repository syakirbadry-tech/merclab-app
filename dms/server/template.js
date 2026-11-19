// One A4 template for ESTIMATE, INVOICE and OFFICIAL RECEIPT (handover
// docs/handover/HANDOVER-document-templates.md). Layout copied from
// docs/handover/reference-estimate.html. Input: a document object (see
// buildDocument / the JSON in the handover section 7) + the company config.

const { fmt, computeTotals, lineSen } = require("./money");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dmy = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || "") ? iso.split("-").reverse().join("/") : esc(iso || ""));
const dash = (v) => (v === null || v === undefined || v === "" ? "—" : esc(v));

// Page capacity in table "row units" (one normal 19px line = 1; each extra
// wrapped description line adds 15px). Measured with Chromium at A4 by
// scripts/check-layout.js: the reference (13 lines + 2 job headers, car model
// wrapping to 2 lines) fills one page with 15 rows. Pages without the totals
// and bottom section hold about 12 more rows.
const LAST_PAGE_ROWS = 15;
const MIDDLE_PAGE_ROWS = 27;
const DESC_WIDTH_PX = 330; // description column at A4, minus padding

const TITLES = { estimate: "ESTIMATE", invoice: "INVOICE", receipt: "OFFICIAL RECEIPT" };
const FOOTER_WORD = { estimate: "estimate", invoice: "invoice", receipt: "receipt" };

class DocumentError extends Error {
  constructor(msg) {
    super(msg);
    this.status = 400;
  }
}

function validate(doc) {
  if (!TITLES[doc.type]) throw new DocumentError(`Unknown document type "${doc.type}".`);
  const km = Number(doc.vehicle?.mileageKm);
  if (!(km > 0)) throw new DocumentError("Mileage (Km) is missing or 0. Enter the car's mileage before making the document.");
  if (!Array.isArray(doc.groups) || !doc.groups.length) throw new DocumentError("The document has no lines.");
  if (doc.type === "invoice" && !doc.repairDate) throw new DocumentError("Repair date is needed on an invoice.");
  if (doc.type === "receipt" && !(Number(doc.payment?.amount) > 0)) throw new DocumentError("Receipt has no payment amount.");
}

// ---------- rows ----------

function tableRows(doc, company) {
  const rows = [];
  if (doc.type === "receipt" && company.receiptLineItems === "summary") {
    rows.push({ kind: "line", code: "", cat: "", desc: `${doc.invoiceNo ? "INVOICE" : "ESTIMATE"} ${doc.invoiceNo || doc.estimateNo || ""}${doc.invoiceDate ? " DATED " + dmy(doc.invoiceDate) : ""}`, amount: doc.totals.grand });
    rows.push({ kind: "gap", h: 3 });
    return rows;
  }
  doc.groups.forEach((g, gi) => {
    if (gi > 0) rows.push({ kind: "gap", h: 8 });
    rows.push({ kind: "request", code: g.code, cat: "Customer request", desc: g.request || "", amount: 0 });
    if (g.lines.length) rows.push({ kind: "gap", h: 6 });
    for (const l of g.lines) {
      rows.push({
        kind: "line",
        code: g.code,
        cat: l.type === "labour" ? l.opCode || "" : l.type === "part" ? "" : l.category || "",
        desc: l.description,
        qty: l.type === "part" ? l.qty : null,
        unit: l.type === "part" ? l.unitPrice : null,
        amount: lineSen(l),
      });
    }
  });
  rows.push({ kind: "gap", h: 3 });
  return rows;
}

// Rough text width at 13.33px Arial/Arimo: capitals and digits are wider.
function textWidth(s) {
  let w = 0;
  for (const ch of String(s)) w += /[A-Z0-9@#%&MW]/.test(ch) ? 9.2 : /[a-z]/.test(ch) ? 7 : ch === " " ? 3.8 : 5;
  return w;
}
const descLines = (desc) => Math.max(1, Math.ceil(textWidth(desc) / DESC_WIDTH_PX));
const rowUnits = (r) => (r.kind === "gap" ? 0 : 1 + (descLines(r.desc) - 1) * (15 / 19));

// Split rows into pages. The last page keeps the totals, bottom section and
// footer together, so it holds fewer rows.
function paginate(rows) {
  const units = (rs) => rs.reduce((t, r) => t + rowUnits(r), 0);
  if (units(rows) <= LAST_PAGE_ROWS) return [rows];
  const pages = [];
  let rest = rows.slice();
  while (units(rest) > LAST_PAGE_ROWS) {
    const cap = Math.min(MIDDLE_PAGE_ROWS, units(rest) - 1); // leave at least one row for the last page
    let take = 0, u = 0;
    while (take < rest.length && u + rowUnits(rest[take]) <= cap) u += rowUnits(rest[take++]);
    if (take === 0) take = 1;
    pages.push(rest.slice(0, take));
    rest = rest.slice(take);
    while (rest.length && rest[0].kind === "gap") rest.shift(); // no gap at the top of a page
  }
  pages.push(rest);
  return pages;
}

// ---------- pieces ----------

const V = 'style="border-left: 1px solid #8a8a8a"';

function rowHtml(r, first) {
  if (r.kind === "gap") return `<tr class="gap"><td style="height: ${r.h}px"></td><td></td><td></td><td ${V}></td><td ${V}></td><td ${V}></td></tr>`;
  const p = first ? "4px 4px 2px" : "2px 4px";
  const p6 = first ? "4px 6px 2px" : "2px 6px";
  const p8 = first ? "4px 8px 2px" : "2px 8px";
  const num = (v) => (v === null || v === undefined ? "" : Number(v).toFixed(2));
  return `<tr><td style="padding: ${p}">${esc(r.code)}</td><td style="padding: ${p6}">${esc(r.cat)}</td><td style="padding: ${p6}">${esc(r.desc)}</td>`
    + (r.qty !== null && r.qty !== undefined
      ? `<td class="r" style="padding: ${p6}; border-left: 1px solid #8a8a8a">${num(r.qty)}</td><td class="r" style="padding: ${p6}; border-left: 1px solid #8a8a8a">${fmt(Math.round(r.unit * 100))}</td>`
      : `<td ${V}></td><td ${V}></td>`)
    + `<td class="r" style="padding: ${p8}; border-left: 1px solid #8a8a8a">${fmt(r.amount)}</td></tr>`;
}

function logoHtml(c) {
  const [first, ...rest] = String(c.brandName || "THE MERC LAB").split(" ");
  const last = rest.pop() || "";
  const middle = rest.join(" ");
  return `<div class="logo" role="img" aria-label="${esc(c.brandName)}">
<div class="logo-the">${esc(first)}</div>
<div class="logo-row"><div class="logo-word">${esc(middle)}</div><div class="logo-box"><div class="logo-word">${esc(last)}</div></div></div>
<svg width="100%" height="9" viewBox="0 0 330 16" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,8 150,8 158,2 166,14 174,0 182,16 190,8 330,8" fill="none" stroke="#111111" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"></polyline></svg>
<div class="logo-tag">${esc(String(c.tagline || "").toUpperCase())}</div>
</div>`;
}

function letterhead(c) {
  return `<div class="letterhead">
<div style="display: flex; flex-direction: column; gap: 4px">${logoHtml(c)}<div class="hotline">Hotline ${esc(c.hotline)}</div></div>
<div class="company">
<div class="legal">${esc(c.legalName)}</div>
<div>SSM Registration No: ${esc(c.registrationNo)}</div>
${c.sstRegistrationNo ? `<div>SST Registration No: ${esc(c.sstRegistrationNo)}</div>` : ""}
<div>${esc(c.address).replace(/\n/g, ", ")}</div>
<div>Tel: ${esc(c.tel)} · ${esc(c.email)}</div>
</div></div>`;
}

function partyBoxes(doc) {
  const lines = (arr) => (arr || []).filter(Boolean).slice(0, 3).map((l) => `<div>${esc(l)}</div>`).join("");
  return `<div class="parties">
<div class="box"><div class="box-h">Invoice To</div><div class="party"><div>${esc(doc.invoiceTo?.name)}</div>${lines(doc.invoiceTo?.address)}</div></div>
<div class="box"><div class="box-h">Customer</div><div class="party"><div>${esc(doc.customer?.name)}</div>${lines(doc.customer?.address)}</div></div>
</div>`;
}

function grid(doc, pageNo, pageCount) {
  const t = doc.type;
  const rowA = {
    estimate: ["Repair Date", dash(doc.repairDate ? dmy(doc.repairDate) : ""), "Order Number", dash(doc.orderNo)],
    invoice: ["Repair Date", dash(dmy(doc.repairDate)), "Due Date", dash(doc.dueDate ? dmy(doc.dueDate) : "")],
    receipt: ["Payment Date", dash(dmy(doc.payment?.date)), doc.invoiceNo ? "Invoice No." : "Estimate No.", dash(doc.invoiceNo || doc.estimateNo)],
  }[t];
  const v = doc.vehicle || {};
  const km = Number(v.mileageKm).toLocaleString("en-MY");
  const page = pageCount > 1 ? `${pageNo} of ${pageCount}` : "1";
  const H = (cells) => `<div class="g-h">${cells}</div>`;
  const R = (cells) => `<div class="g-v">${cells}</div>`;
  return `<div class="grid">
${H(`<div>Account No.</div><div>Document Number</div><div>Document Date</div><div>${rowA[0]}</div><div style="grid-column: span 2">${rowA[2]}</div>`).replace('class="g-h"', 'class="g-h first"')}
${R(`<div>${dash(doc.accountNo)}</div><div>${dash(doc.number)}</div><div>${dash(dmy(doc.date))}</div><div>${rowA[1]}</div><div style="grid-column: span 2">${rowA[3]}</div>`)}
${H(`<div>Make &amp; Model</div><div>Chassis No.</div><div>Engine No.</div><div>Km</div><div>Time</div><div>Page</div>`)}
${R(`<div>${dash(v.makeModel)}</div><div>${dash(v.chassisNo)}</div><div>${dash(v.engineNo)}</div><div>${km}</div><div>${dash(doc.time)}</div><div class="nowrap">${page}</div>`)}
${H(`<div>Reference No.</div><div>Reg No.</div><div>Reg Date</div><div>WIP No.</div><div style="grid-column: span 2">Job No.</div>`)}
${R(`<div>${dash(doc.referenceNo)}</div><div>${dash(v.regNo)}</div><div>${dash(v.regDate ? dmy(v.regDate) : "")}</div><div>${dash(doc.wipNo)}</div><div style="grid-column: span 2">${dash(doc.jobNo)}</div>`)}
</div>`;
}

function totalsRows(doc, sstOn, rate) {
  const t = doc.totals;
  const cell = (label, amount, extra = "") => `<tr${extra}><td colspan="3" class="r" style="padding: 5px 8px; border-top: 1px solid #8a8a8a">${label}</td><td style="border-left: 1px solid #8a8a8a; border-top: 1px solid #8a8a8a"></td><td style="border-left: 1px solid #8a8a8a; border-top: 1px solid #8a8a8a"></td><td class="r" style="padding: 5px 8px; border-left: 1px solid #8a8a8a; border-top: 1px solid #8a8a8a">${fmt(amount)}</td></tr>`;
  let out = "";
  if (sstOn) {
    const pct = Math.round(rate * 10000) / 100;
    out += cell("Total Amount Exclusive of Service Tax", t.subtotal);
    out += cell(`Service Tax @ ${pct}%`, t.tax);
    out += cell("Total Amount Inclusive of Service Tax", t.inclTax);
  } else {
    out += cell("Total Amount", t.subtotal);
  }
  if (t.rounding) out += cell("Rounding Adjustment", t.rounding);
  out += `<tr class="grand"><td colspan="5" class="r" style="padding: 5px 8px; border-top: 1px solid #8a8a8a">Grand Total (RM)</td><td class="r" style="padding: 5px 8px; border-left: 1px solid #8a8a8a; border-top: 1px solid #8a8a8a">${fmt(t.grand)}</td></tr>`;
  return out;
}

function table(doc, rows, isLast, sstOn, rate) {
  const body = rows.map((r, i) => rowHtml(r, i === 0)).join("");
  const foot = isLast
    ? totalsRows(doc, sstOn, rate)
    : `<tr><td colspan="6" class="r" style="padding: 5px 8px; border-top: 1px solid #8a8a8a; font-style: italic">Continued on next page</td></tr>`;
  return `<table class="items">
<thead><tr>
<th scope="col" style="width: 22px; padding: 4px 4px"></th>
<th scope="col" style="width: 120px; padding: 4px 6px"></th>
<th scope="col" class="c" style="padding: 4px 6px">Description</th>
<th scope="col" class="c bl" style="width: 54px; padding: 4px 6px">Qty.</th>
<th scope="col" class="c bl" style="width: 80px; padding: 4px 6px">Unit Price</th>
<th scope="col" class="c bl" style="width: 90px; padding: 4px 8px">RM</th>
</tr></thead>
<tbody>${body}</tbody>
<tfoot>${foot}</tfoot>
</table>`;
}

function warrantyLine(c) {
  const m = c.partsWarrantyMonths === null || c.partsWarrantyMonths === undefined || c.partsWarrantyMonths === "" ? "[X]" : esc(c.partsWarrantyMonths);
  return `<p>Parts supplied are genuine Mercedes-Benz or OEM-equivalent, as listed. Customer-pay parts carry a ${m}-month parts warranty (excluding service maintenance and wear &amp; tear components).</p>`;
}

function bottom(doc, c) {
  const t = doc.totals;
  const terms = {
    estimate: `<p>Price subject to change without prior notification. Price estimated is valid for ${esc(c.estimateValidityDays)} days.</p>${warrantyLine(c)}`,
    invoice: `${warrantyLine(c)}<p>Payment is due ${doc.dueDate ? `by ${dmy(doc.dueDate)}` : "on vehicle collection"}. Vehicles are released after full payment.</p>`,
    receipt: `<p>Received with thanks.</p>${warrantyLine(c)}`,
  }[doc.type];
  const advisor = doc.advisor?.name || doc.advisor?.operatorId
    ? `<div style="font-size: 12px; font-weight: 700; margin-top: 2px">You were served by: ${esc(doc.advisor?.name || "")} &#160;Operator: ${esc(doc.advisor?.operatorId || "")}</div>`
    : "";
  const summary = `<div class="summary">
<div>Parts</div><div class="r">${fmt(t.parts)}</div>
<div>Surcharge</div><div class="r">${fmt(t.surcharge)}</div>
<div>Labour</div><div class="r">${fmt(t.labour)}</div>
<div>Sublet/Sundries</div><div class="r">${fmt(t.sublet)}</div>
<div>Menus</div><div class="r">${fmt(t.menus)}</div>
</div>`;

  let box;
  const kv = (k, v) => `<div style="font-weight: 700">${k}</div><div style="font-size: 13.33px">${v}</div>`;
  if (doc.type === "receipt") {
    const p = doc.payment;
    box = `<div class="box" style="align-self: start"><div class="box-h">Payment Received</div>
<div style="padding: 8px"><div class="kv">
${kv("Date", dmy(p.date))}${kv("Method", esc(p.method))}${kv("Transaction Ref", dash(p.reference))}
${kv("Amount Received", `<b>RM ${fmt(Math.round(p.amount * 100))}</b>`)}${kv("Balance Outstanding", `RM ${fmt(doc.balanceAfterSen ?? 0)}`)}
</div></div></div>`;
  } else {
    const ref = [doc.number, doc.vehicle?.regNo].filter(Boolean).map(esc).join(" / ");
    const qr = c.duitNowQrImage
      ? `<img src="${esc(c.duitNowQrImage)}" alt="DuitNow QR" style="width: 80px; height: 80px; flex-shrink: 0; object-fit: contain">`
      : `<div class="qr"><div>DuitNow</div><div>QR</div></div>`;
    const due = doc.type === "invoice"
      ? kv("Amount Due", `<b>RM ${fmt(doc.amountDueSen ?? t.grand)}</b>`) + kv("Due Date", dash(doc.dueDate ? dmy(doc.dueDate) : "On collection"))
      : "";
    box = `<div class="box" style="align-self: start"><div class="box-h">Payment Details</div>
<div style="display: flex; gap: 12px; padding: 8px"><div class="kv" style="flex: 1">
${kv("Bank", esc(c.bank?.name))}${kv("Account Name", esc(c.bank?.accountName || c.legalName))}${kv("Account No.", esc(c.bank?.accountNo))}${kv("Reference", ref || "Doc No. / Reg No.")}${due}
</div>${qr}</div>
<div style="border-top: 1px solid #b5b5b5; padding: 5px 8px; font-size: 12px; line-height: 15px">Payment due on vehicle collection. Please send proof of payment to ${esc(c.whatsapp)}.</div>
</div>`;
  }
  return `<div class="bottom"><div class="terms">${terms}${advisor}${summary}</div>${box}</div>`;
}

function footer(doc, c) {
  return `<div class="footer"><div>${esc(c.brandName ? titleCase(c.brandName) : "The Merc Lab")} is a trading name of ${esc(c.legalName)}</div><div>This is a computer generated ${FOOTER_WORD[doc.type]}, no signature is required.</div></div>`;
}
const titleCase = (s) => String(s).toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());

const CSS = `
@font-face{font-family:Arimo;font-weight:400;src:url(/fonts/arimo-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:Arimo;font-weight:700;src:url(/fonts/arimo-latin-700-normal.woff2) format("woff2")}
@page{size:A4;margin:0}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#ffffff}
.page{width:794px;height:1123px;box-sizing:border-box;padding:30px 40px 26px;display:flex;flex-direction:column;gap:8px;background:#ffffff;color:#111111;font-family:Arial,Arimo,Helvetica,sans-serif;position:relative;overflow:hidden;break-after:page;page-break-after:always}
.page:last-child{break-after:auto;page-break-after:auto}
.wm{position:absolute;left:0;right:0;top:548px;text-align:center;font-size:78px;font-weight:700;color:rgba(0,0,0,0.06);pointer-events:none}
.letterhead{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:10px;border-bottom:2px solid #111111}
.logo{display:flex;flex-direction:column;gap:3px;align-self:flex-start}
.logo-the{font-size:12px;font-weight:700;letter-spacing:0.5em;line-height:1}
.logo-row{display:flex;align-items:stretch;gap:5px}
.logo-word{font-size:36px;font-weight:700;line-height:0.82;letter-spacing:-0.01em;padding:3px 0}
.logo-box{background:#111111;color:#ffffff;padding:3px 7px;display:flex;align-items:center}
.logo-box .logo-word{padding:0}
.logo-tag{font-size:12px;font-weight:700;letter-spacing:0.06em;line-height:1}
.hotline{font-size:19px;font-weight:700;margin-top:4px;letter-spacing:0.02em}
.company{text-align:right;font-size:12px;line-height:16px;color:#222222}
.company .legal{font-size:16px;font-weight:700;color:#111111;margin-bottom:2px}
.parties{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px;margin-top:4px}
.box{border:1px solid #8a8a8a}
.box-h{background:#e2e2e2;border-bottom:1px solid #8a8a8a;padding:3px 8px;font-size:12px;font-weight:700}
.party{padding:6px 8px;height:60px;box-sizing:border-box;font-size:13.33px;font-weight:400;line-height:17px;overflow:hidden}
h1{margin:2px 0 0;text-align:center;font-size:24px;font-weight:700;line-height:30px}
.grid{border:1px solid #8a8a8a;font-size:12px}
.g-h,.g-v{display:grid;grid-template-columns:1.75fr 1.35fr 1.2fr 0.9fr 0.6fr 0.45fr;gap:8px}
.g-h{background:#e2e2e2;border-top:1px solid #b5b5b5;border-bottom:1px solid #b5b5b5;font-weight:700;padding:3px 8px}
.g-h.first{border-top:0}
.g-v{padding:4px 8px;font-weight:400;font-size:13.33px}
.g-v>div{overflow-wrap:anywhere;min-width:0}
.nowrap{white-space:nowrap}
table.items{width:100%;border-collapse:collapse;border:1px solid #8a8a8a;font-size:13.33px;line-height:15px;margin-top:4px}
table.items thead tr{background:#e2e2e2;font-size:12px;font-weight:700}
table.items th{border-bottom:1px solid #8a8a8a}
table.items .bl{border-left:1px solid #8a8a8a}
table.items tbody,table.items tfoot{font-weight:400}
table.items tr.grand{background:#e2e2e2;font-weight:700}
table.items tr.grand td{font-size:18.67px}
.r{text-align:right}.c{text-align:center}
.bottom{display:grid;grid-template-columns:1.1fr 1fr;gap:20px;margin-top:4px}
.terms{display:flex;flex-direction:column;gap:6px;font-size:12px;line-height:15px}
.terms p{margin:0}
.summary{display:grid;grid-template-columns:110px 80px;row-gap:1px;font-weight:400;font-size:13.33px;line-height:15px}
.kv{display:grid;grid-template-columns:96px minmax(0,1fr);row-gap:3px;column-gap:6px;font-size:12px;line-height:15px;align-content:start}
.qr{width:80px;height:80px;flex-shrink:0;border:1px dashed #767676;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:12px;font-weight:700;text-align:center}
.spacer{flex-grow:1}
.footer{border-top:1px solid #8a8a8a;padding-top:6px;display:flex;justify-content:space-between;align-items:baseline;font-size:12px}
`;

// Screen-only extras (page shadow, fit-to-phone, print button).
const SCREEN_CSS = `
@media screen{body{background:#e9ebef;padding:12px 0 80px}.sheet{display:flex;flex-direction:column;align-items:center;gap:16px}.page{box-shadow:0 1px 6px rgba(0,0,0,.18)}
.bar{position:fixed;left:0;right:0;bottom:0;display:flex;justify-content:center;padding:12px;background:rgba(233,235,239,.95)}
.bar button{font:700 16px Arial,sans-serif;padding:14px 28px;border:0;border-radius:10px;background:#111;color:#fff;max-width:420px;width:100%}}
@media print{.bar{display:none}.sheet{zoom:1!important}}
`;

function render(doc, company, { screen = true, fontBase = "/fonts/" } = {}) {
  validate(doc);
  const sstOn = !!company.sstRegistrationNo;
  const rate = Number(company.serviceTaxRate) || 0;
  if (!doc.totals) {
    doc.totals = computeTotals(doc.groups, { surcharge: doc.surcharge, menus: doc.menus, sst: { on: sstOn, rate }, round5: !!company.roundTo5Sen });
  }
  const title = doc.type === "invoice" && sstOn ? "TAX INVOICE" : TITLES[doc.type];
  const watermark = doc.type === "estimate" ? (company.estimateWatermark !== false ? "Customer copy" : "") : doc.type === "receipt" ? "PAID" : "";
  const pages = paginate(tableRows(doc, company));
  const html = pages.map((rows, i) => {
    const last = i === pages.length - 1;
    return `<div class="page">
${watermark ? `<div class="wm" aria-hidden="true">${watermark}</div>` : ""}
${letterhead(company)}
${partyBoxes(doc)}
<h1>${title}</h1>
${grid(doc, i + 1, pages.length)}
${table(doc, rows, last, sstOn, rate)}
${last ? bottom(doc, company) : ""}
<div class="spacer"></div>
${footer(doc, company)}
</div>`;
  }).join("\n");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${esc(title)} ${esc(doc.number)}</title>
<style>${CSS.split("url(/fonts/").join("url(" + fontBase)}${screen ? SCREEN_CSS : ""}</style></head><body>
<div class="sheet" id="sheet">${html}</div>
${screen ? `<div class="bar"><button onclick="window.print()">Save as PDF / Print</button></div>
<script>(function(){function fit(){var s=document.getElementById("sheet");var z=Math.min(1,(window.innerWidth-16)/794);s.style.zoom=z}fit();window.addEventListener("resize",fit)})()</script>` : ""}
</body></html>`;
}

module.exports = { render, paginate, tableRows, validate, DocumentError, LAST_PAGE_ROWS, MIDDLE_PAGE_ROWS, esc, CSS };
