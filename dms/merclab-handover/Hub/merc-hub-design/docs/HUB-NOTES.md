# Merc HUB: design notes for Claude Code

Scope: the Merc HUB screens only (route `#/hub`). The shell, tokens and other screens are unchanged.
Screens: `design/screens/HUB-*.html` (open them in a browser; they link `../merclab.css`, `../feedback.css`, `../hub.css`).
PNGs: `design/png/HUB-*-light.png` and `-dark.png`. Dark is the same page with `data-theme="dark"` on `.ml`.
All data is demo data. MBM entries are written as "Demo tip…" with "Demo thread 0001" / "Demo bulletin 0002".

## v1.1 review pass (ui-ux-pro-max + Apple HIG + Workshop Glass)

The last block in `hub.css` ("v1.1 REVIEW PASS") overrides earlier rules. Summary:

| Finding | Source | Change |
| --- | --- | --- |
| Glass behind long reading text | HIG `materials.md` / `liquid-glass.md`: "Don't use Liquid Glass in the content layer" | Glass stays on bars, search, sheets. Cards, steps, remedies use `--content` (88% opaque light, 92% dark) |
| Green meant both "our case" and "verified" | HIG `color.md`: one colour, one meaning | Our case = brand blue, MBM = amber, General = grey. Green only for Verified and good readings |
| 11px uppercase labels | ui-ux-pro-max Typography; HIG `typography.md` minimums | Labels raised to 12px, meta to 13px |
| Black section discs too harsh on the pale theme | Workshop Glass low-contrast rule | Soft blue discs (`--select` + `--accent`) |
| Phone home had 4 filter rows before any result | HIG `searching.md` scope bars; ui-ux progressive disclosure | Phone: search + one scope bar (All / Ours / MBM / General) + a **Filters** button that opens a sheet (Verified only, model, car, sort). Codes moved into search suggestions |
| No help before typing | HIG `searching.md`: "Provide suggestions"; ui-ux Search › Autocomplete | Focused search shows recent searches, most seen codes, and "Pick a car" (`.suggest`) |
| No point of view | Apple Craft lens | **Signature: the diagnostic trace.** Tests are one line with numbered nodes; the deciding step is the lit node (blue, soft ping that stops with reduced motion); the line ends in the remedy it points to (`.trace-end`) |
| Two prominent buttons on the phone read view | HIG `buttons.md`: one or two prominent per view | Edit is the one prominent action; Open job is secondary |
| "Read it" | HIG `writing.md`: label says what happens | "Read with AI" |

## Decisions that change behaviour

1. **Tapping a result opens a read view, not the edit modal.** Edit is a button inside the read view (desktop: right rail; phone: bottom action bar). This replaces `faultDialog` as the first thing you see.
2. **Search comes first.** One big search box (56px) searches title, codes, symptom, model, engine, tags. `/` focuses it on desktop.
3. **Results are grouped by rank**, best first: Our verified fixes → MBM forum → Our cases not verified yet → General info. Inside a group, best text match first; "Newest" is the other sort.
4. **Source marks** on every card: Our case = blue wrench tile, MBM forum = amber book tile, General info = grey info tile. Same 24px 1.8-stroke style as `icons.js`. New icons to add to `icons.js`: `book`, `eye`, `star`, `thumb`, `thumbd`, `test`, `paste`, `pdf` (paths are in `hub_build.py` / the screens' inline SVG).
5. **Result card** (desktop): title, status (Verified / Not verified yet / Private), chassis chips + engine + codes, then a one-line Symptom → Cause → Fix summary, then footer (source · topic no, date, files, helpful count). Phone: two-line row only (title max 2 lines + chips); everything else is in the read view.
6. **"For a car…" filter**: pick a car from Vehicles (or type a VIN prefix) to filter by its model series + engine, like XENTRY's vehicle definition.
7. **Read view order** (follows the owner's way of working): Topic header → Validity → 1 Symptom → 2 Tests → 3 Cause → 4 Remedy → 5 Details → 6 Files. A sticky section bar jumps between them (instead of XENTRY's tabs, so everything stays on one scroll at the car).
   - **Topic header**: topic no. (e.g. MLH-0012), version, updated date, "reason for" this version.
   - **Validity**: model series, engine, chassis no. seen on, mileage at repair, function group, date, hours spent, linked job.
   - **Tests** are numbered step cards: what to check · Spec · Measured · Then → (e.g. "Too low → Remedy A"). The step that decides the remedy has a blue left edge. Measured values out of spec use `.val.bad` (red), good ones `.val.good`.
   - **Remedy** can have options A, B…, each with a "when" line, numbered steps, and either a **parts table** (part, part no., qty) or "No parts needed." / "Depends on the case".
   - Values like `13.5 V`, `25 min`, `4.5 bar`, `10 Nm`, `85,000 km` are auto-highlighted as `.val` chips when rendering text (regex on number + unit).
8. **Did this help?** thumbs up/down with counts (owner sees counts now; members will vote later). **Star** = favourite. **Print** prints the read view.
9. **View as: Owner / Client** toggle in the read view. Client view hides hours spent and linked job, masks the chassis no. to the first 11 characters (`WDD2050421F••••••`; the last 6 are never sent to clients), and rounds mileage to 5,000 km. MBM entries never appear in client view.
10. **MBM is private**: lock badge on cards, a private notice on the entry header, never exported, never shown to members, "Who can see it" locked to "Only me".
11. **Edit form** is grouped: Source and topic · Validity (car) · Diagnosis (symptom, codes chip input, test step builder, cause) · Remedy and parts · Details · Files · Status and sharing. Text areas grow. Saving bumps the version and asks for "reason for this version".
12. **Add references** is a 3-step wizard on one screen: choose source (MBM default) + upload or paste → AI reads it (beat loader from `feedback.css`, live progress list, Cancel, 10–60 s) → review list (tick box, editable title, source/model/codes/page summary, expand to all fields, Select all / None, keep original file) → Save N → success with "See the N entries".
13. **States**: first run, no match (search fewer words / ask the Assistant / new entry for this), AI failed (file kept; try again / paste text / save file as one entry), file too big (10 MB limit).
14. **Ask the HUB** (pattern for `#/assistant`): the answer cites entries as numbered chips with their source mark; MBM citations only appear for the owner.

## Known shell issue (not changed, outside scope)
The logo image stays black in dark mode (`.brand img`). Suggest `[data-theme="dark"] .brand img { filter: invert(1) hue-rotate(180deg); }` or a light logo file.

## New classes in hub.css (tokens only)

| Class | Use |
| --- | --- |
| `--src-our / --src-mbm / --src-gen` | Source colours (mapped to ok / info / neutral tokens) |
| `.src.our/.mbm/.gen` (`.sm`) | Source icon tile on cards and lists |
| `.src-label` | Source name with icon, inline |
| `.verified` `.unverified` `.private` | Status tags |
| `.chassis` | Dark chassis chip (W205) |
| `.code` | Blue fault-code chip |
| `.meta` `.dot` | Meta row with dot separators |
| `.hub-search` `.hint-k` `.clear` | 56px glass search with icon, `/` hint, clear button |
| `.hub-filters` `.seg-src` (`.on`, `.n`, `.sw`) | Filter block, segmented source filter with counts and colour dot |
| `.toggle` `.sw2` (`.on`) | Switch button ("Verified only", "Verified") |
| `.result-count` | "6 references · best match first" |
| `.hits` `.hit` (`.t .tags .meta .sum .k .arr .foot`) | Result cards (desktop) |
| `.hit.row2` `.chev` | Compact two-line phone row |
| `.stat4` | 4 counters in the side rail |
| `.codes-seen` `.cbar` `.n` | Most seen fault codes with bars |
| `.strip` | Horizontal scroller (phone chips) |
| `.hub-layout` / `.entry-layout` | Page grids: results + 320px rail / entry + 300px rail |
| `.entry` `.entry-h .ttl` | Read view column and serif title |
| `.validity` (`.k .v`) `.vin .mask` | Validity grid, masked chassis no. |
| `.sec` `.sec-h .no .aside` | Numbered section headings |
| `.prose` | Long text (lists, h4) |
| `.val` (`.bad` `.good`) | Value chips: spec, measured, torque |
| `.steps` `.step` (`.do .vals .then .key`) | Test step cards |
| `.remedy` `.remedy-h .lt2(.alt) .when .body` | Remedy option cards |
| `.parts` (`.pn .q`) `.no-parts` | Parts table / "no parts" line |
| `.files` `.file` `.th(.img) .badge .nm .sz` | File thumbnails |
| `.client-bar` `.hidden-field` | Client-preview banner, hidden values |
| `.fgroup` `.fgroup-h` `.fgrid` | Edit form groups |
| `.chip-input` | Chips + text input (models, codes) |
| `.sb-row` `.sb-head` `.x` | Test step builder rows |
| `.textarea.grow` `.fmt-hint` `.later` | Growing text area, format hints, "Later" tag |
| `.wiz .s(.on .done) .ln` | 3-step wizard header |
| `.src-pick` `.src-opt(.on)` | Source picker cards |
| `.reading` (`li.done .now .dotc`) | AI reading progress list |
| `.rev` (`.cb.on .tt .all .off`) | Review rows with tick box and expandable fields |
| `.ask-a` `.cite` `sup.ref` | Assistant answer with source citations |
| `--content` `--content-2` | Opaque reading surfaces (content layer) |
| `.trace-end` | End node of the test trace, pointing to the remedy |
| `.suggest` (`.h .r .codes`) | Search suggestions panel |
| `.scope` | Phone scope bar for source |
| `.filter-btn` `.badge-n` `.active-filters` | Phone Filters button, count, active filter chips |
| `.hub-sheet` `.grab` `.sh-h` `.wrapchips` `.sheet-scrim` | Phone filter sheet |
