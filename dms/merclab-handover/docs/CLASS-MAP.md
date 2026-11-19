# Class map: today → v1.1

`design/merclab.css` keeps today's class names where it can. Rows marked Changed, Replaced or Renamed need a template edit in `app.js`.

| Today (`style.css`) | Status | What to do in `app.js` |
| --- | --- | --- |
| `:root tokens` | Replaced | Same names where they existed (--bg, --surface, --ink, --muted, --line, --ok, --wa…). --brand is now XENTRY blue. New: --select, --select-line, --bar, --bg-grad, --glass-*, --font-title. --warn/--bad map to --soon/--now. |
| `body / html` | Changed | Wrap the app in `class="ml"`; set `data-theme` on `<html>`. The ground is `var(--bg-grad)` on `.app` / `.phone`. |
| `.side .nav .nav-h` | Changed | Glass sidebar. Replace each `.nav-h` and its links with `<details class="nav-g" [open]><summary>Group …</summary>…links…</details>`. Open only the group holding the current route; closed groups show `.dot-n` alerts ("2 due"). |
| `.nav a.on` | Restyled | Pale blue `--select` with a 3px `--select-line` marker; the count badge is blue. |
| `.brand` | Changed | `<img src="/brand/merc-lab-logo.svg">`. Remove the blue hexagon. |
| `.topbar .crumbs .gsearch .me` | Restyled | Charcoal glass bar. Add `<span class="kbd">Ctrl K</span>` inside `.gsearch`; bind Ctrl/⌘ K. |
| `.bottom` | Renamed → .bar | 5 slots: Home, Jobs, `.fab` Create, Money, More. |
| — | New: .actbar | Phone job pages: replaces `.bar`. More · WhatsApp · one primary action. |
| — | New: .sheet .grab | Bottom sheet (Create, Add a line, phone modals). |
| `.btn` | Restyled | Blue glassy primary. `.alt` is white glass, `.wa` WhatsApp green glass, `.ghost`, `.danger`. Heights: 44 (base), 36 (`.sm`, desktop toolbars only), 52 (`.lg`, phone primary). |
| `input, select, textarea` | Add classes | Add `.input` / `.select` / `.textarea` (element selectors are not styled). `.input-w` for an icon or unit; `.ai` for AI-filled; `.is-error`. |
| `.pill .ok .warn .bad .info` | Extended | Canonical `.ok .soon .now .info` + neutral default; `.plain` hides the dot; `.line`, `.ink`. Old `.warn` / `.bad` kept as aliases. |
| — | New: .stag | Stage tags (square): '' / `.in` / `.wait` / `.ready` / `.done`. |
| `.plate` | Restyled | Black plate, white Arimo letters; `.lg` in headers. |
| `.chip .chips` | Restyled | Glass chips; `.on` = pale blue + blue border; `.chips.scroll` on phone. |
| `.tabs .seg` | Restyled | Selected = pale blue + blue underline. `.seg a` works like `.seg button` (for tabs that are links). |
| `.tile` | Extended | `.hero` (soft blue glass, the number to read first), `.now`, `.ok`. Wrap "RM" in `<small>`. `.go` chevron for clickable tiles. |
| `.card .card-h` | Restyled | Frosted glass. Card titles `.h3` use the serif title font. `.card.flush` for tables; `.card.quiet` for empty states. |
| `.stepper` | Replaced → .stagebar | Same buttons + `data-stage`; inner markup `<i></i><span>Label</span>`; classes `.stg.done/.cur/.end`. Add a `.stage-next` row with Back / Move to … |
| `.board .lane .jc` | Changed | `h3` → `h4` with a `.stag`. Add `.ft` with `<button class="mv">` for one-tap move. |
| `.tbl` | Restyled + pair | Also render `.list.from-tbl` with `.li` rows; CSS shows one or the other at 860px. `tr.on` = selected row. |
| — | New: .todo .sect | Phone dashboard: Needs action rows (`.todo` + `.ai.now/.soon/.ok/.info`) and folded sections (`.sect`). |
| `.jgroup .sum .kv` | Restyled | `.jline` rows with a `.lt` line-type tag (`.lab`, `.sub`); `.cn` request badge (C1). New `.money3` (Total · Paid · Balance) and `.prog` paid bar. |
| `.totbar` | Changed | Desktop: totals move into the right rail (`.split`). Phone: `.actbar` with the grand total + Save; the body keeps its own bottom padding. |
| `.modal .box` | Renamed | `.modal-box` with `.mh` / `.mb` / `.mf` inside `.scrim`. Under 860px use `.sheet`. |
| `#toast` | Restyled | `.toast` with a `.ti` icon and an optional action link. |
| `.notice .dropzone .empty` | Restyled | `.notice.ok/.soon/.now`; `.dropzone` with a `.di` icon box; `.empty` with an `.ei` icon circle. |
| `.kinds .carview .mnum` | Restyled | Body condition kind picker and figures; mark colours `.k-scratch … .k-fixed`. |
| `.tbl.fin .bars` | Restyled | Report tables with section, total and grand rows; `.bars` for the 12-month in/out chart. |

## Snippets

```js
// Sidebar group: only the active group is open
const navGroup = (g, items, route) => {
  const open = items.some(i => route.startsWith(i.href));
  return `<details class="nav-g" ${open ? "open" : ""}>
    <summary>${g.name}${!open && g.alert ? `<span class="dot-n">${g.alert}</span>` : ""}${icon("cd", "s chev")}</summary>
    ${items.map(i => `<a href="${i.href}" class="${route.startsWith(i.href) ? "on" : ""}">${icon(i.icon)}<span>${i.label}</span>${i.count ? `<span class="count">${i.count}</span>` : ""}</a>`).join("")}
  </details>`;
};

// Stage bar (replaces .stepper; keep the data-stage click handler)
const stageBar = (j) => { const si = STAGES.indexOf(j.stage); return `
<div class="stagebar" role="group" aria-label="Job stage">
  ${STAGES.map((s, i) => `<button type="button" data-stage="${s}" aria-pressed="${i === si}"
     class="stg ${i < si ? "done" : i === si ? "cur" : ""} ${s === "Collected" ? "end" : ""}"><i></i><span>${s}</span></button>`).join("")}
</div>
<div class="stage-next">
  <span class="muted grow">Stage: <b>${j.stage}</b></span>
  ${si > 0 ? `<button class="btn alt sm" data-stage="${STAGES[si - 1]}">Back a stage</button>` : ""}
  ${si < 4 ? `<button class="btn sm" data-stage="${STAGES[si + 1]}">Move to ${STAGES[si + 1]}</button>` : ""}
</div>`; };

// One row, two renderings (table on PC, list on phone)
const jobLi = (j) => `<a class="li" href="#/jobs/${j.id}">
  <span class="a">${plate(j.plate)}<b>${esc(j.customer)}</b></span>
  <span class="r ${j.overdue ? "amt now" : ""}">${rm(j.total)}</span>
  <span class="b">${j.no} · ${j.stage}</span>
  <span class="rb">${statusPill(j)}</span></a>`;
```
