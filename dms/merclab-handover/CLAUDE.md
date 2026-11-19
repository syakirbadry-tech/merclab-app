# Merc Lab DMS: rules for Claude Code

Copy this file to the root of the DMS repo (merge it if a `CLAUDE.md` already exists). The full plan is in `HANDOVER.md`.

## The app
- Private web app for The Merc Lab, an independent Mercedes-Benz workshop in Selangor, Malaysia (TNS Legacy, an Enterprise).
- Plain HTML + CSS + vanilla JavaScript, with no framework and no build step. All screens are template strings in `app.js`; the car drawing is in `condition.js`.
- It is installed as a PWA and used mostly on a phone, also on a Windows PC and a workshop tablet.

## Hard rules
1. **No frameworks, no build step, no Tailwind, no React.** Edit `index.html`, `style.css` / `merclab.css`, `app.js` and `condition.js` directly.
2. **Routes and the server API stay the same** in phases 1–6. Every existing screen, button and field must still exist after a change.
3. **Do not change the A4 documents** (estimate, invoice, official receipt, printed or PDF). You may restyle only the web wrapper on `/d/:token`.
4. **Money:** `RM 1,234.50` (space after RM, two decimals, comma thousands). **Dates:** `dd/mm/yyyy`. **Time zone:** Asia/Kuala_Lumpur. **Plates:** `VDM 2841`.
5. **Accessibility:** tap targets of at least 44px (52px for phone primary actions), 16px text in inputs, WCAG AA contrast, full keyboard use, a visible focus ring, and real `<button>` / `<a href>` elements (never a clickable `<div>`).
6. **PWA:** respect `env(safe-area-inset-*)` at the top bar, the bottom bar and the action bar.
7. **Fonts are self-hosted:** Inter (UI), Source Serif 4 (titles), Arimo (logo, plates, A4). Do not load Google Fonts in production.
8. **The WhatsApp button stays WhatsApp green** with its glyph.
9. **Finance (phase 7+):** nothing financial is ever deleted. Issued documents are locked and fixed only with CN / DN / RN notes. Every journal balances. Number series have no gaps.
10. **AI agent (phase 8+):** it drafts and the owner approves. The agent's tools are read-only plus `propose`. It never moves money.

## Design source of truth
- `design/merclab.css`: tokens and components. Use the tokens and never hard-code a colour.
- `design/screens/*.html` and `design/screens/png/*.png`: the approved look for each screen, at desktop 1440 and phone 390.
- `design/icons.js`: the `ICONS` object (same names as today).
- `docs/CLASS-MAP.md`: today's class → the new class.
- `docs/SCREEN-MAP.md`: route → reference file.
- `docs/SPEC-v2-finance-ai.md`: finance and AI agent spec.

## How to work
- Work one phase at a time (see `HANDOVER.md`) on a branch per phase, and keep each commit small.
- After changing a screen, take screenshots at 390×844 and 1440×900 with Playwright and compare them with `design/screens/png/`.
- Check both themes: `<html data-theme="light">` and `data-theme="dark"`.
- Use demo data only in screenshots and tests. Never commit real customer data or secrets.
- If a design reference and a hard rule disagree, the hard rule wins. Ask the owner when unsure.
