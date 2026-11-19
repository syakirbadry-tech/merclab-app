# Handover: The Merc Lab document templates (Estimate, Invoice, Receipt)

**For:** Claude Code
**From:** Owner, The Merc Lab / TNS Legacy
**Date:** 19 Nov 2026
**Design source:** https://claude.ai/artifact/8r8b1Q2NULMCEnURLopSex (canvas)
**Reference file:** `reference-estimate.html` (same folder; open in Chrome, it is the approved Estimate layout at A4)

---

## 1. Goal

Build one A4 document template that generates three document types for the workshop:

1. **Estimate** (quote before work)
2. **Invoice** (bill after work)
3. **Official Receipt** (proof of payment)

All three share the same layout, fonts, and table. Only the title, a few header fields, the watermark and the bottom-right box change per type (see section 6).

Output: a print-ready **A4 PDF**, plus HTML preview. Data comes in as JSON (section 7).

---

## 2. Branding and legal entity

- **The Merc Lab** is the trading/brand name. It appears as the logo at top-left.
- **TNS Legacy** is the registered business: an **Enterprise** registered with SSM (not a Sdn Bhd), and **not SST-registered**. Its legal name and SSM number appear top-right, in the bank account name, and in the footer.
- Footer line (left): `The Merc Lab is a trading name of TNS Legacy`
- No Mercedes-Benz star, logo or "CustomerCare" branding. The Merc Lab is independent. The text "Independent Mercedes-Benz Specialist" is OK as a description.

Config values (put in one `company.json`, not hard-coded):

```json
{
  "brandName": "THE MERC LAB",
  "tagline": "Independent Mercedes-Benz Specialist",
  "hotline": "[PHONE NO.]",
  "legalName": "TNS Legacy",
  "registrationNo": "[SSM NO.]",
  "sstRegistrationNo": null,
  "address": "[WORKSHOP ADDRESS]",
  "tel": "[TEL]",
  "email": "[EMAIL]",
  "bank": { "name": "[BANK NAME]", "accountName": "TNS Legacy", "accountNo": "[ACCOUNT NO.]" },
  "duitNowQrImage": null,
  "whatsapp": "[WHATSAPP NO.]",
  "partsWarrantyMonths": null,
  "estimateValidityDays": 7,
  "serviceTaxRate": 0.08
}
```

Use the business name exactly as printed on the SSM certificate (confirm whether it includes the word "Enterprise").

**SST:** TNS Legacy is not SST-registered, so `sstRegistrationNo` is null. No SST line in the letterhead, no Service Tax row, no service tax charged, and invoice title is `INVOICE` (never `TAX INVOICE`). Keep the tax logic behind this flag so it can be switched on if the business registers later (the registration threshold is based on annual taxable turnover).

---

## 3. Page and typography

- **Page:** A4 portrait, 794 × 1123 px at 96 dpi (210 × 297 mm). One page per document. Padding: 30px top, 40px sides, 26px bottom.
- **Font:** Arial (fallback: Arimo, Helvetica, sans-serif). Arimo is metric-compatible with Arial and is used for server-side PDF rendering where Arial isn't installed.
- **Colours:** text `#111111`; outer borders `#8a8a8a` 1px; inner row dividers `#b5b5b5` 1px; header cell fill `#e2e2e2`; watermark `rgba(0,0,0,0.06)`. Black-and-white printable.

| Element | Size | Weight |
|---|---:|---|
| Document title (ESTIMATE / INVOICE / OFFICIAL RECEIPT) | 18 pt (24px) | Bold |
| Company legal name (top right) | 12 pt (16px) | Bold |
| Brand logo text "THE MERC LAB" | 26px | Bold |
| Hotline | 19px | Bold |
| Customer and vehicle details | 10 pt (13.33px) | Regular |
| Field labels and table headers | 9 pt (12px) | Bold |
| Line items: parts, labour, qty, prices | 10 pt | Regular |
| Subtotal and service tax | 10 pt | Regular |
| **Grand total** | **14 pt (18.67px)** | **Bold** |
| Terms, warranty, footer | 9 pt (12px) | Regular |

---

## 4. Layout, top to bottom

1. **Letterhead** (2px black rule underneath)
   - Left: **Logo C "Lab label"** (approved): small letter-spaced `THE` (12px bold, 0.5em tracking); `MERC` (36px bold) next to `LAB` reversed white in a solid #111 box; a thin waveform line under it; tagline `INDEPENDENT MERCEDES-BENZ SPECIALIST` (12px bold). Then `Hotline …` (19px bold). Exact markup is in `reference-estimate.html`. It's built from text + one SVG polyline, so it stays sharp at any size; export a standalone SVG for other uses.
   - Right (right-aligned): legal name, Registration No, SST Registration No (if any), address, Tel · Email
2. **Two boxes side by side** (each with a grey header strip)
   - `Invoice To`: invoice name + address (e.g. "Service Retail Cash Sales" or a fleet/company name)
   - `Customer`: name + address lines
3. **Document title**, centred.
4. **Document and vehicle grid**: one bordered box, 6 columns (`1.75fr 1.35fr 1.2fr 0.9fr 0.6fr 0.45fr`), three label/value band pairs:
   - Row A labels: Account No. | Document Number | Document Date | Repair Date | Order Number (spans 2)
   - Row B labels: Make & Model | Chassis No. | Engine No. | Km | Time | Page
   - Row C labels: Reference No. | Reg No. | Reg Date | WIP No. | Job No. (spans 2)
   - Per-type changes to these fields: section 6.
5. **Line-item table**: columns `[group code] | [category / op code] | Description | Qty. | Unit Price | RM`
   - Vertical rules only between Description / Qty / Unit Price / RM.
   - Rows are grouped by **job group** (`C1`, `C2`…). Each group starts with a "Customer request" header row (e.g. "TO PERFORM SERVICE B PLUS", amount 0.00), then a small gap, then its lines.
   - Parts lines show Qty and Unit Price; labour and sundry lines show only the RM amount.
   - Totals in `<tfoot>`: **Total Amount**, then a grey **Grand Total (RM)** row. (With SST on: Exclusive / Service Tax / Inclusive rows instead of Total Amount.)
   - "Customer copy" watermark sits behind the table (Estimate only by default).
6. **Bottom section**, 2 columns:
   - Left: terms paragraphs, "You were served by: [name]  Operator: [id]", cost summary (Parts / Surcharge / Labour / Sublet/Sundries / Menus).
   - Right: the per-type box (Payment Details or Payment Received; see section 6).
7. **Flexible spacer**, then the **footer** (1px top rule): trading-name line on the left, "This is a computer generated [document], no signature is required." on the right.

**Page fit:** the reference uses all 1123px with about 17 line rows. For more lines, the table must either (a) continue on page 2 with the header and vehicle grid repeated and "Page 1 of 2" in the Page field, or (b) shrink the gap rows first. Totals, the bottom section and the footer stay together on the last page.

---

## 5. Calculations

```
parts_total       = Σ qty × unit_price   (type = "part")
labour_total      = Σ amount             (type = "labour" or "sundry")
sublet_total      = Σ amount             (type = "sublet")
subtotal          = parts_total + labour_total + sublet_total + surcharge + menus
service_tax       = round2( Σ amount where taxable = true ) × serviceTaxRate
total_incl_tax    = subtotal + service_tax
grand_total       = round_to_5_sen(total_incl_tax)   (see note)
```

- (Only relevant if SST is switched on.) In the Asbenz original, **only the two labour op codes were taxable** (390 + 30 = 420 → 8% = 33.60). The sundries (consumables, detailing, antibac, wax) are counted under Labour but are **not** taxed. Keep a per-line `taxable` flag and don't assume.
- **Rounding:** Malaysia's rounding mechanism rounds the final bill to the nearest 5 sen (cash payments). Implement `round_to_5_sen` but make it switchable. The reference total (2,417.05) is already a multiple of 5 sen.
- Money: use integer sen internally, never floats. Display with thousands separators and 2 decimals (`2,383.45`).

**Reference test case** (must reproduce exactly):

Current setting (not SST-registered), as shown in `reference-estimate.html`:

| | RM |
|---|---:|
| Parts | 1,623.70 |
| Labour (incl. sundries 339.75) | 759.75 |
| Total Amount | 2,383.45 |
| Grand Total | 2,383.45 |

If SST is switched on later, the same data must give: tax 8% on 420.00 = 33.60, total 2,417.05. Totals rows then become "Total Amount Exclusive of Service Tax / Service Tax @ 8% / Total Amount Inclusive of Service Tax".

---

## 6. Differences per document type

| | Estimate | Invoice | Official Receipt |
|---|---|---|---|
| Title | `ESTIMATE` | `INVOICE` (`TAX INVOICE` only if SST is switched on) | `OFFICIAL RECEIPT` |
| Number format (suggested) | `EST-YYYY-#####` | `INV-YYYY-#####` | `OR-YYYY-#####` |
| Row A "Order Number" | Order No. | **Due Date** | **Invoice No.** (the one being paid) |
| Row A "Repair Date" | blank or planned date | Repair date (required) | Payment date |
| Watermark | "Customer copy" (toggle) | none | "PAID" |
| Line items table | full | full | full (copied from the invoice), or a short summary with one line referencing the invoice; make this switchable |
| Bottom-right box | **Payment Details**: bank, account name, account no., reference, DuitNow QR, "Payment due on vehicle collection…" | **Payment Details**, the same, plus "Amount due: RM x" and due date | **Payment Received**: date, method (cash / transfer / DuitNow / card), transaction ref, amount received, balance outstanding |
| Terms (left) | "Price subject to change without prior notification. Price estimated is valid for {estimateValidityDays} days." + warranty line | warranty line + payment terms | "Received with thanks." + warranty line |
| Footer right text | "…computer generated estimate…" | "…computer generated invoice…" | "…computer generated receipt…" |
| Mileage (Km) | required, never 0 | required | copied from invoice |

Flow: Estimate → (approved) → Invoice (copies lines, adds actual repair date and final lines) → Receipt(s) (one or more payments against the invoice; balance = invoice grand total − Σ receipts).

---

## 7. Data model (input JSON)

```json
{
  "type": "estimate",
  "number": "EST-2026-00001",
  "date": "2026-11-19",
  "time": "14:45",
  "accountNo": "",
  "orderNo": "",
  "referenceNo": "",
  "wipNo": "",
  "jobNo": "",
  "invoiceTo": { "name": "Service Retail Cash Sales", "address": [] },
  "customer": { "name": "", "address": ["", ""], "phone": "" },
  "vehicle": {
    "makeModel": "Mercedes-AMG A45 S 4MATIC+",
    "chassisNo": "", "engineNo": "", "regNo": "", "regDate": "", "mileageKm": 0
  },
  "advisor": { "name": "", "operatorId": "" },
  "groups": [
    {
      "code": "C1",
      "request": "TO PERFORM SERVICE B PLUS",
      "lines": [
        { "type": "sundry", "category": "SUNDRY", "description": "WORKSHOP CONSUMABLES - SUNDRIES", "amount": 30.00, "taxable": false },
        { "type": "part", "partNo": "", "description": "ENGINE OIL MB229.71 0W-20 1L", "qty": 1, "unitPrice": 96.30, "taxable": false },
        { "type": "labour", "opCode": "00115800", "description": "Perform Service B with Plus package", "amount": 390.00, "taxable": true }
      ]
    },
    { "code": "C2", "request": "COMPLIMENTARY CARWASH", "lines": [] }
  ],
  "surcharge": 0, "menus": 0,
  "invoiceNo": null, "dueDate": null,
  "payment": { "date": null, "method": null, "reference": null, "amount": null }
}
```

Display rules: the category column shows `category` for sundries, `opCode` for labour, blank for parts (the group code, e.g. C1, is always shown). Descriptions print as entered (uppercase for parts/sundries, sentence case for labour op names, matching the reference).

The full reference line set is in `reference-estimate.html`: 4 sundries, 7 parts, 2 labour ops, 1 C2 group.

---

## 8. Data source (optional integration)

The owner's Airtable base **"Merc Workshop Diagnostics Hub"** has Customers, Vehicles, Job Cards, Diagnostics, Parts and Invoicing tables. Ideal end state: generate any of the three documents from a Job Card record (customer + vehicle + parts + labour lines), and write the generated number and PDF back to Invoicing. Confirm field names with the owner before mapping; don't assume.

---

## 9. Suggested implementation

- One HTML template (e.g. Handlebars/Nunjucks/JSX) driven by `type`, plus a CSS file reproducing `reference-estimate.html`.
- PDF via headless Chromium (Playwright `page.pdf({ format: 'A4', printBackground: true, margin: 0 })`). Bundle Arimo locally so output is identical on any machine.
- CLI or small API: `generate --type invoice --data job.json --out INV-2026-00001.pdf`.
- Sequential, gap-free numbering per type per year, stored persistently. Invoice and receipt numbers must never be reused.

---

## 10. Acceptance criteria

- [ ] Reference data renders pixel-close to `reference-estimate.html` on one A4 page; nothing clipped at the bottom.
- [ ] Totals match the test case in section 5 to the sen.
- [ ] All three types render from the same template, with the differences in section 6.
- [ ] With `sstRegistrationNo` null (current): no SST line, no service tax row, title `INVOICE`. Switching it on restores them and gives 2,417.05 on the test data.
- [ ] Mileage of 0 or empty blocks generation, with a clear error.
- [ ] Receipt shows the correct balance across multiple partial payments.
- [ ] More than ~17 lines flows to page 2 cleanly (header repeated, "Page x of y").
- [ ] Prints correctly in black and white.

---

## 11. Open questions for the owner (don't guess; leave as placeholders)

1. ~~Sdn Bhd or Enterprise?~~ **Answered: Enterprise.** Confirm the exact registered name on the SSM certificate.
2. SSM registration no., workshop address, hotline, tel, email, WhatsApp.
3. ~~SST-registered?~~ **Answered: not registered.** No service tax; title "INVOICE".
4. Bank name, account no., and the DuitNow QR image.
5. Parts warranty length (months).
6. (Only if SST is registered later) which items are taxable.
7. Should 5-sen rounding apply to every bill or only to cash payments?
8. Receipt: full line items or a summary?

