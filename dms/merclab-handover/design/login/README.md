# Login page (v1.1)

Password only, as today. Glass card, blue Sign in button, and the logo's heartbeat line continuing across the background.

| File | What |
| --- | --- |
| `login.html` | Markup. Render it as the first screen when signed out |
| `login.css` | Styles. Needs `merclab.css`, and loads after it |
| `login.js` | Show/hide password, Caps Lock warning, errors with a small shake, a loading state on Sign in, and the entrance animation |
| `login-phone.png`, `login-phone-error.png`, `login-desktop.png` | Reference screenshots |

## Wiring
- Define `window.signIn = (password) => fetch(...existing login API...).then(r => r.ok)`. On `true` the app routes to `#/dashboard`; on `false` the page shows "That password is not right. Try again." and selects the field.
- The entrance waits for the splash hand-over (`mlsplash:handoff`). Without a splash it plays at once, and as a safety net the form appears after 3 s anyway.
- Accessibility: a real `<label>`, `autocomplete="current-password"`, 16px input, 44px eye button with `aria-pressed`, error and Caps Lock messages in a live region, focus moves to the field after the entrance. Reduced motion means a 0.2 s fade only.
- Messages: empty → "Enter your password."; wrong → "That password is not right. Try again."; Caps Lock → "Caps Lock is on".
