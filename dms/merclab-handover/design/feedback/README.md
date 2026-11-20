# Loading and saved feedback

One language with the start animation: the heartbeat line with a blue pulse means **working**; the line resolving into a green check means **saved**. Use it for every loading and saving moment in the app.

Files: `feedback.css` (load after `merclab.css`), `feedback.js` (exposes `window.MLFeedback`), `feedback-reference.png` (every state), `merc-lab-loading-saved.mp4` (preview). On the design canvas: "Loading and saved" (reference) and a working phone screen.

## Which one to use

| Moment | Use | Example |
| --- | --- | --- |
| Done in under 0.3 s | nothing | toggling a chip |
| A button action (save, send, record) | `MLFeedback.busy(btn)` → `.done()` / `.fail()` | Save estimate, Record payment, Send on WhatsApp |
| A list or card loading | `MLFeedback.skeleton(listEl, rows)` + `.is-loading` on the card | Jobs, Customers, Money in |
| Changing screen | `MLFeedback.route.start()` / `.done()` in the hash router | any `#/route` change |
| Blocking work over 1 s | `MLFeedback.loader({ label })` | Loading the P&L |
| Measurable work | `MLFeedback.loader({ label, progress: true })` + `.set(0…1)` | uploading a slip, AI reading a bill, bank import |
| A milestone | `MLFeedback.celebrate(label, sub)` + a toast | payment recorded, invoice made, month closed |
| Anything saved | the toast says what and gives the next step | "Estimate saved · EST-2026-00006 · Send" |

## Code

```js
// Save button
const s = MLFeedback.busy(saveBtn, "Saving…");
api.saveEstimate(data)
  .then(est => s.done("Saved", { toast: `<b>Estimate saved</b> · ${est.no}`, action: { label: "Send", href: `#/jobs/${est.id}` }, flash: rowEl }))
  .catch(() => s.fail("Could not save. Check the connection and try again."));

// List
const sk = MLFeedback.skeleton(listEl, 6); listCard.classList.add("is-loading");
const jobs = await api.jobs(); listCard.classList.remove("is-loading"); sk.done(); render(jobs);

// Router
window.addEventListener("hashchange", () => { MLFeedback.route.start(); render(location.hash).finally(MLFeedback.route.done); });

// Slip upload with AI
const l = MLFeedback.loader({ label: "AI is reading the slip", progress: true });
upload(file, p => l.set(p)).then(result => { l.done(); MLFeedback.celebrate("Payment recorded", `RM ${rm(result.amount)} · ${result.invoiceNo}`); });
```

## Rules
- **Timing:** loaders appear only after 0.3 s and, once shown, stay at least 0.6 s (built into `busy` and `loader`). "Saved" holds 1.4 s. Toasts last 3.2 s, or 5 s with an action. The big moment lasts 1.75 s.
- **One confirmation per save:** the button turns green and a toast appears. Milestones add the beat → check. Never stack modals.
- **Errors:** keep what was typed, say what went wrong and how to fix it, offer Retry (red toast).
- **Buttons keep their width** while busy (no layout jump), and are disabled so nothing is saved twice.
- **Accessibility:** a live region announces "Saving…" and then the toast text, `aria-busy` is set on busy buttons and loading lists, and Android phones buzz lightly on success.
- **Reduce Motion:** the heartbeat fades in and out instead of sweeping, checks appear without drawing, and toasts fade.
- **Replaces:** the old `.spin` spinner and `#toast`. Remove them as screens move to `MLFeedback`.
