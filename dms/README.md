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
- **Packages:** ready-made jobs (Service A/B, brake pads…). Pick one in the estimate and its request and lines are added, with today's stock prices.
- **Fault cases:** symptom, fault codes, tests, root cause and fix for each job, searchable. No customer names, so it can feed the Workshop Datahub.
- **On each job:** check-in (fuel, keys, items left, odometer photo), an inspection checklist (OK / Soon / Now with readings and photos) with a report link for the customer (no prices), a fault case, and a printable job card for the mechanic (no prices).
- **Online approval:** the estimate link has an "Approve estimate" box. The customer types their name; the job shows "Approved online" and moves to In workshop.
- **Discount** on estimates and invoices (comes off before tax; printed as "Less Discount").
- **CRM:**
  - *Customers:* type (Customer / Lead / Fleet), how they found you, tags, next follow-up. Each customer page has a follow-up card and an activity timeline (contacts, jobs, payments, bookings) with "Log contact".
  - *Follow-ups:* due in the next 7 days, a win-back list (no visit for 6+ months) and leads, with WhatsApp / Call / Log buttons.
  - *Service reminders:* cars due within 30 days or near their service km (km estimated from visit history), with a WhatsApp reminder that records the date. Tick "Set next service reminder" on an invoice (Settings has the km / month interval).
  - *Bookings:* a week calendar. "Car arrived: start estimate" opens a new estimate linked to the booking.
- **Finance:**
  - *Money in:* receipts and who owes you.
  - *Expenses:* upload a bill and AI fills it in; choose a category. "Tools & equipment" counts as an asset and "Owner drawings" as money taken out, so neither lowers profit.
  - *Credit notes:* made from an invoice's job page (CN-YYYY-#####). They lower what the customer owes, or record a refund. The customer gets a link to a printable credit note.
  - *Profit & Loss:* sales (parts, labour, sublet, less discounts and credit notes), parts cost (exact for parts picked from stock, estimated from the markup otherwise), gross profit, running costs and net profit for a month or year, plus a cash in/out view and Excel (CSV) exports for the accountant.
  - *Balance sheet:* cash and bank (opening balance plus money in minus money out), what customers owe, stock at cost, tools; supplier bills not paid and customer deposits; owner capital, drawings and profit kept. Set the opening cash, date and capital in Settings. It is built from the DMS records and is not audited.
- **Stock:** *Parts & stock* (with price history and a stock count that logs every change), *Suppliers* (bills to pay, marked paid when settled; a receipt can be saved as "Pay later"), and *Part orders* (parts ordered for a car: Ordered → Arrived → Fitted).
- **Inbox (WhatsApp):** forward a supplier bill, an expense bill or a customer's payment slip to the workshop's WhatsApp Business number. It lands in the Inbox, AI reads it and WhatsApp replies with what it found. Press "Check & save" to record it as a parts receipt, an expense or a payment (nothing is recorded before you save). A caption like "expense" or "slip" picks the type; you can change it in the Inbox. Setup steps are on the Inbox page. Env: `WA_TOKEN`, `WA_PHONE_ID`, `WA_APP_SECRET`, `WA_VERIFY_TOKEN`, `WA_ALLOWED` (the feature stays off until all are set). Only signed requests from Meta and messages from the numbers in `WA_ALLOWED` are accepted.
- **Look (v1.1 "Workshop Glass"):** `public/merclab.css` is the design system from the Claude Design handover (`merclab-handover/`); `public/bridge.css` joins it to the older `style.css`. The menu groups fold (only the current one is open). On a phone: Home · Jobs · + Create · Money · More, tables turn into list rows, and the dashboard starts with swipe tiles and "Needs action". Ctrl K focuses search.
- **Financial statements (MPERS):** Finance → Financial statements. Statement of financial position, profit or loss and other comprehensive income, changes in owner's equity, cash flows (direct method) and notes, per year, with Print/PDF and Excel. Read-only; built from the DMS records and not audited. Tools are depreciated at 20% a year straight line. If equity does not reconcile, the gap is shown for the accountant.
- **Assistant:** answers questions from the DMS records, as Kazumi (CEO) or the COO, CFO, Customer CRM or Technical agent, with the records it used. Read-only: it cannot save, send, pay or delete. Has a morning brief. Env: `GEMINI_API_KEY` (already used for slips), `ASSISTANT_OFF=1` switches it off, `ASSISTANT_DAILY_CAP` (default 150 questions a day).
- **Merc HUB:** Workshop → Merc HUB. The diagnosis database built from the fault cases, searchable by symptom, fault code and chassis code (W205, X253…), with the most seen codes. "Export for HUB" downloads the cases with no customer, plate or price, in the Workshop Diagnostic Network case format.
- **Labour by the hour:** each labour line has Hours; the amount fills in as hours × the labour rate (Settings → Labour rate per hour, RM 100). The amount can still be changed. Packages keep their labour hours, so they follow the current rate.
- **Packages and the chassis number:** a package can list the models it fits (Packages → Fits models), taken from the chassis number W1K**177**__0542__N161234: characters 4–6 are the model (177 = W177), 7–10 the variant (0542 = A45 S). `177` fits every W177, `1770542` only the A45 S, empty fits any model. On an estimate the chassis number is decoded under the field, and adding a package that does not fit (or with no chassis number yet) asks before adding it.
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

Built to the document handover, **layout v3** (section 4B, 20 Nov 2026), which follows the TNS Legacy invoice: centred Merc Lab logo and business line, BILL TO on the left, the document title and numbers on the right, a 4-column table (Description, Qty, Unit price, Total), notes and totals, signature lines and footer. No watermark.

- **One template** (`server/template.js`) for ESTIMATE, INVOICE and OFFICIAL RECEIPT. The client opens a private link and uses **Save as PDF**; the page is set to A4 with no margins.
- **Totals:** estimate = Subtotal, Discount, TOTAL. Invoice = Subtotal, Discount, Total, Deposit, BALANCE DUE. Receipt = Subtotal, Discount, Total, (Paid earlier), Amount received, BALANCE. Labour priced by hours prints hours × rate (1.2 × 100.00).
- **Missing details are never printed.** An empty Settings value (SSM no., address, email, bank, warranty, DuitNow QR) leaves its label out of the customer's copy. When you open a document link while logged in to the app, you get the **staff view**: amber "Fill in: …" boxes show what is missing. They never print. A customer document with leftover `[...]` placeholder text is refused.
- **Print vs online:** the approval panel ("Happy with this estimate?") and the Save as PDF button sit outside the A4 page and are hidden when printing.
- **Money** is kept in integer sen (`server/money.js`). Reference test case: parts 1,623.70, labour 759.75, grand total 2,383.45. With SST switched on: 33.60 tax and 2,417.05.
- **SST:** off, because TNS Legacy is not SST-registered. To switch it on, set `sstRegistrationNo` in `config/company.json`. The title then becomes TAX INVOICE and the service tax rows appear. Each line has a `taxable` flag.
- **Long jobs** continue on page 2: the header is repeated, the footer reads "Page 1 of 2", and the totals stay on the last page. One page holds about 14 lines on an estimate (16 on an invoice). `npm run check-layout` checks 1–70 lines in real Chromium (also with `LONG_TOP=1` for long names and `DRAFT=1` for the staff view).
- **Numbers:** gap-free per type per year: `EST-2026-00001`, `INV-2026-00001`, `OR-2026-00001` (and `PUR-` for supplier receipts).
- **PDF without the app:** `npm run generate -- --type estimate --data test/fixtures/reference-estimate.json --out EST.pdf`. This needs `npm i -D playwright && npx playwright install chromium`. The Arimo font is bundled in `public/fonts`.
- **Logo** as a standalone file: `public/brand/merc-lab-logo.svg`.

Switches in `config/company.json`:

| Switch | Meaning |
|---|---|
| `roundTo5Sen` | Round the grand total to 5 sen |
| `receiptLineItems` | `"full"` (copy the lines) or `"summary"` (one line) |

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
| `SESSION_SECRET` | any long random text. Changing it logs out every device |
| `ALERT_WEBHOOK_URL` | optional: Slack, Discord or ntfy.sh webhook; a server error posts one line there (at most every 15 min) |

### Safety on the live site
- **Login:** everything under `/api` needs the owner login (30-day cookie, HttpOnly, Secure). 8 wrong passwords per 15 min per address are blocked.
- **Customer links** (`/d/...`) use a random 128-bit token; 60 opens per 5 min per address. Wrong approve links count as failed tries.
- **Rate limits:** API 600 requests / 5 min per address; AI reading 60 / hour.
- **Errors:** users get a plain message or a friendly page; details go to the Render log and the error list on Settings → System & backup.
- **Health:** `/health` (server up) and `/health?deep=1` (database too, cached 60 s), for an uptime monitor.
- **Rollback:** code with Render → Deploys → Rollback (or revert the PR); data from Settings → Download full backup, plus Airtable's own record history and snapshots.

```bash
npm ci && npm test && npm start
```

Hosting: `render.yaml` in the repository root sets up a Render web service from the `dms/` folder.

## Open questions (from the handover; placeholders until answered)

1. Exact registered name on the SSM certificate (with or without "Enterprise").
2. SSM no., workshop address, hotline, tel, email, WhatsApp. Enter them in Settings.
3. Bank name, account no., DuitNow QR. Enter them in Settings.
4. Parts warranty length (months). The warranty sentence is left out until it is set.
5. 5-sen rounding: every bill, or cash only? Currently off.
6. Receipt: full line items or a summary? Currently full.
