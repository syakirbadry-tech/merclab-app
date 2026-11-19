#!/usr/bin/env node
// Make an A4 PDF (and HTML preview) from JSON, without the web app.
//
//   node scripts/generate.js --type invoice --data job.json --out INV-2026-00001.pdf
//     [--company company.json] [--html preview.html]
//
// Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
// The Arimo font is bundled in public/fonts, so the PDF looks the same on any machine.

const fs = require("fs");
const path = require("path");
const { render } = require("../server/template");
const { cleanGroups } = require("../server/money");

function args() {
  const a = {};
  const v = process.argv.slice(2);
  for (let i = 0; i < v.length; i += 2) a[v[i].replace(/^--/, "")] = v[i + 1];
  return a;
}

async function main() {
  const a = args();
  if (!a.data || !a.out) {
    console.error("Usage: generate --type estimate|invoice|receipt --data job.json --out file.pdf [--company company.json] [--html preview.html]");
    process.exit(2);
  }
  const doc = JSON.parse(fs.readFileSync(a.data, "utf8"));
  if (a.type) doc.type = a.type;
  doc.groups = cleanGroups(doc.groups);
  const company = JSON.parse(fs.readFileSync(a.company || path.join(__dirname, "..", "config", "company.json"), "utf8"));
  const fontDir = "file://" + path.join(__dirname, "..", "public", "fonts") + "/";
  const html = render(doc, company, { screen: false, fontBase: fontDir });
  if (a.html) fs.writeFileSync(a.html, html);

  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const tmp = path.join(require("os").tmpdir(), `mldoc-${process.pid}.html`);
  fs.writeFileSync(tmp, html);
  await page.goto("file://" + tmp);
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: a.out, format: "A4", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await browser.close();
  fs.unlinkSync(tmp);
  console.log(`Saved ${a.out}`);
}

main().catch((e) => {
  console.error(e.status === 400 ? `Cannot make the document: ${e.message}` : e);
  process.exit(1);
});
