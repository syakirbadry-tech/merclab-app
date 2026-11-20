// One A4 template for ESTIMATE, INVOICE and OFFICIAL RECEIPT.
// Layout v3 (handover HANDOVER.md section 4B, 20 Nov 2026): centred letterhead,
// BILL TO block + document block, 4-column item table, notes + totals,
// signature lines and footer. The section 4A rules still apply: the customer
// copy never prints placeholders or empty labels; the staff (draft) view shows
// missing details as amber "Fill in: …" chips that never print.
//
// Input: a document object (see docs.js jobDoc / receiptDoc, handover section 7)
// + the company config (config/company.json merged with the owner's Settings).
// Money is integer sen throughout (server/money.js).

const { fmt, computeTotals, lineSen, toSen } = require("./money");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isIso = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
const dmy = (iso) => (isIso(iso) ? iso.split("-").reverse().join("/") : String(iso || ""));
const has = (v) => !(v === null || v === undefined || String(v).trim() === "");
const addDays = (iso, n) => {
  if (!isIso(iso) || !(Number(n) > 0)) return "";
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + Number(n));
  return d.toISOString().slice(0, 10);
};
// 1 → "1", 1.2 → "1.2", 1.25 → "1.25"
const qtyText = (q) => String(Math.round(Number(q) * 100) / 100);
// "123456789012" → "1234 5678 9012"
const groupDigits = (s) => (/^\d{8,20}$/.test(String(s).replace(/\s/g, "")) ? String(s).replace(/\s/g, "").replace(/(\d{4})(?=\d)/g, "$1 ") : String(s));

const TITLES = { estimate: "ESTIMATE", invoice: "INVOICE", receipt: "OFFICIAL RECEIPT" };
const WORD = { estimate: "estimate", invoice: "invoice", receipt: "receipt" };
const DEFAULT_BILL_TO = "service retail cash sales";

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
// Each table row: { kind: "group", text } or { kind: "line", desc, op, qty, unit (sen), amount (sen) }.
// Labour priced by hours prints hours × rate; every other line without a
// quantity prints 1 × its amount (as on the reference documents).

function lineRow(l) {
  const amount = lineSen(l);
  if (l.type === "part") return { kind: "line", desc: l.description, op: "", qty: l.qty, unit: toSen(l.unitPrice), amount };
  const h = Number(l.hours);
  if (l.type === "labour" && h > 0) {
    const unit = Math.round(amount / h);
    if (Math.round(unit * h) === amount) return { kind: "line", desc: l.description, op: l.opCode || "", qty: h, unit, amount };
  }
  return { kind: "line", desc: l.description, op: l.type === "labour" ? l.opCode || "" : "", qty: 1, unit: amount, amount };
}

function tableRows(doc, company) {
  if (doc.type === "receipt" && company.receiptLineItems === "summary") {
    const grand = doc.totals.grand;
    const ref = doc.invoiceNo ? `INVOICE ${doc.invoiceNo}` : `ESTIMATE ${doc.estimateNo || ""}`;
    return [{ kind: "line", desc: `${ref}${doc.invoiceDate ? " DATED " + dmy(doc.invoiceDate) : ""}`, op: "", qty: 1, unit: grand, amount: grand }];
  }
  const rows = [];
  for (const g of doc.groups) {
    if (has(g.request)) rows.push({ kind: "group", text: `${g.code ? g.code + " · " : ""}${g.request}` });
    for (const l of g.lines) rows.push(lineRow(l));
  }
  return rows;
}

// ---------- page fit ----------
// Measured with Chromium at A4 (scripts/check-layout.js): a line row is 23px
// and each wrapped description line adds 18px; a job-group row is 27px. The
// signature lines start at 1027px and the footer at 1072px on every page; the
// spacer above them is at least 44px. The table body starts below the
// letterhead (188px), the BILL TO block and the table head (48px).
const SIGN_TOP = 1027;
const FOOT_TOP = 1072;
const SPACER_MIN = 44;
const DESC_WIDTH_PX = 374; // description column at A4, minus padding (fixed table: th widths + padding)
const NOTES_WIDTH_PX = 380; // notes column (12px text)

// Rough text width at 13.33px Arial/Arimo, on the safe (wide) side.
function textWidth(s, small = false) {
  let w = 0;
  for (const ch of String(s)) w += /[A-Z@#%&]/.test(ch) ? 9.2 : /[0-9]/.test(ch) ? 7.5 : /[a-z]/.test(ch) ? 6.7 : ch === " " ? 3.8 : 4.8;
  return small ? w * 0.9 : w;
}
// Words wrap before the edge, so a line holds a bit less than its width.
const linesFor = (w, width) => Math.max(1, Math.ceil(w / (width * 0.93)));
const descLines = (r) => linesFor(textWidth(r.desc) + (r.op ? 8 + textWidth(r.op, true) : 0), DESC_WIDTH_PX);
const rowPx = (r) => (r.kind === "group" ? 27 : 23 + (descLines(r) - 1) * 18);

function paginate(rows, lastCap, middleCap) {
  const px = (rs) => rs.reduce((t, r) => t + rowPx(r), 0);
  if (px(rows) <= lastCap) return [rows];
  const pages = [];
  let rest = rows.slice();
  while (px(rest) > lastCap) {
    let take = 0, used = 0;
    while (take < rest.length - 1 && used + rowPx(rest[take]) <= middleCap) used += rowPx(rest[take++]);
    if (take === 0) take = 1;
    // never end a page on a job-group heading
    if (take > 1 && rest[take - 1].kind === "group") take--;
    pages.push(rest.slice(0, take));
    rest = rest.slice(take);
  }
  pages.push(rest);
  return pages;
}

// ---------- pieces ----------

function logoHtml(c) {
  const words = String(c.brandName || "THE MERC LAB").trim().split(/\s+/);
  const first = words.length > 2 ? words.shift() : "";
  const last = words.pop() || "";
  const middle = words.join(" ");
  return `<div class="logo" role="img" aria-label="${esc(c.brandName || "The Merc Lab")}${c.tagline ? ", " + esc(c.tagline) : ""}">
${first ? `<div class="logo-the">${esc(first)}</div>` : ""}
<div class="logo-row">${middle ? `<div class="logo-word">${esc(middle)}</div>` : ""}<div class="logo-box"><div class="logo-word">${esc(last)}</div></div></div>
<svg width="100%" height="8" viewBox="0 0 330 16" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,8 150,8 158,2 166,14 174,0 182,16 190,8 330,8" fill="none" stroke="#111111" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"></polyline></svg>
${c.tagline ? `<div class="logo-tag">${esc(String(c.tagline).toUpperCase())}</div>` : ""}
</div>`;
}

const chip = (label) => `<span class="fill">Fill in: ${esc(label)}</span>`;

function header(c, o) {
  const reg = has(c.registrationNo) ? ` &#160;<span class="reg">(${esc(c.registrationNo)})</span>` : o.draft ? ` &#160;${chip("SSM no.")}` : "";
  const phone = has(c.tel) ? c.tel : c.hotline;
  const items = [[phone, "phone"], [c.email, "email"], [c.address && String(c.address).replace(/\s*\n\s*/g, ", "), "workshop address"]];
  const contact = items.filter(([v]) => has(v)).map(([v]) => esc(v)).join(" &#160;·&#160; ");
  // Staff view: what is missing goes on its own line, so nothing is left behind when it is hidden in print.
  const missing = o.draft ? items.filter(([v]) => !has(v)).map(([, l]) => chip(l)).join(" ") : "";
  return `<header class="hd">
${logoHtml(c)}
<div class="co">
<div><span class="legal">${esc(c.legalName)}</span>${reg}</div>
${contact ? `<div>${contact}</div>` : ""}${missing ? `<div class="miss">${missing}</div>` : ""}
</div>
</header>
<div class="rule"></div>`;
}

// Label + value pair in a two-column grid. Empty values are left out of the
// customer copy; the staff view shows a chip (when a fill-in label is given).
// o.h collects the height of each row, for the page-fit sums.
function kv(label, valueHtml, o, fillLabel, cls = "", width = 312) {
  if (has(valueHtml)) {
    const text = String(valueHtml).replace(/<[^>]+>/g, "").replace(/&#?\w+;/g, "x");
    o.h.push(18 * linesFor(textWidth(text) * (cls === "plate" ? 1.25 : cls === "b" ? 1.03 : 1), width) + 3);
    return `<div class="k">${label}</div><div class="v${cls ? " " + cls : ""}">${valueHtml}</div>`;
  }
  if (o.draft && fillLabel) {
    o.h.push(21);
    return `<div class="k miss">${label}</div><div class="v miss">${chip(fillLabel)}</div>`;
  }
  return "";
}

function parties(doc, c, o) {
  const t = doc.type;
  const v = doc.vehicle || {};
  const billTo = has(doc.invoiceTo?.name) && doc.invoiceTo.name.trim().toLowerCase() !== DEFAULT_BILL_TO ? doc.invoiceTo.name : "";
  const addr = (billTo ? doc.invoiceTo.address : doc.customer?.address) || [];
  const km = Number(v.mileageKm) > 0 ? `${Number(v.mileageKm).toLocaleString("en-MY")} km` : "";
  o.h = [];
  const left = [
    billTo ? kv("COMPANY", esc(billTo), o, "", "b") : "",
    kv(billTo ? "ATTN." : "NAME", esc(doc.customer?.name), o, "customer name", "b"),
    kv("REG. NO.", esc(v.regNo), o, "reg. no.", "plate"),
    t === "estimate" ? kv("MODEL", esc(v.makeModel), o, "model") : "",
    kv("CHASSIS NO.", esc(v.chassisNo), o, "chassis no."),
    kv("ADDRESS", esc(addr.filter(has).join(", ")), o, "customer address"),
    kv("CONTACT NO.", esc(doc.customer?.phone), o, "contact no."),
    t === "estimate" ? kv("MILEAGE", esc(km), o, "mileage (km)") : "",
  ].join("");
  const leftH = 24 + o.h.reduce((a, b) => a + b, 0) - 3;
  o.h = [];

  const R = 133; // value column width on the right
  const salesperson = () => kv("SALESPERSON", esc(String(doc.advisor?.name || "").toUpperCase()), o, "", "", R);
  let right;
  if (t === "estimate") {
    const valid = doc.validUntil || addDays(doc.date, c.estimateValidityDays);
    right = kv("ESTIMATE NO.", esc(doc.number), o, "estimate no.", "b", R) + kv("DATE", esc(dmy(doc.date)), o, "date", "", R) + kv("VALID UNTIL", esc(dmy(valid)), o, "", "", R) + salesperson();
  } else if (t === "invoice") {
    const credit = isIso(doc.dueDate) && isIso(doc.date) && doc.dueDate > doc.date;
    right = kv("INVOICE NO.", esc(doc.number), o, "invoice no.", "b", R) + kv("DATE", esc(dmy(doc.date)), o, "date", "", R) + kv("SALE TYPE", doc.saleType ? esc(String(doc.saleType).toUpperCase()) : credit ? "CREDIT" : "CASH", o, "", "", R)
      + (credit ? kv("DUE DATE", esc(dmy(doc.dueDate)), o, "", "", R) : "") + salesperson();
  } else {
    const p = doc.payment || {};
    right = kv("RECEIPT NO.", esc(doc.number), o, "receipt no.", "b", R)
      + (doc.invoiceNo ? kv("INVOICE NO.", esc(doc.invoiceNo), o, "", "b", R) : kv("ESTIMATE NO.", esc(doc.estimateNo), o, "", "b", R))
      + kv("PAYMENT DATE", esc(dmy(p.date)), o, "date", "", R) + kv("METHOD", esc(String(p.method || "").toUpperCase()), o, "payment method", "", R)
      + kv("REFERENCE", esc(p.reference), o, "", "", R) + salesperson();
  }
  const rightH = 36 + o.h.reduce((a, b) => a + b, 0) - 3;
  o.partiesH = Math.max(leftH, rightH);
  const title = t === "invoice" && c.sstRegistrationNo ? "TAX INVOICE" : TITLES[t];
  return `<section class="parties">
<div><div class="cap">BILL TO</div><div class="kv kv-l">${left}</div></div>
<div class="docbox"><h1>${title}</h1><div class="kv kv-r">${right}</div></div>
</section>`;
}

function table(rows, isLast) {
  const body = rows.map((r) => (r.kind === "group"
    ? `<tr class="grp"><td colspan="4">${esc(r.text).replace(" · ", " &#160;·&#160; ")}</td></tr>`
    : `<tr><td>${esc(r.desc)}${r.op ? ` <span class="op">${esc(r.op)}</span>` : ""}</td><td class="n">${qtyText(r.qty)}</td><td class="n">${fmt(r.unit)}</td><td class="n">${fmt(r.amount)}</td></tr>`)).join("");
  const more = isLast ? "" : `<tr class="cont"><td colspan="4">Continued on next page</td></tr>`;
  return `<table class="items">
<thead><tr><th scope="col">DESCRIPTION</th><th scope="col" class="n w-q">QTY</th><th scope="col" class="n w-u">UNIT PRICE (RM)</th><th scope="col" class="n w-t">TOTAL (RM)</th></tr></thead>
<tbody>${body}${more}</tbody>
</table>`;
}

function warranty(c, o) {
  if (has(c.partsWarrantyMonths)) return ` Customer-pay parts carry a ${esc(c.partsWarrantyMonths)}-month parts warranty, excluding service and wear-and-tear items.`;
  return o.draft ? `<span class="miss"> Customer-pay parts carry a ${chip("warranty months")} parts warranty, excluding service and wear-and-tear items.</span>` : "";
}

function bankLine(c, o) {
  const b = c.bank || {};
  if (has(b.name) && has(b.accountNo)) {
    return `<li>For bank-in or online transfer, pay only into the ${esc(b.accountName || c.legalName)} account: <b>${esc(b.name)} ${esc(groupDigits(b.accountNo))}</b>.</li>`;
  }
  return o.draft ? `<li class="miss">${chip("bank name and account no.")}</li>` : `<li>Bank details will be provided with your invoice.</li>`;
}

const METHODS = "<li>Method of payment: cash, debit/credit card, cheque, bank-in or online transfer.</li>";

function notes(doc, c, o) {
  const t = doc.type;
  let cap, items;
  if (t === "estimate") {
    const valid = doc.validUntil || addDays(doc.date, c.estimateValidityDays);
    cap = "TERMS";
    items = `<li>This estimate is valid for ${esc(c.estimateValidityDays || 7)} days${valid ? `, until ${esc(dmy(valid))}` : ""}. Prices are subject to change without prior notice.</li>
<li>Parts are genuine Mercedes-Benz or OEM-equivalent, as listed.${warranty(c, o)}</li>${METHODS}${bankLine(c, o)}`;
  } else {
    // Invoice and receipt mention the parts warranty only when it is set.
    const w = warranty(c, o);
    const wLine = w ? `<li${has(c.partsWarrantyMonths) ? "" : ' class="miss"'}>Parts are genuine Mercedes-Benz or OEM-equivalent, as listed.${w}</li>` : "";
    if (t === "invoice") {
      cap = "PAYMENT";
      items = `${METHODS}${bankLine(c, o)}<li>Please quote the invoice number as your payment reference.</li>${wLine}`;
    } else {
      cap = "NOTES";
      items = `<li>Received with thanks.</li><li>This receipt is valid only after the payment has cleared.</li>${wLine}`;
    }
  }
  const qrOk = t !== "receipt" && /^(https:\/\/|file:\/\/|data:image\/(png|jpeg|webp);base64,)/.test(String(c.duitNowQrImage || ""));
  const qr = qrOk ? `<figure class="qr"><img src="${esc(c.duitNowQrImage)}" alt="DuitNow QR" onerror="this.parentNode.remove()"><figcaption>DuitNow QR</figcaption></figure>` : "";
  return `<div class="notes"><div><div class="cap">${cap}</div><ol>${items}</ol></div>${qr}</div>`;
}

function totals(doc, c) {
  const t = doc.totals;
  const row = (label, sen, cls = "") => `<div class="tr${cls ? " " + cls : ""}"><span>${label}</span><span class="num">${sen ? (sen < 0 ? "-" + fmt(-sen) : fmt(sen)) : "–"}</span></div>`;
  const box = (label, sen) => `<div class="grand"><span>${label}</span><span class="num">${fmt(sen)}</span></div>`;
  let out = row("Subtotal", t.gross) + row("Discount", -t.discount);
  if (c.sstRegistrationNo) out += row(`Service Tax @ ${Math.round((Number(c.serviceTaxRate) || 0) * 10000) / 100}%`, t.tax);
  if (t.rounding) out += row("Rounding", t.rounding);
  if (doc.type === "estimate") return out + box("TOTAL (RM)", t.grand);
  out += row("Total", t.grand, "strong");
  if (doc.type === "invoice") {
    const paid = Math.max(0, Math.round(doc.paidSen || 0));
    const credited = Math.max(0, Math.round(doc.creditedSen || 0));
    out += row("Deposit", -paid);
    if (credited) out += row("Credit notes", -credited);
    const due = doc.amountDueSen ?? Math.max(0, t.grand - paid - credited);
    return out + box("BALANCE DUE (RM)", due);
  }
  const thisSen = toSen(doc.payment.amount);
  const before = Math.max(0, Math.round(doc.totalPaidSen ?? thisSen) - thisSen);
  if (before) out += row("Paid earlier", -before);
  out += row("Amount received", thisSen);
  return out + box("BALANCE (RM)", doc.balanceAfterSen ?? Math.max(0, t.grand - before - thisSen));
}

// Heights of the bottom blocks, for the page fit.
function notesHeight(doc, c, o) {
  const html = notes(doc, c, o);
  const items = html.match(/<li[^>]*>[\s\S]*?<\/li>/g) || [];
  const textH = 22 + items.reduce((t, li) => t + 16 * linesFor(textWidth(li.replace(/<[^>]+>/g, "")) * 0.9, NOTES_WIDTH_PX) + 3, 0) - 3;
  return Math.max(textH, /class="qr"/.test(html) ? 106 : 0);
}
function totalsHeight(doc, c) {
  const html = totals(doc, c);
  return (html.match(/class="tr/g) || []).length * 24 + 48;
}

function signatures(t) {
  const left = t === "receipt" ? "Received by (authorised signature)" : "Authorised signature";
  const right = t === "estimate" ? "Customer acceptance (signature &amp; date)" : "Customer signature";
  return `<section class="sign"><div>${left}</div><div>${right}</div></section>`;
}

function footer(doc, c, pageNo, pageCount) {
  const brand = String(c.brandName || "The Merc Lab").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
  const call = has(c.hotline) ? `For questions about this ${WORD[doc.type]}, call ${esc(c.hotline)}. ` : "";
  return `<footer class="ft"><div>${call}${esc(brand)} is a trading name of ${esc(c.legalName)}.</div><div class="pg">Page ${pageNo} of ${pageCount}</div></footer>`;
}

const CSS = `
@font-face{font-family:Arimo;font-weight:400;src:url(/fonts/arimo-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:Arimo;font-weight:700;src:url(/fonts/arimo-latin-700-normal.woff2) format("woff2")}
@page{size:A4;margin:0}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#ffffff}
.page{width:794px;height:1123px;box-sizing:border-box;padding:34px 44px 26px;display:flex;flex-direction:column;background:#ffffff;color:#111111;font-family:Arial,Arimo,Helvetica,sans-serif;font-size:13.33px;line-height:18px;overflow:hidden;position:relative;break-after:page;page-break-after:always}
.page:last-child{break-after:auto;page-break-after:auto}
.hd{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.logo{display:flex;flex-direction:column;gap:4px;align-items:stretch}
.logo-the{font-size:12px;font-weight:700;letter-spacing:.5em;line-height:12px;text-align:left}
.logo-row{display:flex;align-items:stretch;gap:5px}
.logo-word{font-size:36px;font-weight:700;line-height:29px;letter-spacing:-.01em;padding:3px 0}
.logo-box{background:#111111;color:#ffffff;padding:3px 7px;display:flex;align-items:center}
.logo-box .logo-word{padding:0}
.logo svg{display:block}
.logo-tag{font-size:12px;font-weight:700;letter-spacing:.06em;line-height:12px;margin-top:2px;white-space:nowrap}
.co{font-size:12px;line-height:16px;color:#222222}
.co .legal{font-size:16px;font-weight:700;color:#111111}
.co .reg{color:#555555}
.rule{margin-top:14px;border-top:2px solid #111111}
.parties{margin-top:14px;display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:24px}
.cap{font-size:12px;font-weight:700;letter-spacing:.08em;margin-bottom:6px}
.kv{display:grid;row-gap:3px;column-gap:10px}
.kv-l{grid-template-columns:92px minmax(0,1fr)}
.kv-r{grid-template-columns:104px minmax(0,1fr)}
.kv .k{font-size:12px;font-weight:700;color:#555555;white-space:nowrap}
.kv .v{min-width:0;overflow-wrap:anywhere}
.kv .b{font-weight:700}
.kv .plate{font-weight:700;font-size:16px;letter-spacing:.03em}
.docbox{border-left:1px solid #cfcfcf;padding-left:20px}
h1{margin:0 0 8px;font-size:24px;font-weight:700;letter-spacing:.06em;line-height:28px}
table.items{margin-top:18px;width:100%;border-collapse:collapse;table-layout:fixed}
table.items th{font-size:12px;font-weight:700;color:#111111;background:#e6e6e6;border-top:1px solid #bdbdbd;border-bottom:1px solid #bdbdbd;padding:6px 8px;text-align:left}
table.items td{padding:2px 8px;border-bottom:1px solid #e3e3e3;vertical-align:top}
table.items .n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
table.items .w-q{width:52px}table.items .w-u{width:112px}table.items .w-t{width:104px}
table.items .op{color:#555555;font-size:12px;margin-left:6px}
table.items tr.grp td{background:#f7f7f7;padding:4px 8px;border-bottom:1px solid #cfcfcf;font-size:12px;font-weight:700;letter-spacing:.04em}
table.items tr.cont td{border-bottom:0;padding-top:6px;text-align:right;font-size:12px;font-style:italic;color:#555555}
.bottom{margin-top:16px;display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:28px;align-items:start}
.notes{display:flex;gap:14px;align-items:flex-start}
.notes ol{margin:0;padding-left:18px;font-size:12px;line-height:16px;color:#222222;display:flex;flex-direction:column;gap:3px}
.qr{margin:0;flex-shrink:0;text-align:center;font-size:12px;color:#555555}
.qr img{display:block;width:84px;height:84px;object-fit:contain}
.totals{display:flex;flex-direction:column}
.tr{display:flex;justify-content:space-between;padding:3px 10px}
.tr.strong{border-top:1px solid #cfcfcf;font-weight:700}
.num{font-variant-numeric:tabular-nums}
.grand{margin-top:6px;background:#e6e6e6;border:1px solid #bdbdbd;color:#111111;display:flex;justify-content:space-between;align-items:baseline;padding:9px 12px;border-radius:3px}
.grand span:first-child{font-size:13.33px;font-weight:700;letter-spacing:.04em}
.grand .num{font-size:18.67px;font-weight:700}
.spacer{flex-grow:1;min-height:44px}
.sign{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:80px;padding:0 20px}
.sign div{border-top:1px solid #111111;padding-top:4px;font-size:12px;color:#555555}
.ft{margin-top:22px;border-top:1px solid #cfcfcf;padding-top:8px;display:flex;justify-content:space-between;gap:16px;font-size:12px;line-height:16px;color:#555555}
.ft .pg{white-space:nowrap}
.fill{display:inline-block;background:#fff3cd;border:1px dashed #a86b00;color:#6b4400;font-size:12px;font-weight:700;line-height:16px;padding:0 6px;border-radius:3px}
@media print{.miss,.fill,.no-print{display:none!important}}
`;

// Screen-only extras (page shadow, fit-to-phone, print button). None of it prints.
const SCREEN_CSS = `
@media screen{body{background:#e9ebef;padding:12px 0 80px}.sheet{display:flex;flex-direction:column;align-items:center;gap:16px}.page{box-shadow:0 1px 6px rgba(0,0,0,.18)}
.bar{position:fixed;left:0;right:0;bottom:0;display:flex;justify-content:center;padding:12px;background:rgba(233,235,239,.95)}
.bar button{font:700 16px Arial,sans-serif;padding:14px 28px;border:0;border-radius:10px;background:#111;color:#fff;max-width:420px;width:100%;cursor:pointer}
.staff{max-width:760px;margin:0 auto 14px;background:#fff3cd;border:1px dashed #a86b00;color:#6b4400;border-radius:10px;padding:10px 14px;font:14px/1.4 Arial,sans-serif;box-sizing:border-box}}
@media print{.bar,.staff{display:none}.sheet{zoom:1!important}}
`;

// The customer copy must never carry template placeholders like "[PHONE NO.]".
function assertNoPlaceholders(pagesHtml) {
  const textOnly = pagesHtml.replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#?\w+;/g, " ");
  const m = textOnly.match(/\[[^\]\n]{1,60}\]/);
  if (m) throw new DocumentError(`The document still has placeholder text ${m[0]}. Fill in the real value (Settings or the job) first.`);
}

// options: screen (page shadow + print button, default true), draft (staff
// view with "Fill in" chips), fontBase (where the Arimo files are).
function render(doc, company, { screen = true, draft = false, fontBase = "/fonts/" } = {}) {
  validate(doc);
  const o = { draft: !!draft };
  const sstOn = !!company.sstRegistrationNo;
  const rate = Number(company.serviceTaxRate) || 0;
  if (!doc.totals) {
    doc.totals = computeTotals(doc.groups, { surcharge: doc.surcharge, menus: doc.menus, discount: doc.discount, sst: { on: sstOn, rate }, round5: !!company.roundTo5Sen });
  }
  const t = doc.totals;
  // Page fit: build the top blocks once to learn their height, then the
  // notes/totals block, and give the table what is left.
  const probe = { ...o, h: [] };
  const headerExtra = linesFor(textWidth([company.tel || company.hotline, company.email, company.address].filter(has).join(" · "), true) * 0.9, 706) * 16 - 16
    + (o.draft && [company.tel || company.hotline, company.email, company.address].some((v) => !has(v)) ? 18 : 0);
  parties(doc, company, probe);
  const tbodyTop = 188 + headerExtra + probe.partiesH + 48;
  const bottomH = Math.max(notesHeight(doc, company, o), totalsHeight(doc, company));
  const lastCap = SIGN_TOP - SPACER_MIN - (16 + bottomH) - tbodyTop - 6;
  const middleCap = FOOT_TOP - 22 - SPACER_MIN - 30 - tbodyTop - 6;
  const pages = paginate(tableRows(doc, company), lastCap, middleCap);
  const pagesHtml = pages.map((rows, i) => {
    const last = i === pages.length - 1;
    return `<div class="page">
${header(company, o)}
${parties(doc, company, o)}
${table(rows, last)}
${last ? `<section class="bottom">${notes(doc, company, o)}<div class="totals">${totals(doc, company)}</div></section>` : ""}
<div class="spacer"></div>
${last ? signatures(doc.type) : ""}
${footer(doc, company, i + 1, pages.length)}
</div>`;
  }).join("\n");
  if (!o.draft) assertNoPlaceholders(pagesHtml);

  const title = doc.type === "invoice" && sstOn ? "TAX INVOICE" : TITLES[doc.type];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${esc(title)} ${esc(doc.number)}</title>
<style>${CSS.split("url(/fonts/").join("url(" + fontBase)}${screen ? SCREEN_CSS : ""}</style></head><body>
${screen && o.draft ? `<div class="staff no-print">Staff view: the amber boxes show details that are still missing. The customer does not see them, and they never print.</div>` : ""}
<div class="sheet" id="sheet">${pagesHtml}</div>
${screen ? `<div class="bar no-print"><button type="button" onclick="window.print()">Save as PDF / Print</button></div>
<script>(function(){function fit(){var s=document.getElementById("sheet");var z=Math.min(1,(window.innerWidth-16)/794);s.style.zoom=z}fit();window.addEventListener("resize",fit)})()</script>` : ""}
</body></html>`;
}

module.exports = { render, paginate, tableRows, validate, DocumentError, rowPx, esc, CSS };
