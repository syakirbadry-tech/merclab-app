// Client-facing ESTIMATE / INVOICE / OFFICIAL RECEIPT pages, opened by a
// private link (random token). Rendered with the one A4 template.

const db = require("./airtable");
const M = require("./money");
const { render, DocumentError } = require("./template");
const { jobOut, paymentOut, loadSettings, companyFor } = require("./routes");
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
      doc = jobDoc(job, token[0] === "q" ? "estimate" : "invoice");
      const html = render(doc, company);
      return res.send(token[0] === "q" ? W.addApproval(html, job, token) : html);
    } else {
      const row = await findByToken("payments", "Link token", token);
      if (!row) return res.status(404).send("Not found");
      const p = paymentOut(row);
      const job = jobOut(await db.get("quotes", p.jobId));
      const all = (await db.list("payments")).map(paymentOut).filter((x) => x.jobId === job.id);
      doc = receiptDoc(p, job, all, company);
    }
    return res.send(render(doc, company));
  } catch (err) {
    if (err instanceof DocumentError) return res.status(400).send(`<p style="font:16px sans-serif;padding:20px">This document cannot be made: ${err.message.replace(/</g, "&lt;")}</p>`);
    console.error("[doc]", err.message);
    res.status(500).send("This page cannot be shown right now. Please try again later.");
  }
}

const approveRoute = (req, res) => W.approveRoute(req, res, { jobOut });

module.exports = { docRoute, approveRoute, jobDoc, receiptDoc };
