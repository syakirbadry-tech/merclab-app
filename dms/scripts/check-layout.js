#!/usr/bin/env node
// Layout check with real Chromium: renders estimates, invoices and receipts
// with 1..N lines (short and long descriptions) and fails if anything spills
// past the bottom of an A4 page or the footer leaves its place.
//   node scripts/check-layout.js
const path = require("path");
const fs = require("fs");
const { render } = require("../server/template");
const { cleanGroups } = require("../server/money");

const company = { ...JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "company.json"), "utf8")),
  registrationNo: "000000-X", tel: "+60 12-000 0000", hotline: "012-000 0000", email: "demo@example.com", address: "1, Jalan Demo, 47000 Sungai Buloh, Selangor",
  bank: { name: "Demo Bank", accountName: "TNS Legacy", accountNo: "123456789012" }, partsWarrantyMonths: 6 };
const base = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "test", "fixtures", "reference-estimate.json"), "utf8"));
const fontBase = "file://" + path.join(__dirname, "..", "public", "fonts") + "/";

function makeDoc(type, n, long) {
  const lines = [];
  for (let i = 0; i < n; i++) {
    const d = long && i % 3 === 0 ? "REPLACE FRONT LOWER CONTROL ARM ASSEMBLY LEFT AND RIGHT WITH NEW BUSHES AND ALIGNMENT CHECK" : `PART NUMBER ${i + 1}`;
    lines.push(i % 4 === 3 ? { type: "labour", opCode: "00000000", description: d, amount: 50 } : { type: "part", description: d, qty: 1, unitPrice: 10 });
  }
  const doc = JSON.parse(JSON.stringify(base));
  if (process.env.LONG_TOP) { doc.customer.name = "Encik Mohd Abdul Rahman Bin Haji Abdullah Sulaiman"; doc.customer.address = ["Lot 1234, Jalan Kampung Haji Sungai Layar Dalam, Taman Desa Permai Indah", "08000 Sungai Petani, Kedah Darul Aman"]; }
  doc.type = type;
  doc.groups = cleanGroups([{ code: "C1", request: "TEST", lines }, { code: "C2", request: "COMPLIMENTARY CARWASH", lines: [] }]);
  doc.repairDate = "2026-11-19";
  doc.invoiceNo = "INV-2026-00001";
  doc.payment = { date: "2026-11-19", method: "DuitNow", reference: "X", amount: 10 };
  doc.totalPaidSen = 2000; // a receipt after an earlier payment: one more totals row
  doc.paidSen = 1000;
  return doc;
}

(async () => {
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  let failures = 0;
  for (const type of ["estimate", "invoice", "receipt"]) {
    for (const long of [false, true]) {
      for (let n = 1; n <= 70; n += n < 30 ? 1 : 7) {
        const html = render(makeDoc(type, n, long), process.env.DRAFT ? { ...company, address: null, email: null, partsWarrantyMonths: null } : company, { screen: false, draft: !!process.env.DRAFT, fontBase });
        await page.setContent(html);
        await page.evaluate(() => document.fonts.ready);
        const r = await page.evaluate(() => [...document.querySelectorAll(".page")].map((p) => {
          const top = p.getBoundingClientRect().top;
          const f = p.querySelector(".ft").getBoundingClientRect();
          const spacer = p.querySelector(".spacer").getBoundingClientRect().height;
          return { footerBottom: Math.round(f.bottom - top), spacer: Math.round(spacer), overflow: p.scrollHeight > p.clientHeight };
        }));
        const bad = r.filter((p) => p.overflow || p.footerBottom > 1123 - 26 + 1 || p.spacer < 0);
        if (bad.length) {
          failures++;
          console.log(`FAIL ${type} lines=${n} long=${long}`, JSON.stringify(r));
        } else if (process.env.VERBOSE) console.log(`ok ${type} lines=${n} long=${long} pages=${r.length} spare=${r.map((p) => p.spacer).join("/")}`);
      }
    }
  }
  await browser.close();
  console.log(failures ? `${failures} layout problem(s)` : "All layouts fit on A4");
  process.exit(failures ? 1 : 0);
})();
