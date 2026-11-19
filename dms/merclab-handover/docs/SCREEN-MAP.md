# Screen map

Route → design reference (in `design/screens/`, `.html` and `png/`) → notes. ★ = priority screen with its own reference.

| # | Screen | Route | Reference | Notes |
| --- | --- | --- | --- | --- |
| 00 | Login | — | — | Form pattern; glass card centred on the ground, logo on top |
| 01 ★ | Dashboard | `#/dashboard` | D-Dashboard, P-Dashboard | Phone order: tiles → Needs action → board tabs → bookings → folded sections |
| 02 | Inbox | `#/inbox` | D-List-Customers (list), V2-Assistant (cards) | In v2 the slips and bills become Approvals cards |
| 03 ★ | Jobs | `#/jobs` | D-Jobs, P-Jobs | Chips with counts; Stage + Status columns; phone list rows |
| 04 ★ | Job (estimate) | `#/jobs/:id` | D-Job-Estimate, P-Job-Estimate | Stage bar + Move; check-in, inspection, parts, fault and photos in one card; phone action bar |
| 05 ★ | Job (invoice) | `#/jobs/:id` | D-Job-Invoice, P-Job-Invoice | Balance big in Now red with a paid bar; payments received; credit note |
| 06 ★ | New estimate | `#/jobs/new` | D-New-Estimate, P-New-Estimate, P-Add-Line | Totals in the right rail (desktop) / slim bar (phone); Add-a-line sheet |
| 07 | Make invoice | `#/jobs/:id/invoice` | D-New-Estimate | Same form, lines copied |
| 08 | Inspection | `#/jobs/:id/inspection` | Components (.seg.st) | OK / Soon / Now segmented in status colours |
| 09 | Bookings | `#/bookings` | D-List-Customers | Week grid on desktop; one day per card on phone |
| 10 | Vehicles | `#/vehicles` | D-List-Customers | List pattern; plate first |
| 11 | Vehicle details | `#/vehicles/:plate` | D-Body-Condition (header + tabs) | Detail pattern |
| 12 | Vehicle history | `#/vehicles/:plate/history` | D-Detail-Customer | Detail pattern |
| 13 ★ | Body condition | `#/vehicles/:plate/condition` | D-Body-Condition, P-Body-Condition | Kind picker → tap car; phone shows one view at a time; condition.js unchanged |
| 14 | Packages | `#/packages` | D-List-Customers | List pattern |
| 15 | Package edit | `#/packages/:id` | D-New-Estimate (lines) | Form pattern |
| 16 | Fault cases | `#/faults` | D-List-Customers | List pattern; search |
| 17 | Customers | `#/customers` | D-List-Customers, P-Patterns | List pattern |
| 18 | Customer | `#/customers/:id` | D-Detail-Customer | Detail pattern; follow-up card on top right |
| 19 | Follow-ups | `#/followups` | P-Dashboard (Needs action rows) | WhatsApp / Call / Log on each row |
| 20 | Service reminders | `#/reminders` | D-List-Customers | WhatsApp reminder per row |
| 21 ★ | Money in | `#/money` | D-Money-In, P-Money-In | Slip dropzone; receipts list |
| 22 ★ | Owed to you | `#/money?tab=owed` | D-Owed, P-Owed | Ageing bar; Remind + Payment per row |
| 23 | Receipt | `#/money/receipt/:id` | D-Detail-Customer | Detail wrapper; the A4 OR itself is unchanged |
| 24 | Expenses | `#/expenses` | D-List-Customers | List pattern + dropzone |
| 25 | Credit notes | `#/creditnotes` | D-List-Customers | v2 adds DN and RN |
| 26 | Profit & Loss | `#/pnl` | D-Report-PnL, P-Patterns | Report pattern |
| 27 | Balance sheet | `#/balance` | D-Report-PnL | Report pattern |
| 28 | Parts & stock | `#/parts` | D-List-Customers | List pattern + supplier receipt dropzone |
| 29 | Stock count | `#/parts/count` | D-Form-Settings | Form pattern |
| 30 | Suppliers | `#/suppliers` | D-List-Customers | Bills move to #/payables in v2 |
| 31 | Part orders | `#/orders` | D-Jobs (stage tags) | Ordered → Arrived → Fitted as stage tags |
| 32 | Settings | `#/settings` | D-Form-Settings | Form pattern |
| 33 | Phone menu | — | Components (sidebar, sheet) | The More tab opens the full menu as a sheet |
| 42–44 | Customer estimate / invoice / receipt | `/d/:token` | — | Restyle the wrapper and Approve box only; the A4 sheet is fixed |
| v2 | Assistant | `#/assistant` | V2-Assistant, V2-Assistant-Phone | Approvals tray, Ask, morning brief |
| v2 | Books | `#/books` | V2-Books | Cash position, journals, month close |
| v2 | Bank | `#/bank` | V2-Bank | Statement lines, match status, post the difference |
| v2 | Tax & compliance | `#/tax` | V2-Tax | SST / e-Invoice trackers and switches, tax calendar, capital allowances |
| v2 | Ledger, Payables, Fixed assets | `#/ledger, #/payables, #/assets` | D-List-Customers, D-Report-PnL | List and report patterns |

Also: `Main` (foundations) and `Components` (every component with its class names) in `design/screens/`.
