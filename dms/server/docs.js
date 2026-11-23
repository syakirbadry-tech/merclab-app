// Client-facing ESTIMATE / INVOICE / OFFICIAL RECEIPT pages, opened by a
// private link (random token). Rendered with the one A4 template.

const db = require("./airtable");
const M = require("./money");
const { render, DocumentError } = require("./template");
const { jobOut, paymentOut, loadSettings, companyFor } = require("./routes");
const { readCookie, validToken } = require("./auth");
const W = require("./workshop");
const F = require("./finance");

const klTime = (iso) => (iso ? new Date(new Date(iso).getTime() + 8 * 3600e3).toISOString().slice(11, 16) : "");

// Job record → template input.
function jobDoc(job, type) {
  const d = job.details || {};
  const isEstimate = type === "estimate";
  return {
    type,
    number: isEstimate ? job.estimateNo : job.invoiceNo,
    date: isEstimate ? job.date : job.invoiceDate,
    validUntil: isEstimate ? job.validUntil : "",
    saleType: d.saleType || "",
    time: isEstimate ? d.estimateTime : d.invoiceTime,
    accountNo: d.accountNo,
    orderNo: d.orderNo,
    referenceNo: d.referenceNo,
    wipNo: d.wipNo,
    jobNo: d.jobNo,
    invoiceTo: d.invoiceTo || { name: "", address: [] },
    customer: { name: job.customerName, address: d.customerAddress || [], phone: job.phone },
    vehicle: { makeModel: job.car, regNo: job.plate, mileageKm: job.mileageKm, chassisNo: d.vehicle?.chassisNo, engineNo: d.vehicle?.engineNo, regDate: d.vehicle?.regDate },
    advisor: d.advisor || {},
    groups: isEstimate && job.estimateGroups ? job.estimateGroups : job.groups,
    surcharge: d.surcharge || 0,
    menus: d.menus || 0,
    discount: d.discount || 0,
    repairDate: isEstimate ? d.plannedDate : job.repairDate,
    dueDate: job.dueDate,
    invoiceNo: job.invoiceNo || null,
    estimateNo: job.estimateNo || null,
    invoiceDate: job.invoiceDate,
    amountDueSen: Math.round(job.balance * 100),
    paidSen: Math.round((job.paid || 0) * 100),
    creditedSen: Math.round((job.credited || 0) * 100),
  };
}

// Payment → receipt. A receipt never changes after it is issued: it shows
// the document it paid (a deposit on the estimate shows the estimate, even
// after the invoice is made), and the balance owed right after THIS payment.
function receiptDoc(payment, job, jobPayments, company) {
  const paidInvoice = !!job.invoiceNo && payment.docNo === job.invoiceNo;
  const doc = jobDoc(job, paidInvoice ? "invoice" : "estimate");
  const totals = M.computeTotals(doc.groups, { surcharge: doc.surcharge, menus: doc.menus, discount: doc.discount, sst: { on: !!company.sstRegistrationNo, rate: company.serviceTaxRate }, round5: !!company.roundTo5Sen });
  const ordered = jobPayments.slice().sort((a, b) => a.receiptNo.localeCompare(b.receiptNo));
  let paidSen = 0;
  for (const p of ordered) {
    paidSen += Math.round(p.amount * 100);
    if (p.id === payment.id) break;
  }
  return {
    ...doc,
    type: "receipt",
    totals,
    invoiceNo: paidInvoice ? job.invoiceNo : null,
    estimateNo: paidInvoice ? null : job.estimateNo,
    number: payment.receiptNo,
    date: payment.paidOn,
    time: klTime(payment.createdTime),
    payment: { date: payment.paidOn, method: payment.method, reference: payment.reference, amount: payment.amount },
    totalPaidSen: paidSen,
    balanceAfterSen: Math.max(0, totals.grand - paidSen),
  };
}

// Shown instead of a document that cannot be made yet. Staff (logged in) get
// the fix right here: missing mileage is asked for and saved, then the page
// reloads. Customers get a polite note, never the technical reason.
const escH = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function problemPage(err, job, staff, company) {
  const mileage = /Mileage/i.test(err.message) && job && job.id;
  const head = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${escH(company?.brandName || "The Merc Lab")}</title>
<style>body{margin:0;background:#e9ebef;font:16px/1.5 Arial,Arimo,sans-serif;color:#111}.c{max-width:440px;margin:12vh auto 0;background:#fff;border-radius:14px;padding:26px 24px;box-shadow:0 1px 6px rgba(0,0,0,.12)}
h1{font-size:20px;margin:0 0 6px}p{margin:0 0 14px;color:#333}label{display:block;font-weight:700;font-size:14px;margin-bottom:6px}
input{box-sizing:border-box;width:100%;font:18px Arial,sans-serif;padding:12px;border:1px solid #94a3b8;border-radius:10px}
button{margin-top:12px;width:100%;font:700 16px Arial,sans-serif;padding:14px;border:0;border-radius:10px;background:#111;color:#fff;cursor:pointer}.e{color:#b42318;font-size:14px;margin-top:8px}</style></head><body><div class="c">`;
  if (!staff) {
    const call = company?.hotline ? ` Please call us on ${escH(company.hotline)}.` : "";
    return `${head}<h1>This document is being updated</h1><p>We are finishing a few details on this document.${call}</p></div></body></html>`;
  }
  if (!mileage) return `${head}<h1>This document cannot be made yet</h1><p>${escH(err.message)}</p><p>Open the job in the DMS to fix it, then open this link again.</p></div></body></html>`;
  return `${head}<h1>Mileage needed</h1><p>Every estimate, invoice and receipt shows the car's mileage. ${escH(job.invoiceNo || job.estimateNo)}${job.plate ? " · " + escH(job.plate) : ""} has none yet.</p>
<form id="f"><label for="km">Mileage (km)</label><input id="km" inputmode="numeric" autocomplete="off" required placeholder="e.g. 72,769"><button>Save and open the document</button><div class="e" id="e" role="alert"></div></form>
<script>document.getElementById("f").onsubmit=function(ev){ev.preventDefault();var b=this.querySelector("button");b.disabled=true;b.textContent="Saving…";
fetch("/api/jobs/${job.id}/mileage",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({mileageKm:document.getElementById("km").value})})
.then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||"Could not save.");location.reload()})})
.catch(function(x){b.disabled=false;b.textContent="Save and open the document";document.getElementById("e").textContent=x.message})};</script></div></body></html>`;
}

async function findByToken(table, field, token) {
  const rows = await db.list(table);
  return rows.find((r) => r.fields[field] === token) || null;
}

async function docRoute(req, res) {
  const token = req.params.token;
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "no-store");
  if (!/^[qirhc][a-f0-9]{32}$/.test(token)) return res.status(404).send("Not found");
  try {
    const company = companyFor(await loadSettings());
    // Logged-in staff see the draft view (missing details as "Fill in" chips, never printed).
    const opts = { draft: validToken(readCookie(req)) };
    req._docStaff = opts.draft;
    req._docCompany = company;
    let doc;
    if (token[0] === "c") {
      const row = await findByToken("credits", "Link token", token);
      if (!row) return res.status(404).send("Not found");
      const cn = F.creditOut(row);
      const job = cn.jobId ? jobOut(await db.get("quotes", cn.jobId)) : null;
      return res.send(F.creditNotePage(cn, job, company));
    }
    if (token[0] === "h") {
      const row = await findByToken("quotes", "Inspection token", token);
      if (!row) return res.status(404).send("Not found");
      return res.send(W.inspectionPage(jobOut(row), company));
    }
    if (token[0] === "q" || token[0] === "i") {
      const row = await findByToken("quotes", token[0] === "q" ? "Link token" : "Invoice token", token);
      if (!row) return res.status(404).send("Not found");
      const job = jobOut(row);
      req._docJob = job;
      doc = jobDoc(job, token[0] === "q" ? "estimate" : "invoice");
      const html = render(doc, company, opts);
      return res.send(token[0] === "q" ? W.addApproval(html, job, token) : html);
    } else {
      const row = await findByToken("payments", "Link token", token);
      if (!row) return res.status(404).send("Not found");
      const p = paymentOut(row);
      const job = jobOut(await db.get("quotes", p.jobId));
      req._docJob = job;
      const all = (await db.list("payments")).map(paymentOut).filter((x) => x.jobId === job.id);
      doc = receiptDoc(p, job, all, company);
    }
    return res.send(render(doc, company, opts));
  } catch (err) {
    if (err instanceof DocumentError) return res.status(200).send(problemPage(err, req._docJob, req._docStaff, req._docCompany));
    console.error("[doc]", err.message);
    res.status(500).send("This page cannot be shown right now. Please try again later.");
  }
}

const approveRoute = (req, res) => W.approveRoute(req, res, { jobOut });

module.exports = { docRoute, approveRoute, jobDoc, receiptDoc };
