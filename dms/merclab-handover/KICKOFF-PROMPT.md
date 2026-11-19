# First message to paste into Claude Code

Open Claude Code in the DMS repo, copy this folder into the repo as `merclab-handover/`, then paste:

---

Read `merclab-handover/CLAUDE.md` and `merclab-handover/HANDOVER.md` first, then copy `CLAUDE.md` to the repo root (merge with any existing one).

We are re-skinning the Merc Lab DMS to the approved "Workshop Glass" design. Start with **Phase 1 only** (tokens, fonts, icons):
1. Add `merclab-handover/design/merclab.css` to the app (after `style.css` for now) and self-host Inter, Source Serif 4 and Arimo under `/fonts/`.
2. Replace the `ICONS` object in `app.js` with `merclab-handover/design/icons.js`, keeping our current `chat`, `trash` and `book` drawings.
3. Wrap the app root in `class="ml"` and add `data-theme="light"` on `<html>`.

Do not change routes, the server API, or the A4 estimate/invoice/receipt. Plain HTML/CSS/vanilla JS only.

When done, take Playwright screenshots of `#/dashboard`, `#/jobs` and one job page at 390×844 and 1440×900, compare them with `merclab-handover/design/screens/png/`, list anything that looks different, and stop for my review before Phase 2.
