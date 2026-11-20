/* THE MERC LAB · login page behaviour (vanilla). Wire `signIn(password)` to the existing login API call. */
(function () {
  "use strict";
  var root = document.getElementById("login");
  if (!root) return;
  var form = document.getElementById("login-form"), pw = document.getElementById("login-pw"),
      eye = document.getElementById("login-eye"), msg = document.getElementById("login-msg"), go = document.getElementById("login-go");

  // Entrance: on the splash hand-over (zoom = the card focuses out of the blue bloom), or at once if there is no splash.
  function enter(delay) { root.style.setProperty("--li-delay", delay + "s"); root.classList.add("is-in"); setTimeout(function () { pw.focus({ preventScroll: true }); }, (delay + .8) * 1000); }
  if (!document.getElementById("ml-splash")) enter(0);
  document.addEventListener("mlsplash:handoff", function (e) { enter(e.detail && e.detail.zoom ? 0.42 : 0); }, { once: true });

  function say(text, kind) { msg.textContent = text; msg.className = "login__msg" + (kind ? " " + kind : ""); pw.classList.toggle("is-error", kind === "err"); }
  eye.addEventListener("click", function () {
    var show = pw.type === "password"; pw.type = show ? "text" : "password";
    eye.setAttribute("aria-pressed", String(show)); eye.setAttribute("aria-label", show ? "Hide password" : "Show password"); pw.focus();
  });
  pw.addEventListener("keyup", function (e) {
    if (msg.classList.contains("err")) return;
    say(e.getModifierState && e.getModifierState("CapsLock") ? "Caps Lock is on" : "", e.getModifierState && e.getModifierState("CapsLock") ? "caps" : "");
  });
  pw.addEventListener("input", function () { if (msg.classList.contains("err")) say("", ""); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!pw.value) { say("Enter your password.", "err"); shake(); pw.focus(); return; }
    go.classList.add("is-loading"); go.innerHTML = '<span class="spin" aria-hidden="true"></span>Signing in';
    Promise.resolve(window.signIn ? window.signIn(pw.value) : true).then(function (ok) {
      if (ok) return;                     // the app routes to #/dashboard
      throw new Error("bad");
    }).catch(function () {
      go.classList.remove("is-loading"); go.textContent = "Sign in";
      say("That password is not right. Try again.", "err"); shake(); pw.select();
    });
  });
  function shake() { form.classList.remove("shake"); void form.offsetWidth; form.classList.add("shake"); }
})();
