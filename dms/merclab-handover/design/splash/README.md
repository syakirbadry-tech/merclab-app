# App start animation: "Heartbeat scan" (v1.1, with the zoom into the login)

The Merc Lab logo builds itself in about 1.7 seconds when the app starts. The heartbeat line in the logo draws across with a blue diagnostic scan dot leading it, like a scope trace on a test. If the dashboard data is still loading after that, the dot keeps sweeping the line as the loader. The animation then lifts slightly and fades into the dashboard.

Previews: `merc-lab-start-login-phone.mp4`, `merc-lab-start-login-desktop.mp4`. A playable version is on the design canvas, on the "App start + login" page.

**v1.1 adds:** an engineering grid that draws in, one soft blue scan line, a heartbeat "thump" with two pulse rings at the spike, the dot resting and breathing at the end of the line, and a **zoom into the scan dot** that blooms into the login page (`design/login/`).

## Timeline

| Time | What moves | Easing |
| --- | --- | --- |
| 0.15 s | "THE" fades up 6px | ease-out (arrive) |
| 0.20 s | "MERC" rises out of its own baseline (masked) | ease-out |
| 0.45 s | the black LAB block opens left → right | ease-out |
| 0.70–1.35 s | the heartbeat line draws, led by the blue scan dot; a soft blue glow breathes on the spike | steady sweep |
| 0.75 s | "LAB" appears inside the block | ease-out |
| 1.15 s | the tagline settles in | ease-out |
| 0.05 s | the engineering grid draws in; a soft blue scan line passes once (0.1–1.35 s) | ease-out / steady |
| 1.03 s | heartbeat: the logo thumps (scale 1.035) and two pulse rings ripple out from the spike | quick in, soft out |
| 1.4 s | the dot rests at the end of the line and breathes | — |
| 1.9 s | hand-over: if the data is ready, zoom; if not, the dot sweeps every 1.3 s until it is | — |
| zoom (0.7 s) | the camera dives into the scan dot (scale 18, blur 6px), a blue bloom fills the screen and the splash fades at 0.48 s | ease-in (leaving) |
| +0.42 s | the login card focuses out of the bloom (blur 10px → 0, rises 18px), then the logo, title, text and form step in 70 ms apart | ease-out |
| skip (tap) | quick fade, 0.28 s, no zoom | ease-in |

## Rules it follows

- **Apple launch screen:** the iOS launch image is plain glass-grey with no logo (Apple HIG › Launching › "Downplay the launch experience", "Don't advertise"). The brand animation runs only after launch completes, which is where Apple allows a splash.
- **Brief and skippable:** about 1.7 s. A tap, Enter, Space or Esc skips it, and it never holds the app longer than 6 s.
- **Only on a cold start.** Switching back to the app, or reloading in the same session, skips it (`sessionStorage`).
- **Reduced motion:** with "Reduce Motion" on, the finished logo fades in for 0.2 s, with no movement, no dot and no glow.
- **Screen readers:** it announces "The Merc Lab is starting" and is hidden once it ends. The logo has a full text label.
- **Light and dark:** the label inverts in dark mode, and the glow uses the dark-mode blue.
- **Performance:** it animates only transform, opacity, stroke-dashoffset and offset-distance, with no layout changes.

## How to add it

1. Copy `splash.css` and `splash.js` next to `merclab.css`. Arimo 700 must be self-hosted (the logo text uses it).
2. In `index.html`, paste `splash.html` as the **first child of `<body>`**, then load the script:
   ```html
   <link rel="stylesheet" href="/merclab.css">
   <link rel="stylesheet" href="/splash.css">
   …
   <body>
     <!-- splash.html here -->
     <script src="/splash.js"></script>
     …the app…
   ```
3. Render the first screen **under** the splash: the login page (`design/login/login.html` + `login.css` + `login.js`) when signed out, or the dashboard when signed in. `login.js` listens for the `mlsplash:handoff` event and starts its entrance. When the first screen and its data are ready, call:
   ```js
   window.MLSplash && window.MLSplash.ready();
   ```
4. `manifest.json`: set `"background_color": "#e9edf2"` and `"theme_color": "#e9edf2"`.
5. For the iOS installed app, add the plain launch images from `ios-launch/` (no logo, matching the first frame):
   ```html
   <meta name="apple-mobile-web-app-capable" content="yes">
   <link rel="apple-touch-startup-image" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (prefers-color-scheme: light)" href="/ios-launch/launch-iphone-15-16-light.png">
   <link rel="apple-touch-startup-image" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (prefers-color-scheme: dark)" href="/ios-launch/launch-iphone-15-16-dark.png">
   <!-- repeat for: 430×932@3 (plus-promax), 390×844@3 (12-14), 375×812@3 (x-11pro), 414×896@2 (xr-11), 375×667@2 (se) -->
   ```

## Testing checklist
- [ ] Cold start on iPhone (installed app): plain grey, then the logo builds, then the dashboard. No white flash.
- [ ] Switch away and back: no animation.
- [ ] Turn on Settings › Accessibility › Motion › Reduce Motion: a still logo and a short fade.
- [ ] Throttle the network to Slow 3G: the dot keeps sweeping until data is ready, and it never exceeds 6 s.
- [ ] Tap during the animation: it skips straight to the dashboard.
- [ ] Dark mode: the label inverts and the glow stays subtle.
