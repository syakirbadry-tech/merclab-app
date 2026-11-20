/* THE MERC LAB · app start animation controller (vanilla, no dependencies).
   Load it with <script src="splash.js"></script> right after the splash markup.
   When the first screen and its data are ready, app.js calls:  window.MLSplash.ready();  */
(function () {
  "use strict";
  var el = document.getElementById("ml-splash");
  if (!el) return;

  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var seen = false;
  try { seen = sessionStorage.getItem("mlSplashSeen") === "1"; } catch (e) {}

  // Only on a cold start. Switching back to the app, or reloading in the same session, skips it.
  if (seen) { el.remove(); window.MLSplash = { ready: function () {}, skip: function () {} };
    document.dispatchEvent(new CustomEvent("mlsplash:handoff", { detail: { zoom: false } })); return; }

  var INTRO = reduce ? 250 : 1900;   // the full animation (with the heartbeat), then hand over
  var MAX = 6000;                    // never hold the app longer than this
  var ready = false, introDone = false, ended = false;

  // Hand-over. zoom = true dives into the scan dot (normal end); false = quick fade (tap to skip).
  function end(zoom) {
    if (ended) return;
    ended = true;
    el.classList.remove("is-waiting");
    var dive = zoom === true && !reduce;
    el.classList.add(dive ? "is-zoom" : "is-done");
    document.dispatchEvent(new CustomEvent("mlsplash:handoff", { detail: { zoom: dive } }));
    el.setAttribute("aria-hidden", "true");
    try { sessionStorage.setItem("mlSplashSeen", "1"); } catch (e) {}
    document.removeEventListener("keydown", onKey);
    setTimeout(function () { el.remove(); }, dive ? 820 : (reduce ? 220 : 320));
  }
  function maybeEnd() { if (ready && introDone) end(true); }
  function onKey(e) { if (e.key === "Enter" || e.key === " " || e.key === "Escape") end(false); }

  setTimeout(function () {
    introDone = true;
    if (!ready) el.classList.add("is-waiting");   // data still loading: the scan dot keeps sweeping
    maybeEnd();
  }, INTRO);
  setTimeout(function () { end(true); }, MAX);
  el.addEventListener("click", function () { end(false); });   // tap anywhere to skip
  document.addEventListener("keydown", onKey);    // Enter, Space or Esc to skip on PC

  window.MLSplash = { ready: function () { ready = true; maybeEnd(); }, skip: function () { end(false); } };
})();
