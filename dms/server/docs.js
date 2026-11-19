// Client-facing quotation and receipt pages. Opened by a private link
// (random token, not guessable), printable / "Save as PDF" from the phone.

const db = require("./airtable");
const { quoteOut, paymentOut, loadSettings } = require("./routes");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rm = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
const lines = (s) => esc(s).replace(/\n/g, "<br>");

function page({ title, s, body }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
:root{--ink:#14171f;--muted:#5b6270;--line:#dfe3ea;--brand:#2f6fd6;--bg:#f4f6f9;--paper:#fff;--ok:#1d7a46}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.paper{max-width:780px;margin:16px auto;background:var(--paper);padding:28px 24px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.top{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;border-bottom:2px solid var(--ink);padding-bottom:14px}
.brand{display:flex;gap:12px;align-items:flex-start}.brand svg{flex:none}
h1{font-size:20px;margin:0 0 4px}.small{color:var(--muted);font-size:13px}
.doc{text-align:right}.doc h2{margin:0;font-size:22px;letter-spacing:.06em}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}
.box h3{margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
table{width:100%;border-collapse:collapse;margin-top:8px}th,td{padding:9px 6px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}td.n,th.n{text-align:right;white-space:nowrap}
.tot{margin-left:auto;max-width:300px;margin-top:10px}.tot div{display:flex;justify-content:space-between;padding:4px 6px}
.tot .grand{font-weight:700;font-size:18px;border-top:2px solid var(--ink);margin-top:4px;padding-top:8px}
.note{margin-top:20px;padding:12px;background:var(--bg);border-radius:8px;font-size:13px}
.stamp{display:inline-block;border:3px solid var(--ok);color:var(--ok);font-weight:800;letter-spacing:.12em;padding:4px 14px;border-radius:6px;transform:rotate(-4deg);margin-top:8px}
.bar{max-width:780px;margin:0 auto;padding:0 16px 24px;display:flex;gap:8px}
.bar button{flex:1;padding:14px;border:0;border-radius:10px;background:var(--brand);color:#fff;font-size:16px;font-weight:600}
@media (max-width:520px){.paper{margin:0;border-radius:0;padding:20px 16px}.meta{grid-template-columns:1fr}.doc{text-align:left}th.hide,td.hide{display:none}}
@media print{body{background:#fff}.paper{box-shadow:none;margin:0;max-width:none}.bar{display:none}}
</style></head><body>
<div class="paper">
<div class="top"><div class="brand">
<svg width="44" height="44" viewBox="0 0 120 120" aria-hidden="true"><polygon points="60,10 104,35 104,85 60,110 16,85 16,35" fill="#2f6fd6"/><polygon points="60,10 104,35 60,60 16,35" fill="#1f4fa3"/></svg>
<div><h1>${esc(s.workshopName || "The Merc Lab")}</h1>
<div class="small">${lines(s.address)}${s.address ? "<br>" : ""}${esc(s.phone)}${s.phone && s.email ? " · " : ""}${esc(s.email)}${s.registrationNo ? `<br>Reg. no: ${esc(s.registrationNo)}` : ""}</div></div></div>
${body.head}</div>
${body.main}
</div>
<div class="bar"><button onclick="window.print()">Save as PDF / Print</button></div>
</body></html>`;
}

function itemsTable(items) {
  return `<table><thead><tr><th>Item</th><th class="n hide">Qty</th><th class="n hide">Price</th><th class="n">Amount</th></tr></thead><tbody>
${items.map((i) => `<tr><td>${esc(i.description)}<div class="small">${i.qty} × ${rm(i.unitPrice)}</div></td><td class="n hide">${i.qty}</td><td class="n hide">${rm(i.unitPrice)}</td><td class="n">${rm(i.amount)}</td></tr>`).join("")}
</tbody></table>`;
}

function quoteHtml(q, s) {
  const bank = s.bankAccountNo
    ? `<div class="note"><b>Payment by bank transfer / DuitNow</b><br>${esc(s.bankName)}<br>${esc(s.bankAccountName)}<br>Account no: <b>${esc(s.bankAccountNo)}</b><br>Please put <b>${esc(q.quoteNo)}</b> as the payment reference.</div>`
    : "";
  return page({
    title: `Quotation ${q.quoteNo}`,
    s,
    body: {
      head: `<div class="doc"><h2>QUOTATION</h2><div><b>${esc(q.quoteNo)}</b></div><div class="small">Date: ${dmy(q.date)}<br>Valid until: ${dmy(q.validUntil)}</div>${q.status === "Paid" ? '<div class="stamp">PAID</div>' : ""}</div>`,
      main: `<div class="meta"><div class="box"><h3>Customer</h3>${esc(q.customerName)}${q.phone ? `<div class="small">${esc(q.phone)}</div>` : ""}</div>
<div class="box"><h3>Vehicle</h3>${esc(q.car) || "-"}${q.plate ? `<div class="small">${esc(q.plate)}</div>` : ""}</div></div>
${itemsTable(q.items)}
<div class="tot"><div><span>Subtotal</span><span>${rm(q.subtotal)}</span></div>${q.discount ? `<div><span>Discount</span><span>- ${rm(q.discount)}</span></div>` : ""}
<div class="grand"><span>Total</span><span>${rm(q.total)}</span></div>${q.paid ? `<div><span>Paid</span><span>${rm(q.paid)}</span></div><div><b>Balance</b><b>${rm(q.balance)}</b></div>` : ""}</div>
${bank}${s.quoteNotes ? `<div class="note">${lines(s.quoteNotes)}</div>` : ""}`,
    },
  });
}

function receiptHtml(p, q, s) {
  return page({
    title: `Receipt ${p.receiptNo}`,
    s,
    body: {
      head: `<div class="doc"><h2>RECEIPT</h2><div><b>${esc(p.receiptNo)}</b></div><div class="small">Date: ${dmy(p.paidOn)}</div>${q && q.balance <= 0 ? '<div class="stamp">PAID IN FULL</div>' : ""}</div>`,
      main: `<div class="meta"><div class="box"><h3>Received from</h3>${esc(p.customerName)}${q && q.plate ? `<div class="small">${esc(q.car)} ${esc(q.plate)}</div>` : ""}</div>
<div class="box"><h3>Payment</h3>${esc(p.method)}${p.reference ? `<div class="small">Ref: ${esc(p.reference)}</div>` : ""}</div></div>
<table><tbody><tr><td>Payment for quotation <b>${esc(p.quoteNo)}</b></td><td class="n"><b>${rm(p.amount)}</b></td></tr></tbody></table>
${q ? `${itemsTable(q.items)}<div class="tot"><div><span>Quotation total</span><span>${rm(q.total)}</span></div><div><span>Total paid</span><span>${rm(q.paid)}</span></div><div class="grand"><span>Balance</span><span>${rm(q.balance)}</span></div></div>` : ""}
${s.receiptNotes ? `<div class="note">${lines(s.receiptNotes)}</div>` : ""}
<p class="small" style="margin-top:18px">This receipt was generated by computer. No signature is needed.</p>`,
    },
  });
}

async function findByToken(table, token) {
  const rows = await db.list(table, {});
  return rows.find((r) => r.fields["Link token"] === token) || null;
}

async function docRoute(req, res) {
  const token = req.params.token;
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "no-store");
  if (!/^[qr][a-f0-9]{32}$/.test(token)) return res.status(404).send("Not found");
  try {
    const s = await loadSettings();
    if (token[0] === "q") {
      const row = await findByToken("quotes", token);
      if (!row) return res.status(404).send("Not found");
      return res.send(quoteHtml(quoteOut(row), s));
    }
    const row = await findByToken("payments", token);
    if (!row) return res.status(404).send("Not found");
    const p = paymentOut(row);
    let q = null;
    if (p.quoteId) q = quoteOut(await db.get("quotes", p.quoteId));
    return res.send(receiptHtml(p, q, s));
  } catch (err) {
    console.error("[doc]", err.message);
    res.status(500).send("This page cannot be shown right now. Please try again later.");
  }
}

module.exports = { docRoute, quoteHtml, receiptHtml, esc };
