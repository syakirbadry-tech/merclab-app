# Merc Lab DMS: parts, estimates, invoices, receipts

The first working part of the Merc Lab DMS. The old screen design in the repository root stays on GitHub Pages; this app is separate.

## Screens

A dark menu on the left (on a phone: the Menu button and the bar at the bottom), and these pages:

- **Dashboard:** money in today and this month, invoiced this month, what customers owe, cars in the workshop, a workshop board (Booked → In workshop → Waiting parts → Ready), service due, low stock, latest payments.
- **Jobs:** all estimates and invoices with filters. Each job has a stage bar (Booked, In workshop, Waiting parts, Ready, Collected).
- **Vehicles:** every car by plate, with photo, mileage, fuel, gearbox, owner and last visit. A car page has three tabs:
  - *Details:* technical data, next service date / km, owner, notes.
  - *Service history:* every job for that car, money spent and owing.
  - *Body condition:* tap the car drawing (left, right, top, front, rear) to mark a scratch, dent, stone chip, repaint, crack or rust, with a note and a photo. Mark it fixed later. Use it at check-in with the customer.
- **Customers:** a table with phone, cars, last visit, spent and owes, and a page per customer.
- **Parts & stock**, **Money** (receipts and who owes you, with a WhatsApp reminder button) and **Settings**.
- A search box at the top finds a plate, a customer or an EST / INV number.

## The flow

1. **Parts tab:** upload a supplier receipt (photo or PDF). AI reads the supplier, date and each part. Selling price = cost + your markup %, rounded up. Check the blue boxes, then Save.
2. **Jobs tab:** **ESTIMATE → INVOICE.**
   - Make an estimate: customer, vehicle (mileage is required), and one or more customer requests (C1, C2…) with part, labour, sundry and sublet lines.
   - When the work is done, press **Work done → make invoice**. The lines are copied and can be changed to the final ones. The estimate stays as it was.
   - A walk-in can be saved straight as an invoice.
3. **Money tab:** upload the payment slip. AI reads it and finds the estimate or invoice. Record it to create the **OFFICIAL RECEIPT**.
   - Part payments are fine: each receipt shows the balance right after that payment.
4. **Settings tab:** registered name, SSM no., hotline, address, bank, WhatsApp, parts warranty, DuitNow QR, markup.

The AI only fills in the forms. Nothing is saved until the owner presses Save. Documents are sent by the owner from WhatsApp; the app never messages clients by itself.

## Documents (A4)

Built to `docs/handover/HANDOVER-document-templates.md` and the approved layout `docs/handover/reference-estimate.html`.

- **One template** (`server/template.js`) for ESTIMATE, INVOICE and OFFICIAL RECEIPT. The client opens a private link and uses **Save as PDF**; the page is set to A4 with no margins.
- **Money** is kept in integer sen (`server/money.js`). Reference test case: parts 1,623.70, labour 759.75, grand total 2,383.45. With SST switched on: 33.60 tax and 2,417.05.
- **SST:** off, because TNS Legacy is not SST-registered. To switch it on, set `sstRegistrationNo` in `config/company.json`. The title then becomes TAX INVOICE and the service tax rows appear. Each line has a `taxable` flag.
- **Long jobs** continue on page 2: the header is repeated, the Page field reads "1 of 2", and the totals stay on the last page. `npm run check-layout` checks 1–70 lines in real Chromium.
- **Numbers:** gap-free per type per year: `EST-2026-00001`, `INV-2026-00001`, `OR-2026-00001` (and `PUR-` for supplier receipts).
- **PDF without the app:** `npm run generate -- --type estimate --data test/fixtures/reference-estimate.json --out EST.pdf`. This needs `npm i -D playwright && npx playwright install chromium`. The Arimo font is bundled in `public/fonts`.
- **Logo** as a standalone file: `public/brand/merc-lab-logo.svg`.

Switches in `config/company.json`:

| Switch | Meaning |
|---|---|
| `roundTo5Sen` | Round the grand total to 5 sen |
| `receiptLineItems` | `"full"` (copy the lines) or `"summary"` (one line) |
| `estimateWatermark` | Show "Customer copy" on estimates |

Personal details are not stored in this public repository; they are entered in Settings.

## Data

Airtable base **Merc Lab DMS** (`appfipyDV5e2cZtyB`): Settings, Purchases, Parts, Customers, Vehicles (one record per car, with condition marks and photos), Quotations (one record per job: estimate and invoice, plus its Stage), Payments. It holds customer data, so keep it private. It is separate from the Command Center and from all Asbenz data.

## Run

| Env | What |
|---|---|
| `AIRTABLE_BASE_ID` | `appfipyDV5e2cZtyB` |
| `AIRTABLE_PAT` | Airtable token with read/write access to the Merc Lab DMS base |
| `GEMINI_API_KEY` | Google Gemini key for reading receipts and slips |
| `APP_PASSWORD` | the owner's login password |
| `SESSION_SECRET` | any long random text |

```bash
npm ci && npm test && npm start
```

Hosting: `render.yaml` in the repository root sets up a Render web service from the `dms/` folder.

## Open questions (from the handover; placeholders until answered)

1. Exact registered name on the SSM certificate (with or without "Enterprise").
2. SSM no., workshop address, hotline, tel, email, WhatsApp. Enter them in Settings.
3. Bank name, account no., DuitNow QR. Enter them in Settings.
4. Parts warranty length (months). Shows as `[X]` until it is set.
5. 5-sen rounding: every bill, or cash only? Currently off.
6. Receipt: full line items or a summary? Currently full.
