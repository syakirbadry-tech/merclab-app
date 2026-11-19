# Merc Lab DMS: handover to Claude Code

**From:** design (Claude, Cowork) · **To:** Claude Code in the DMS repo · **Date:** 20/11/2026 · **Approver:** the Chairman (owner)

## 1. What you are building

1. **v1.1 re-skin (phases 1–6):** the approved "Workshop Glass" design applied to all 33 existing screens. This adds no features and changes no routes or API. It covers frosted surfaces, XENTRY blue, softer contrast, phone-first layouts, and fixes for the eight pain points in the original brief.
2. **v2 finance and AI (phases 7–10):** Malaysian-standard double-entry books and the Merc Lab Assistant, an AI agent that drafts and leaves approval to the owner. The full spec is in `docs/SPEC-v2-finance-ai.md`.

Read `CLAUDE.md` first. Its hard rules apply to every phase.

## 2. What is in this folder

| Path | What it is |
| --- | --- |
| `CLAUDE.md` | Standing rules. Copy it to the repo root |
| `design/merclab.css` | The full design system: light and dark tokens, every component, the glass layer and fallbacks. It replaces `style.css` |
| `design/icons.js` | A drop-in `ICONS` object with the same names as today, plus new icons and the WhatsApp glyph |
| `design/logo.svg` | The approved "THE MERC LAB" lab-label logo |
| `design/screens/*.html` | 30 static reference pages. Open them in a browser; they use `../merclab.css` |
| `design/screens/png/*.png` | The same pages as full-page screenshots: `D-` desktop at 1440, `P-` phone at 390, `V2-` finance and AI |
| `docs/SCREEN-MAP.md` | Route → reference file → notes for all 33 screens |
| `docs/CLASS-MAP.md` | Today's `style.css` classes → new classes, with what to change in `app.js` |
| `docs/SPEC-v2-finance-ai.md` | Finance and AI agent spec: rules, chart of accounts, posting, data model, API |

The live design canvas (clickable prototype) is <https://claude.ai/artifact/MdfH2dFXTpKbfSXdX682RR>. It needs the owner's login, so treat the files here as the source.

## 3. Design decisions already approved

- **Look:** frosted glass cards over a soft grey-blue ground, with low contrast. The desktop top bar is charcoal glass. Selected items are pale blue with a blue marker line.
- **Primary action:** one blue glassy button per screen (`.btn`). Secondary buttons are white glass (`.btn.alt`). WhatsApp keeps its green (`.btn.wa`).
- **Status system:** five pairs used everywhere: `ok`, `soon`, `now`, `info` and neutral. See `.pill`, `.stag` and `.notice`.
- **Plates:** black with white letters (`.plate`).
- **Type:** Source Serif 4 for page and card titles, Inter for everything else, tabular numbers for money.
- **Desktop sidebar:** groups are `<details class="nav-g">`. Only the group holding the current route is open, so the sidebar fits a 900px-high screen.
- **Phone:** the bottom bar is Home · Jobs · **+ Create** · Money · More. Cars moves into More and global search. Job pages swap the bottom bar for an action bar: More · WhatsApp · one primary action that follows the stage.
- **Tables:** on phone, every table becomes a `.list` of two-line rows (`.li`).

## 4. Phases

Each phase ships on its own, so finish one, then screenshot, review and merge before starting the next.

### Phase 1: tokens, fonts, icons
- [ ] Add `merclab.css` after `style.css`, then move the remaining rules over and delete `style.css` at the end of phase 6.
- [ ] Self-host Inter (variable woff2), Source Serif 4 (400/500) and Arimo 700 under `/fonts/`, with `@font-face` at the top of `merclab.css`.
- [ ] Replace `ICONS` in `app.js` with `design/icons.js` (keep the current `chat`, `trash` and `book` drawings).
- [ ] Wrap the app root in `class="ml"` and set `data-theme` on `<html>` (light by default; dark is optional, from Settings).
- **Done when:** every screen renders with the new colours and fonts, and nothing is broken at 390 or 1440.

### Phase 2: app shell
- [ ] Sidebar: the logo `<img src="/brand/merc-lab-logo.svg">` replaces the blue hexagon. Use `.nav-g` details groups, the active item `.on`, and count badges.
- [ ] Top bar: charcoal glass, breadcrumbs, search with a `Ctrl K` hint (bind Ctrl/⌘ K to focus search), and the avatar.
- [ ] Phone: the `.bar` bottom bar with the `.fab` Create button opening a `.sheet` (New estimate, Record payment, Payment slip, New booking).
- [ ] Phone job pages: `.actbar` in place of `.bar`.
- **Done when:** the sidebar fits 1440×900 with no inner scroll, and every phone screen has 44px+ tap targets and safe-area padding.

### Phase 3: one status system
- [ ] One `statusPill(doc)` helper and one `stageTag(stage)` helper, used by every list, card and tile.
- [ ] Replace `.warn` / `.bad` with `.soon` / `.now` (the old names still work as aliases).
- **Done when:** a status looks identical on the dashboard, Jobs, the job page and Money.

### Phase 4: tables → phone lists
- [ ] Jobs, Customers, Money in, Owed, Vehicles, Parts, Expenses, Suppliers, Credit notes. Render both `.tbl-wrap.to-list` and `.list.from-tbl` (CSS switches at 860px).
- **Done when:** no name wraps onto three lines at 390px.

### Phase 5: the priority screens
- [ ] **Dashboard:** desktop regroup, and the phone order: tiles (swipe) → Needs action → board tabs with a Move button → today's bookings → folded "Everything else".
- [ ] **Job page:** `.stagebar` with Back and Move to …, the `.money3` total / paid / balance, and the right rail (summary, approval, customer and car). On phone, the action bar.
- [ ] **New estimate:** totals in the right rail on desktop (no sticky bar over content). On phone, a slim grand-total + Save bar, and the "Add a line" sheet (Part / Labour / Sundry / Sublet, stock search, packages).
- [ ] **Body condition:** the kind picker first, then tap the car. On phone, one view at a time with a `.seg` switcher. The `condition.js` geometry and tap logic do not change.
- [ ] **Money in / Owed:** the slip dropzone; on Owed, ageing buckets plus Remind (WhatsApp) and Payment on every row.
- **Done when:** each screen matches its PNG in `design/screens/png/` at 390 and 1440, in light and dark.

### Phase 6: the rest, by pattern
- [ ] **List pattern** (`D-List-Customers`): Vehicles, Packages, Fault cases, Expenses, Credit notes, Parts, Suppliers, Part orders, Follow-ups, Reminders, Inbox.
- [ ] **Detail pattern** (`D-Detail-Customer`): Customer, Vehicle details and history, Package edit, Receipt.
- [ ] **Form pattern** (`D-Form-Settings`): Settings, Stock count, Make invoice (same as New estimate).
- [ ] **Report pattern** (`D-Report-PnL`): P&L, Balance sheet.
- [ ] **Customer pages `/d/:token`:** restyle only the wrapper and the Approve box. Do not touch the A4 sheet.
- [ ] Delete `style.css`.
- **Done when:** all 33 screens use only `merclab.css`, and a sweep of screenshots across every route passes review.

### Phase 7: books (server + UI). See SPEC sections "Finance design" and "Reports"
- [ ] Ledger core: `accounts`, `journals`, `journal_lines`, `periods`, `audit_log`, and opening balances as the first journal.
- [ ] Auto-posting for invoice, payment, deposit, credit note, supplier bill, expense, drawings, stock count and depreciation. Each posting happens in the same DB transaction as its source document.
- [ ] Back-post 2026 so far, and check it against today's P&L before switching reports over.
- [ ] Payables (bills, PV), bank reconciliation, month-end close, and reports (P&L, balance sheet, cash flow, trial balance, ageing).
- [ ] Fixed assets with capital allowances (IA/AA, small value assets, the vehicle cap) and the year-end pack for Form B.
- [ ] Tax & compliance screen: SST and e-Invoice trackers and switches (both off), and the tax calendar. Build MyInvois against the LHDN sandbox only.
- **Screens:** `V2-Books`, `V2-Bank`, `V2-Tax`, plus the list and report patterns for Ledger, Payables and Assets.
- **Done when:** the trial balance balances, the balance sheet balances, and P&L from the ledger matches the old P&L for 2026 to the sen.

### Phase 8–10: Merc Lab Assistant. See SPEC section "AI agent"
- [ ] **8:** Ask (read-only, with source links) and the 08:00 morning brief.
- [ ] **9:** the Approvals tray (`agent_proposals`): move today's slip and bill reading into it, then add overdue chasing (Malay/English) and bank-line matching.
- [ ] **10:** estimate drafting from fault cases, diagnostic suggestions, and purchase orders.
- **Guardrails, all required:** read-only tools plus `propose`; approval runs through the normal API; no money moves; sources on every card; full audit log; a monthly RM cap; a kill switch; PDPA-compliant data handling.
- **Screens:** `V2-Assistant`, `V2-Assistant-Phone`.

## 5. How to check your work
- **Playwright screenshots** of each changed route at 390×844 (deviceScaleFactor 2) and 1440×900, in light and dark. Compare them with `design/screens/png/`.
- **Contrast:** text at 4.5:1 or better on its real background (the glass sits on a light ground, so test the rendered page).
- **Glass:** browsers without `backdrop-filter`, and users who ask for less transparency, fall back to solid surfaces (already in `merclab.css`). Check that low-end Android stays smooth, and reduce blur on `.bar` if needed.
- **Keyboard:** Tab through the dashboard and the job page, and check the focus ring is always visible.
- **Money formatting:** every amount is `RM x,xxx.xx`.

## 6. Open questions (ask the owner; do not guess)
- Is TNS Legacy a sole proprietorship or a partnership (Form B or Form P)?
- Which bank accounts are there, and does the card terminal settle to Demo Bank?
- Default payment terms: 7 days for walk-in customers, 30 for fleet?
- Should the morning brief go to WhatsApp as well?
- AI monthly cap (RM150 suggested).
- Who else logs in (mechanics, the accountant)?
- The tax agent should confirm the chart of accounts, the MyInvois threshold, capital allowance classes and opening balances.
