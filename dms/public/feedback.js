/* THE MERC LAB · loading and saved feedback (vanilla, no dependencies).
   Use it for every loading moment and every successful save:

     const s = MLFeedback.busy(button, "Saving…");          // button shows the heartbeat
     try { await api.save(); s.done("Saved", { toast: "Estimate saved · EST-2026-00006", flash: rowEl }); }
     catch (e) { s.fail("Could not save. Check the connection and try again."); }

     const l = MLFeedback.loader({ label: "AI is reading the slip", progress: true });
     l.set(0.4); … l.done();                                 // screen loader (appears only after 300 ms)

     MLFeedback.route.start(); … MLFeedback.route.done();    // thin bar on screen change
     MLFeedback.toast("Payment recorded · OR-2026-00009", { action: { label: "Send receipt", href: "#/money/receipt/9" } });
     MLFeedback.celebrate("Payment recorded", "RM 556.00 · INV-2026-00038");  // big moments only
     MLFeedback.skeleton(listEl, 5);                         // placeholder rows while a list loads
*/
(function () {
  "use strict";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var BEAT_D = "M0 8H14L16 6L18 11L20 3L22 13L24 8H40";
  var DELAY = 300;   // never show a loader for work that finishes faster than this (no flicker)
  var MIN = 600;     // once shown, keep it at least this long (no flash)

  function beat(size) {
    return '<svg class="beat' + (size ? " " + size : "") + '" viewBox="0 0 40 16" aria-hidden="true">' +
      '<path class="bl" d="' + BEAT_D + '"></path><path class="bp" pathLength="1" d="' + BEAT_D + '"></path></svg>';
  }
  var CHECK = '<svg class="chk" viewBox="0 0 20 20" aria-hidden="true"><path pathLength="1" d="M4 10.5l4 4L16 6"></path></svg>';
  function haptic() { try { navigator.vibrate && navigator.vibrate(12); } catch (e) {} }   // Android only; iOS ignores it

  // ---------- live region so screen readers hear "Saving…", "Saved" ----------
  var live = document.createElement("div");
  live.setAttribute("role", "status"); live.setAttribute("aria-live", "polite"); live.className = "sr";
  live.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)";
  document.addEventListener("DOMContentLoaded", function () { document.body.appendChild(live); });
  function announce(t) { live.textContent = ""; setTimeout(function () { live.textContent = t; }, 30); }

  // ---------- button: saving → saved ----------
  function busy(btn, label) {
    var html = btn.innerHTML, w = btn.offsetWidth, shownAt = 0, t;
    btn.disabled = true; btn.setAttribute("aria-busy", "true"); btn.style.minWidth = w + "px";
    t = setTimeout(function () {                          // only if the save takes longer than DELAY
      shownAt = Date.now(); btn.classList.add("is-saving");
      btn.innerHTML = '<span class="fb-label">' + beat("sm") + (label || "Saving…") + "</span>";
      announce(label || "Saving");
    }, DELAY);
    function after(fn) { clearTimeout(t); var wait = shownAt ? Math.max(0, MIN - (Date.now() - shownAt)) : 0; setTimeout(fn, wait); }
    function restore() { btn.classList.remove("is-saving", "is-saved"); btn.innerHTML = html; btn.disabled = false; btn.removeAttribute("aria-busy"); btn.style.minWidth = ""; }
    return {
      done: function (text, opt) {
        opt = opt || {};
        after(function () {
          btn.classList.remove("is-saving"); btn.classList.add("is-saved");
          btn.innerHTML = '<span class="fb-label">' + CHECK + (text || "Saved") + "</span>";
          haptic(); announce(opt.toast || text || "Saved");
          if (opt.flash) flash(opt.flash);
          if (opt.toast) toast(opt.toast, { action: opt.action });
          setTimeout(restore, reduce ? 900 : 1400);
        });
      },
      fail: function (msg) { after(function () { restore(); toast(msg || "Could not save. Try again.", { kind: "err" }); }); },
      cancel: function () { after(restore); }   // DMS: put the button back without a message
    };
  }

  // ---------- saved item glows once ----------
  function flash(el) { el.classList.remove("flash-ok"); void el.offsetWidth; el.classList.add("flash-ok"); setTimeout(function () { el.classList.remove("flash-ok"); }, 1500); }

  // ---------- toast ----------
  var stack;
  function toast(text, opt) {
    opt = opt || {};
    if (!stack) { stack = document.createElement("div"); stack.className = "ml-toasts"; document.body.appendChild(stack); }
    var kind = opt.kind || "ok", el = document.createElement("div");
    el.className = "ml-toast " + kind; el.setAttribute("role", kind === "err" ? "alert" : "status");
    var icon = kind === "ok" ? CHECK : kind === "err" ? '<svg class="chk" viewBox="0 0 20 20" aria-hidden="true"><path pathLength="1" d="M10 5v6M10 14.5v.5"></path></svg>' : beat("sm");
    el.innerHTML = '<span class="ti">' + icon + "</span><span>" + text + "</span>" +
      (opt.action ? '<a class="ta" href="' + opt.action.href + '">' + opt.action.label + "</a>" : "");
    stack.appendChild(el);
    var ms = opt.duration || (opt.action ? 5000 : 3200);
    setTimeout(function () { el.classList.add("is-out"); setTimeout(function () { el.remove(); }, 260); }, ms);
    return el;
  }

  // ---------- screen loader ----------
  function loader(opt) {
    opt = opt || {};
    var el = document.createElement("div"), shownAt = 0, t;
    el.className = "ml-loader"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
    var visual = opt.progress
      ? '<svg class="prog-beat" viewBox="0 0 180 26" aria-hidden="true"><path class="bl" d="M0 14H70L76 10L82 19L88 3L94 24L100 14H180"></path><path class="bf" pathLength="1" d="M0 14H70L76 10L82 19L88 3L94 24L100 14H180"></path></svg>'
      : beat("lg");
    el.innerHTML = '<div class="ml-loader__card">' + visual + '<div class="ml-loader__label">' + (opt.label || "Loading") + "</div>" +
      (opt.progress ? '<div class="ml-loader__sub">0%</div>' : "") + "</div>";
    document.body.appendChild(el);
    t = setTimeout(function () { shownAt = Date.now(); el.classList.add("is-on"); announce(opt.label || "Loading"); }, opt.delay == null ? DELAY : opt.delay);
    return {
      set: function (p) { p = Math.max(0, Math.min(1, p)); el.style.setProperty("--p", p); var s = el.querySelector(".ml-loader__sub"); if (s) s.textContent = Math.round(p * 100) + "%"; },
      done: function () {
        clearTimeout(t);
        var wait = shownAt ? Math.max(0, MIN - (Date.now() - shownAt)) : 0;
        setTimeout(function () { el.classList.remove("is-on"); setTimeout(function () { el.remove(); }, 220); }, wait);
      }
    };
  }

  // ---------- route bar ----------
  var bar, barCount = 0;
  var route = {
    start: function () { if (!bar) { bar = document.createElement("div"); bar.className = "ml-routebar"; bar.setAttribute("aria-hidden", "true"); document.body.appendChild(bar); } barCount++; bar.classList.add("is-on"); },
    done: function () { barCount = Math.max(0, barCount - 1); if (!barCount && bar) bar.classList.remove("is-on"); }
  };

  // ---------- skeleton rows ----------
  function skeleton(container, rows) {
    var h = ""; for (var i = 0; i < (rows || 5); i++) {
      h += '<div class="sk-row" aria-hidden="true"><div style="display:grid;gap:8px"><div style="display:flex;gap:8px;align-items:center"><span class="sk plate"></span><span class="sk line w60"></span></div><span class="sk line w40"></span></div><div style="display:grid;gap:8px;justify-items:end"><span class="sk line" style="width:72px"></span><span class="sk pill"></span></div></div>';
    }
    container.setAttribute("aria-busy", "true"); container.innerHTML = h;
    return { done: function () { container.removeAttribute("aria-busy"); } };
  }

  // ---------- big moment: the heartbeat resolves into a check ----------
  function celebrate(label, sub) {
    var el = document.createElement("div");
    el.className = "ml-done"; el.setAttribute("role", "status");
    el.innerHTML = '<div class="ml-done__card"><svg viewBox="0 0 120 72" aria-hidden="true">' +
      '<path class="dl" pathLength="1" d="M4 40H34L40 34L46 46L52 18L58 56L64 40H116"></path>' +
      '<circle class="dr" cx="60" cy="37" r="28"></circle>' +
      '<path class="dc" pathLength="1" d="M44 38l11 11 21-23"></path></svg>' +
      '<div class="ml-done__label">' + (label || "Saved") + "</div>" + (sub ? '<div class="ml-done__sub">' + sub + "</div>" : "") + "</div>";
    document.body.appendChild(el); haptic(); announce((label || "Saved") + (sub ? ", " + sub : ""));
    setTimeout(function () { el.remove(); }, 1800);
  }

  window.MLFeedback = { beat: beat, busy: busy, flash: flash, toast: toast, loader: loader, route: route, skeleton: skeleton, celebrate: celebrate };
})();
