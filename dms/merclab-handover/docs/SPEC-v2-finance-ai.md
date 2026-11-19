# Merc Lab DMS v2: finance and AI agent spec

19/11/2026 · Source: "Merc Lab DMS v2: finance and AI agent spec" (Claude Docs). Check every tax figure with the tax agent before go-live; they change with each Budget.

## 1. Summary

v2 turns the DMS from a workshop app with a cash list into a full set of double-entry books that follows Malaysian practice. It adds **Merc Lab Assistant**, an AI agent that drafts and leaves approval to the owner: nothing is sent, saved, posted or paid until the owner taps Approve. Every workshop event writes its journal in the background, so the owner never types a debit or a credit.

| Fact | Value assumed | What it drives |
| --- | --- | --- |
| Legal entity | TNS Legacy, an Enterprise registered with SSM | Owner's capital and drawings; income on Form B (Form P if it is a partnership) |
| Trading name | The Merc Lab | Printed beside the SSM no. on every document |
| SST | Not registered | No tax line. A rolling 12-month counter warns at RM400,000 (the threshold is RM500,000) |
| e-Invoice (MyInvois) | Below the exemption threshold | Built, switched off; switch on at the threshold or when a buyer asks |
| Financial year | 1 Jan – 31 Dec | YA = calendar year; Form B due 30 June the next year |
| Currency | RM only | `RM 1,234.50` |

## 2. Malaysian rules the system enforces

| Area | Rule | How the DMS handles it | Type |
| --- | --- | --- | --- |
| Record keeping | Keep records for 7 years (ITA 1967 s.82) | Nothing financial is deleted. Fix with a reversing entry, a note or a void that keeps the original. Each source file is stored with its journal | Hard rule |
| Document numbers | In order, no gaps, no reuse | Series: EST, INV, OR, CN, DN, RN, PV, JV. Voided numbers stay, marked Void | Hard rule |
| Invoice content | Seller name, SSM no., address, date, no., buyer, description, qty, price, total | Fixed A4 layout; space for TIN and SST no. when those switches are on | Hard rule |
| Official receipt | One OR per payment, quoting the invoice | Recording a payment always creates an OR; part-payments each get one | Hard rule |
| Corrections | Never edit an issued invoice | Locked. CN reduces, DN adds, RN refunds; each posts and links to the invoice | Hard rule |
| Service tax | Motor vehicle service/repair centres register above RM500,000 in 12 months; rate 8% | Off. Warn at RM400,000. On: a tax code per line, the SST no. on documents, a 2-monthly SST-02 summary | Setting + reminder |
| e-Invoice | Mandatory above the turnover threshold (RM1 million as widely reported; one source says RM3 million from Aug 2026, so confirm with LHDN). A sale over RM10,000 cannot be consolidated | Off but built: TIN, MSIC 45200, buyer TIN, LHDN UUID and QR on the PDF. On: B2B gets its own e-Invoice; B2C sales are consolidated within 7 days of month end | Setting + reminder |
| Buyer asks for an e-Invoice | Business customers (fleets) may ask | Per-customer flag "Needs e-Invoice"; fleet customers prompt for a TIN | Setting |
| Capital allowances | IA 20% + AA: plant and machinery 14%, motor vehicles 20%, office equipment and furniture 10%; ICT 40% IA + 20% AA; small value assets ≤ RM2,000 each: 100% | Fixed asset register with an asset class; IA, AA and residual expenditure per YA. Book depreciation runs separately | Hard rule |
| Non-commercial vehicle | Qualifying cost capped at RM100,000 (new, ≤ RM150,000) or RM50,000 | Cap applied by asset class | Hard rule |
| Private use | Personal spending is drawings | A "Drawings" type; the agent flags slips that look personal | Hard rule + agent |
| Form B / P | Due 30 June for the previous YA; CP500 instalments | Year-end pack; reminders | Reminder |
| Staff | EPF, SOCSO, EIS, PCB monthly by the 15th | Payroll stays outside; a monthly payroll journal is imported; reminder on the 10th | Reminder |
| Bank | Reconcile monthly | A month cannot close until every account is reconciled | Hard rule |

References: [PwC capital allowances](https://pwc.com/my/en/publications/mtb/capital-allowances.html) · [PwC tax summaries](https://taxsummaries.pwc.com/malaysia/corporate/deductions) · [PwC service tax](https://www.pwc.com/my/en/publications/mtb/service-tax.html) · [MyInvois 2026 update](https://axxis-consulting.com/lhdn-e-invoicing-2026-update/) · [RM3M report](https://jomeinvoice.my/article/lhdn-e-invoice-implementation-update-2026/)

## 3. Finance design

Double entry on an accrual basis: a sale counts when invoiced and a cost when billed. Every journal must balance before it saves, and each one links to its source (job, bill, slip, note).

### Chart of accounts
Accounts can be added under a group but never deleted once used.

| Code | Account | Group |
| --- | --- | --- |
| 1000 | Cash in hand | Current assets |
| 1010 | Demo Bank current account | Current assets |
| 1020 | DuitNow / card clearing | Current assets |
| 1100 | Trade receivables | Current assets |
| 1200 | Parts inventory | Current assets |
| 1300 | Deposits and prepayments | Current assets |
| 1500 | Workshop equipment | Fixed assets |
| 1510 | Office equipment and computers | Fixed assets |
| 1520 | Motor vehicles | Fixed assets |
| 1590 | Accumulated depreciation | Fixed assets (contra) |
| 2000 | Trade payables | Current liabilities |
| 2100 | Customer deposits received | Current liabilities |
| 2200 | Accruals | Current liabilities |
| 2300 | EPF / SOCSO / EIS / PCB payable | Current liabilities |
| 2400 | SST payable (inactive) | Current liabilities |
| 2600 | Hire purchase / loans | Long-term liabilities |
| 3000 | Owner's capital | Equity |
| 3100 | Owner's drawings | Equity |
| 3200 | Retained profit | Equity |
| 4000 | Sales: parts | Income |
| 4010 | Sales: labour | Income |
| 4020 | Sales: sublet | Income |
| 4090 | Discounts and credit notes | Income (contra) |
| 4900 | Other income | Income |
| 5000 | Cost of parts sold | Cost of sales |
| 5010 | Sublet cost | Cost of sales |
| 5020 | Workshop consumables | Cost of sales |
| 6000 | Rent | Operating costs |
| 6010 | Electricity and water | Operating costs |
| 6020 | Staff salaries and statutory | Operating costs |
| 6030 | Tools under RM2,000 | Operating costs |
| 6040 | Software and subscriptions (incl. AI) | Operating costs |
| 6050 | Marketing | Operating costs |
| 6060 | Bank charges | Operating costs |
| 6070 | Depreciation | Operating costs |
| 6090 | General expenses | Operating costs |

### Auto-posting

| Event | Debit | Credit |
| --- | --- | --- |
| Issue invoice | 1100 | 4000 / 4010 / 4020 by line type |
| (same moment) | 5000 | 1200 at average cost |
| Record payment | 1000 / 1010 / 1020 by method | 1100 |
| Deposit on estimate | Cash or bank | 2100 (moved to 1100 on invoice) |
| Credit note | 4090 | 1100 |
| Supplier bill, parts | 1200 | 2000 |
| Bill, expense | 6xxx by category | 2000, or cash if paid on the spot |
| Pay supplier | 2000 | 1010 |
| Card / DuitNow settles | 1010 + 6060 | 1020 |
| Drawings | 3100 | Cash or bank |
| Stock count difference | 5020 or 1200 | 1200 or 4900 |
| Month-end depreciation | 6070 | 1590 |

- **Receivables:** a due date on each invoice (default 7 days; 30 for fleet). Ageing buckets 0–30 / 31–60 / 61–90 / 90+. Customer statement PDF on WhatsApp.
- **Payables:** a due date on each bill; "Bills to pay this week"; a PV for every payment out.
- **Bank reconciliation:** import the Demo Bank CSV or PDF (the agent reads PDFs). Match by amount + date, then by reference. Unmatched lines are offered as an expense or drawings for approval. The month locks when the balances match.
- **Month-end close:** five ticks: bank reconciled, stock count posted, depreciation run, bills entered, agent review cleared. Reopening needs the owner's PIN and writes to the audit log.

## 4. Reports
All reports come from the ledger, offer Month / Quarter / Year / custom range with a comparison period, and export to PDF and CSV: P&L (parts and labour margins shown separately), balance sheet (a red banner if it doesn't balance), cash flow (direct method), trial balance, general ledger, aged receivables (with a WhatsApp button), aged payables (with Pay), sales by job type, fixed assets and capital allowances, the SST tracker and the e-Invoice tracker.

**Year-end pack (Form B):** a ZIP containing the P&L and balance sheet; TB and GL as CSV; a tax computation draft (net profit + book depreciation + private/disallowed − capital allowances = adjusted income); the CA schedule; drawings and partly-private expenses; and supporting PDFs named by voucher. The tax agent files on MyTax; the DMS does not file.

**Accountant login:** read-only, can export and post adjusting JVs (marked "Accountant"), and cannot change workshop documents.

## 5. AI agent: Merc Lab Assistant
It reads, matches, chases and drafts; the owner decides. It can read anything. To change anything it puts a card in **Approvals**, and only the owner's tap runs it, through the normal API and checks. The v1 "AI reads it" features (slips, bills, supplier receipts) become jobs this agent does.

**Where the owner meets it:** an Ask bar (Ctrl K on PC; a top-bar button on phone) · the Approvals tray with a count on the bell · a morning brief at 08:00 (dashboard, optionally WhatsApp) · a "Suggest" button on the estimate form and fault case · the WhatsApp inbox (forwarded slips and bills land as drafts).

| Area | Job | Owner approves |
| --- | --- | --- |
| Money in | Read slip → find invoice → draft receipt | Record payment + OR |
| Money in | Chase overdue at 7 / 14 / 30 days in Malay or English | Each message or a batch |
| Money out | Read bills, code to account and job, spot duplicates | Bill / expense saved |
| Books | Match bank lines; propose entries for unmatched lines | Each entry |
| Books | Month-end check: unbalanced, missing bills, odd margins, private spend | Fixes |
| Workshop | Draft estimate from complaint + car + past fault cases | Save estimate |
| Workshop | Likely causes and tests from the owner's fault-case history | Advice only |
| Stock | Watch levels and orders; draft POs | Send PO |
| CRM | Draft service reminders, win-back messages and follow-ups | Each message or a batch |
| Compliance | Thresholds; Form B, CP500 and payroll dates | Reminders only |
| Ask | Answer questions with links to the records used | Read only |

**Guardrails:**
1. Tools are read-only plus `propose`, which writes to `agent_proposals`. Approval runs the real action through the normal API.
2. No money moves: no payments, refunds or bank-detail changes, and no edits to locked documents or closed months.
3. Every answer and card links its sources and shows its confidence.
4. The audit log records every proposal, approval, edit and rejection, with reasoning.
5. Customer personal data is sent to the model only when a task needs it, is never used for training, and the provider's terms must suit PDPA 2010.
6. A monthly cost cap in Settings (e.g. RM150): the agent pauses and says so when it is reached.
7. A kill switch: the DMS works fully by hand without the agent.

## 6. Screens, data and API

| Route | Screen | New / changed | Reference |
| --- | --- | --- | --- |
| `#/assistant` | Approvals tray, Ask, morning brief | New | V2-Assistant, V2-Assistant-Phone |
| `#/books` | Cash position, AR, AP, month close | New | V2-Books |
| `#/bank` | Bank reconciliation | New | V2-Bank |
| `#/ledger` | Chart of accounts, GL, JVs | New | List pattern |
| `#/payables` | Supplier bills + PVs (replaces bills on `#/suppliers`) | Changed | List pattern |
| `#/assets` | Fixed assets + capital allowances | New | List pattern |
| `#/tax` | SST / e-Invoice trackers + switches, tax calendar, year-end pack | New | V2-Tax |
| `#/pnl`, `#/balance` | Read from the ledger; add Cash flow and TB tabs | Changed | Report pattern |
| `#/money`, `#/expenses`, `#/creditnotes` | Each record shows its journal; DN and RN join CN | Changed | v1 screens |
| `#/settings` | + Tax and compliance, Accounts mapping, Assistant, Users | Changed | Form pattern |

**Tables:** `accounts` (code, name, group, type, is_active, is_system) · `journals` (id, no, date, period, source_type, source_id, memo, posted_by owner/agent-approved/accountant, locked) · `journal_lines` (journal_id, account_code, debit, credit, job_id?, customer_id?, supplier_id?) · `periods` (yyyy_mm, status, closed_at, closed_by, checklist) · `bank_lines` (account, date, description, amount, ref, matched_type, matched_id, status) · `supplier_bills` (supplier_id, bill_no, date, due_date, lines, total, balance, file) · `payments_out` (pv_no, date, method, supplier_id?, amount, allocations) · `notes` (type CN/DN/RN, no, invoice_id, reason, lines, total) · `fixed_assets` (name, class, cost, date_in_use, qe_cap, ia_rate, aa_rate, book_life, disposed_at) · `tax_settings` (sst_registered, sst_no, sst_rate, einvoice_on, tin, msic, brn) · `einvoices` (doc_type, doc_id, lhdn_uuid, validation_status, qr_url, submitted_at) · `agent_proposals` (id, kind, title, reasoning, sources[], payload, status waiting/approved/edited/rejected, decided_by, decided_at, cost_rm) · `audit_log` (at, actor, action, entity, before, after).

**API:** `GET /api/ledger?account=&from=&to=` · `GET /api/reports/{pnl|balance|cashflow|trial|aged-ar|aged-ap}` · `POST /api/journals` (owner/accountant) · `POST /api/bank/import` · `POST /api/bank/match` · `POST /api/periods/{yyyy-mm}/close|reopen` (PIN) · `GET /api/agent/proposals` · `POST /api/agent/proposals/{id}/approve|edit|reject` · `POST /api/agent/ask` (streams, with sources) · `POST /api/einvoice/submit` (sandbox, hidden until switched on). Existing endpoints keep their shape. Posting runs server-side in the same DB transaction as the source document.

## 7. Build order
1. Ledger core + opening balances · 2. Auto-posting + back-post 2026 and reconcile to the old P&L · 3. Payables · 4. Bank reconciliation + month close · 5. Reports from the ledger · 6. Fixed assets + year-end pack · 7. Compliance (MyInvois on the sandbox, off) · 8. Assistant: Ask + brief · 9. Assistant: Approvals, slips/bills, chasing, bank matching · 10. Assistant: estimates, diagnostics, POs.
