# Merc Lab DMS — parts, quotations, payments, receipts

The first working part of the Merc Lab DMS. The old screen design in the repository root stays on GitHub Pages; this app is separate.

## The flow

1. **Parts tab:** upload a supplier receipt (photo or PDF). AI reads the supplier, date and each part. Selling price = cost + your markup %, rounded up. Check the blue boxes, then Save.
2. **Quotes tab:** pick the customer, add parts from stock, labour and other items, then make the quotation. Send it by WhatsApp or save it as a PDF. The client opens a private link.
3. **Money tab:** upload the payment slip (bank transfer / DuitNow). AI reads the amount and reference, and finds the matching quotation. Record it to make the receipt, then send it by WhatsApp.
4. **Settings tab:** markup %, rounding, workshop details and bank account for quotations.

The AI only fills in the form. Nothing is saved until the owner presses Save. Quotations and receipts are sent by the owner from WhatsApp; the app never messages clients by itself.

## Data

Airtable base **Merc Lab DMS** (`appfipyDV5e2cZtyB`): Settings, Purchases, Parts, Customers, Quotations, Payments. It holds customer data, so keep it private. It is separate from the Command Center and from all Asbenz data.

## Run

Environment variables:

| Name | What |
|---|---|
| `AIRTABLE_BASE_ID` | `appfipyDV5e2cZtyB` |
| `AIRTABLE_PAT` | Airtable token with read/write access to the Merc Lab DMS base |
| `GEMINI_API_KEY` | Google Gemini key for reading receipts |
| `APP_PASSWORD` | the owner's login password |
| `SESSION_SECRET` | any long random text |

```bash
npm ci && npm test && npm start
```

Hosting: `render.yaml` in the repository root sets up a Render web service from the `dms/` folder.
