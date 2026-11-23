// Merc Lab DMS — web app (phone and PC). Plain JavaScript, no build step.
// Pages are picked by the address hash: #/dashboard, #/jobs/…, #/vehicles/…
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const view = $("#view");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rm = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rm0 = (n) => "RM " + Math.round(Number(n || 0)).toLocaleString("en-MY");
  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const dmy = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
  const km = (n) => (n ? Number(n).toLocaleString("en-MY") + " km" : "");
  const plateKey = (p) => String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  const todayKL = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const docNo = (j) => j.invoiceNo || j.estimateNo;
  const jobDate = (j) => j.invoiceDate || j.date || "";
  const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5);
  function ago(iso) {
    if (!iso) return "";
    const d = daysBetween(iso, todayKL());
    if (d <= 0) return d === 0 ? "today" : `in ${-d} day${d === -1 ? "" : "s"}`;
    if (d === 1) return "yesterday";
    if (d < 45) return `${d} days ago`;
    if (d < 548) return `${Math.round(d / 30)} months ago`;
    return `${Math.round(d / 365)} years ago`;
  }

  const state = { settings: null, parts: [], jobs: [], payments: [], customers: [], vehicles: [], packages: [], faults: [], interactions: [], bookings: [], expenses: [], creditnotes: [], suppliers: [], purchases: [], partorders: [], inbox: [], whatsapp: null, route: "" };

  // ---------- icons v1.1 (from the design handover; chat, trash and book kept) ----------
  const ICONS = {
    // ---- names already used in app.js (same name, new drawing) ----
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect>',
    jobs: '<path d="M15 4.5a4.5 4.5 0 0 0-5.6 5.6L3.8 15.7a2.1 2.1 0 0 0 3 3l5.6-5.6A4.5 4.5 0 0 0 18 7.5l-2.6 2.6-2.5-.5-.5-2.5z"></path>',
    car: '<path d="M5 17h14M3.5 17v-4l2-5a2 2 0 0 1 1.9-1.3h9.2A2 2 0 0 1 18.5 8l2 5v4"></path><path d="M3.5 13h17"></path><circle cx="7.5" cy="17.5" r="1.8"></circle><circle cx="16.5" cy="17.5" r="1.8"></circle>',
    users: '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0"></path><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5a6.5 6.5 0 0 1 3.5 5.5"></path>',
    parts: '<circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"></path>',
    money: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H19v4"></path><path d="M3 7.5V18a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5.5A2.5 2.5 0 0 1 3 7.5"></path><circle cx="16.5" cy="14.5" r="1.2"></circle>',
    settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"></path><circle cx="16" cy="6" r="2"></circle><circle cx="10" cy="12" r="2"></circle><circle cx="18" cy="18" r="2"></circle>',
    search: '<circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-4.2-4.2"></path>',
    plus: '<path d="M12 5v14M5 12h14"></path>',
    upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"></path>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1"></path><circle cx="12" cy="13.5" r="3.5"></circle>',
    back: '<path d="m15 5-7 7 7 7"></path>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"></path>',
    logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"></path>',
    file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"></path><path d="M14 3v5h5M9 13h6M9 17h4"></path>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"></path>',
    x: '<path d="M6 6l12 12M18 6 6 18"></path>',
    alert: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5v5M12 15.8v.2"></path>',
    calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2"></rect><path d="M3 9.5h18M8 3v3M16 3v3"></path>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"></path><path d="m13.5 6.5 4 4"></path>',
    open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"></path>',
    receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"></path><path d="M9 8h6M9 12h6"></path>',
    gauge: '<path d="M3.5 17a9 9 0 1 1 17 0"></path><path d="m12 13 4-4"></path><circle cx="12" cy="13.5" r="1.2"></circle>',
    shield: '<path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z"></path>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"></path><path d="m3 8 9 5 9-5M12 13v8"></path>',
    print: '<path d="M7 9V3h10v6M7 17H4v-7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v7h-3"></path><path d="M7 14h10v7H7z"></path>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"></rect><path d="M9 3h6v3H9zM9 11h6M9 15h4"></path>',
    phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2"></path>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"></path><path d="M10 20.5a2 2 0 0 0 4 0"></path>',
    more: '<circle cx="5" cy="12" r="1.3"></circle><circle cx="12" cy="12" r="1.3"></circle><circle cx="19" cy="12" r="1.3"></circle>',
    // ---- kept from the earlier set: chat, trash, book ----
    chat: '<path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 7h6"/>',
    // ---- new in v1.1 / v2 ----
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"></path>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"></path><path d="M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"></path>',
    fault: '<path d="M12 3 2.5 19.5h19z"></path><path d="M12 10v4M12 17v.5"></path>',
    user: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',
    cn: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"></path><path d="M14 3v5h5M9 14h6"></path>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"></path>',
    scale: '<path d="M12 3v18M5 21h14M4 7h16"></path><path d="m4 7-2.5 6a3 3 0 0 0 5 0zM20 7l-2.5 6a3 3 0 0 0 5 0z"></path>',
    count: '<rect x="5" y="4" width="14" height="17" rx="2"></rect><path d="M9 3h6v3H9zM9 12l2 2 4-4"></path>',
    truck: '<path d="M2 6h12v10H2zM14 9h4l3 3.5V16h-7"></path><circle cx="6" cy="17.5" r="1.8"></circle><circle cx="17" cy="17.5" r="1.8"></circle>',
    order: '<path d="M3 3h2l2.5 12h11L21 7H6.2"></path><circle cx="9" cy="19.5" r="1.5"></circle><circle cx="18" cy="19.5" r="1.5"></circle>',
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"></path>',
    cr: '<path d="m9 5 7 7-7 7"></path>',
    cd: '<path d="m5 9 7 7 7-7"></path>',
    ar: '<path d="M4 12h15M13 6l6 6-6 6"></path>',
    clock: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"></path>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="2"></rect><path d="M2.5 10h19M6 15h4"></path>',
    info: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 11v5M12 8v.2"></path>',
    send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"></path>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"></path>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5M12 7.5V12l3 2"></path>',
    tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"></path><circle cx="8" cy="8" r="1.5"></circle>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"></path><path d="m3 13 9 5 9-5"></path>',
    trend: '<path d="m3 17 6-6 4 4 8-8"></path><path d="M15 7h6v6"></path>',
    swipe: '<path d="M8 7 4 11l4 4M16 7l4 4-4 4"></path>',
    photo: '<rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="9" cy="10" r="2"></circle><path d="m21 16-5-5-9 9"></path>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"></rect><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"></path>',
    sun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>',
  };
  const WA_GLYPH = '<svg class="wa-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.47-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35m-5.42 7.4h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89a11.82 11.82 0 0 0-3.48-8.41Z"></path></svg>';
  const icon = (n, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ""}</svg>`;

  const AV = [["#e0ecff", "#1d4ed8"], ["#e6f6ec", "#126b3e"], ["#fdf3e2", "#8a5200"], ["#f3e8ff", "#7e22ce"], ["#ffe4e6", "#be123c"], ["#e0f2fe", "#0369a1"]];
  function avatar(name) {
    const words = String(name || "?").trim().split(/\s+/);
    const ini = ((words[0] || "?")[0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
    let h = 0;
    for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const [bg, ink] = AV[h % AV.length];
    return `<span class="avatar" style="background:${bg};color:${ink}" aria-hidden="true">${esc(ini)}</span>`;
  }

  const STAGES = ["Booked", "In workshop", "Waiting parts", "Ready", "Collected"];
  // One status system (merclab.css): ok · soon · now · info · neutral. Used by every list, card and tile.
  const STAGE_CLS = { Booked: "", "In workshop": "info", "Waiting parts": "soon", Ready: "ok", Collected: "" };
  const STATUS_CLS = { Draft: "", Sent: "info", Approved: "ok", "Part paid": "soon", Paid: "ok", Unpaid: "now", Overdue: "now", Cancelled: "now" };
  const pill = (txt, cls = "") => `<span class="pill ${({ warn: "soon", bad: "now" })[cls] || cls}">${esc(txt)}</span>`;
  const statusPill = (s) => pill(s, STATUS_CLS[s] ?? "");
  const stagePill = (s) => (s ? pill(s, STAGE_CLS[s] ?? "") : "");
  const plateTag = (p) => (p ? `<span class="plate">${esc(p)}</span>` : "");
  const shortCar = (c) => String(c || "").replace(/^Mercedes-Benz\s+/i, "");
  const kindOf = (j) => (j.invoiceNo ? "Invoice" : "Estimate");
  const isWorkshop = (j) => j.status !== "Cancelled" && ["In workshop", "Waiting parts", "Ready"].includes(j.stage);

  // ---------- helpers ----------

  function toast(msg, kind) {
    if (window.MLFeedback) {
      const k = kind || (/\b(saved|recorded|added|sent|created|done|copied|updated|approved|cancelled)\b/i.test(msg) ? "ok" : "info");
      return window.MLFeedback.toast(esc(msg), { kind: k });
    }
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 3400);
  }

  async function api(path, { method = "GET", body, form } = {}) {
    const opts = { method, credentials: "same-origin", headers: {} };
    if (form) opts.body = form;
    else if (body !== undefined) {
      opts.body = JSON.stringify(body);
      opts.headers["Content-Type"] = "application/json";
    }
    const res = await fetch("/api" + path, opts);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== "/login") {
      showLogin();
      throw new Error("Please log in.");
    }
    if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
    return data;
  }

  function busy(btn, on, label) {
    if (!btn) return;
    if (window.MLFeedback && on) { btn._fb = window.MLFeedback.busy(btn, label || "Please wait…"); return; }
    if (btn._fb && !on) { btn._fb.cancel(); btn._fb = null; return; }
    if (on) {
      btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spin"></span>${esc(label || "Please wait…")}`;
    } else {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.label || btn.innerHTML;
    }
  }

  // Same rule as the server: cost + markup %, rounded UP to the step.
  function sellPrice(cost, markup, step) {
    cost = Number(cost);
    if (!(cost >= 0)) return "";
    const raw = r2(cost * (1 + (Number(markup) || 0) / 100));
    step = Number(step);
    return step > 0 ? r2(Math.ceil(raw / step - 1e-9) * step) : raw;
  }

  function waPhone(p) {
    let d = String(p || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.startsWith("0")) d = "6" + d;
    else if (!d.startsWith("60") && d.length <= 10) d = "60" + d;
    return d.length >= 10 && d.length <= 13 ? d : "";
  }
  const docLink = (token) => `${location.origin}/d/${token}`;
  const waLink = (phone, text) => `https://wa.me/${waPhone(phone)}?text=${encodeURIComponent(text)}`;
  const brandName = () => "The Merc Lab";

  const LS = {
    get(k) { try { return JSON.parse(localStorage.getItem("mldms." + k) || "null"); } catch { return null; } },
    set(k, v) { try { localStorage.setItem("mldms." + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  // Phone photos are big: shrink to 1600px JPEG before upload.
  async function shrink(file, max = 1600) {
    if (!file || !file.type.startsWith("image/") || file.size < 400 * 1024) return file;
    try {
      const img = await createImageBitmap(file);
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
      return blob ? new File([blob], (file.name || "photo").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
    } catch {
      return file;
    }
  }

  function modal(title, html, { wide } = {}) {
    const el = document.createElement("div");
    el.className = "modal";
    el.innerHTML = `<div class="box" role="dialog" aria-modal="true" aria-label="${esc(title)}" ${wide ? 'style="width:min(760px,100%)"' : ""}>
      <div class="mh"><h2>${esc(title)}</h2><button type="button" class="x" aria-label="Close">${icon("x")}</button></div>
      <div class="mb">${html}</div></div>`;
    const prev = document.activeElement;
    const close = () => {
      el.remove();
      document.removeEventListener("keydown", onKey);
      if (prev && prev.focus) prev.focus();
    };
    const onKey = (e) => e.key === "Escape" && close();
    el.addEventListener("click", (e) => (e.target === el || e.target.closest(".mh .x")) && close());
    document.addEventListener("keydown", onKey);
    document.body.appendChild(el);
    const first = el.querySelector(".mb input:not([type=hidden]):not([type=file]), .mb select, .mb textarea, .mb button");
    if (first && window.matchMedia("(min-width: 861px)").matches) first.focus();
    return { el, close, $: (s) => el.querySelector(s) };
  }

  // Documents need the car's mileage. Any link marked data-doc="<job id>"
  // (open PDF, send by WhatsApp, reminder, receipt) asks for it first when the
  // job has none (e.g. old imported invoices), saves it, then offers the link
  // again: a fresh tap, so phones do not block the new tab.
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-doc]");
    if (!a || !a.dataset.doc) return;
    const j = state.jobs.find((x) => x.id === a.dataset.doc);
    if (!j || Number(j.mileageKm) > 0) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const m = modal("Mileage needed", `<form id="kmF" novalidate><p style="margin-top:0">Every estimate, invoice and receipt shows the car's mileage. <b>${esc(docNo(j))}</b>${j.plate ? ` · ${plateTag(j.plate)}` : ""} has none yet.</p>
      <label for="kmIn">Mileage (km)</label><input id="kmIn" inputmode="numeric" autocomplete="off" placeholder="e.g. 72,769" required>
      <p class="hint" style="margin:6px 0 0">For an old job, use the mileage on the paper invoice or the nearest reading you know.</p>
      <div class="btns" style="margin-top:14px"><button class="btn block" id="kmSave">Save mileage</button></div></form>`);
    setTimeout(() => m.$("#kmIn").focus(), 50);
    m.$("#kmF").onsubmit = async (ev) => {
      ev.preventDefault();
      const btn = m.$("#kmSave");
      busy(btn, true, "Saving…");
      try {
        Object.assign(j, await api(`/jobs/${j.id}/mileage`, { method: "POST", body: { mileageKm: m.$("#kmIn").value } }));
        busy(btn, false);
        const go = a.cloneNode(true);
        go.removeAttribute("data-doc");
        go.className = a.classList.contains("wa") ? "btn wa block" : "btn block";
        go.addEventListener("click", () => {
          setTimeout(m.close, 300);
          if (a.hasAttribute("data-sent") && j.status === "Draft") api(`/jobs/${j.id}/status`, { method: "POST", body: { status: "Sent" } }).then((x) => Object.assign(j, x)).catch(() => {});
        });
        m.$(".mb").innerHTML = `<p style="margin-top:0">${icon("check")} Mileage saved: <b>${Number(j.mileageKm).toLocaleString("en-MY")} km</b>. Tap to continue.</p>`;
        m.$(".mb").appendChild(go);
        toast("Mileage saved", "ok");
      } catch (err) {
        busy(btn, false);
        toast(err.message, "err");
      }
    };
  }, true);

  // Empty state (after the 21st.dev "Empty State" pattern): icon circle, title, one line of help.
  const emptyBox = (ic, msg) => {
    const m = String(msg).match(/^(.+?[.!?])\s+(.+)$/);
    return `<div class="empty"><span class="ei">${icon(ic, "l")}</span><b>${m ? m[1] : msg}</b>${m ? `<span class="ed">${m[2]}</span>` : ""}</div>`;
  };
  // KPI extras (after the 21st.dev "Tweenly Chart KPI" stat card): delta pill and a dotted sparkline.
  const deltaPill = (now, before, label) => {
    if (!(before > 0)) return "";
    const pc = Math.round(((now - before) / before) * 100);
    const cls = pc > 0 ? "up" : pc < 0 ? "down" : "flat";
    return `<span class="delta ${cls}" title="${label}"><span aria-hidden="true">${pc > 0 ? "↑" : pc < 0 ? "↓" : "→"}</span>${Math.abs(pc)}%<span class="sr"> ${pc >= 0 ? "up" : "down"} ${label}</span></span>`;
  };
  function sparkline(values) {
    const max = Math.max(...values, 1), w = 120, h = 32, n = values.length - 1 || 1;
    const pts = values.map((v, i) => [Math.round((i / n) * w * 10) / 10, Math.round((h - 2 - (v / max) * (h - 6)) * 10) / 10]);
    const line = pts.map((p, i) => (i ? "L" : "M") + p.join(" ")).join(" ");
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><defs><pattern id="sparkDots" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.9"></circle></pattern></defs><path class="area" d="${line} L${w} ${h} L0 ${h} Z"></path><path class="ln" d="${line}"></path></svg>`;
  }

  // ---------- data ----------

  async function loadAll() {
    const [s, p, q, pay, c, v, pk, fc, ia, bk, ex, cn, sp, pu, po, ib] = await Promise.all([api("/settings"), api("/parts"), api("/jobs"), api("/payments"), api("/customers"), api("/vehicles"), api("/packages"), api("/faults"), api("/interactions"), api("/bookings"), api("/expenses"), api("/creditnotes"), api("/suppliers"), api("/purchases"), api("/partorders"), api("/inbox")]);
    state.inbox = ib.inbox;
    state.whatsapp = ib.whatsapp;
    Object.assign(state, { expenses: ex.expenses, creditnotes: cn.creditnotes, suppliers: sp.suppliers, purchases: pu.purchases, partorders: po.partorders });
    state.interactions = ia.interactions;
    state.bookings = bk.bookings;
    state.packages = pk.packages;
    state.faults = fc.faults;
    state.settings = s;
    state.parts = p.parts;
    state.jobs = q.jobs;
    state.payments = pay.payments;
    state.customers = c.customers;
    state.vehicles = v.vehicles;
  }
  async function refresh(...what) {
    const map = { jobs: "/jobs", payments: "/payments", customers: "/customers", parts: "/parts", vehicles: "/vehicles", packages: "/packages", faults: "/faults", interactions: "/interactions", bookings: "/bookings", expenses: "/expenses", creditnotes: "/creditnotes", suppliers: "/suppliers", purchases: "/purchases", partorders: "/partorders", inbox: "/inbox" };
    const out = await Promise.all(what.map((w) => api(map[w])));
    what.forEach((w, i) => (state[w] = out[i][w]));
  }
  const vehicleByKey = (k) => state.vehicles.find((v) => v.key === k);
  const jobsOfVehicle = (k) => state.jobs.filter((j) => plateKey(j.plate) === k).sort((a, b) => jobDate(b).localeCompare(jobDate(a)));
  function jobsOfCustomer(c) {
    return state.jobs.filter((j) => j.customerId === c.id || (!j.customerId && j.customerName.toLowerCase() === c.name.toLowerCase())).sort((a, b) => jobDate(b).localeCompare(jobDate(a)));
  }
  function customerStats(c) {
    const jobs = jobsOfCustomer(c).filter((j) => j.status !== "Cancelled");
    const plates = new Set(jobs.map((j) => plateKey(j.plate)).filter(Boolean));
    state.vehicles.forEach((v) => v.customerId === c.id && plates.add(v.key));
    return {
      jobs,
      plates: [...plates],
      spent: jobs.filter((j) => j.invoiceNo).reduce((t, j) => t + j.total, 0),
      owes: jobs.filter((j) => j.invoiceNo).reduce((t, j) => t + j.balance, 0),
      last: jobs[0] ? jobDate(jobs[0]) : "",
    };
  }
  const owedInvoices = () => state.jobs.filter((j) => j.invoiceNo && j.status !== "Cancelled" && j.balance > 0.009).sort((a, b) => (a.invoiceDate || "").localeCompare(b.invoiceDate || ""));

  // ---------- shell ----------

  const NAV_TOP = [["dashboard", "Dashboard", "dashboard"], ["inbox", "Inbox", "inbox"], ["assistant", "Assistant", "sparkle"]];
  const NAV = [
    ["Workshop", [["jobs", "Jobs", "jobs"], ["bookings", "Bookings", "calendar"], ["vehicles", "Vehicles", "car"], ["packages", "Packages", "box"], ["faults", "Fault cases", "fault"], ["hub", "Merc HUB", "layers"]]],
    ["CRM", [["customers", "Customers", "users"], ["followups", "Follow-ups", "phone"], ["reminders", "Service reminders", "bell"]]],
    ["Finance", [["money", "Money in", "money"], ["expenses", "Expenses", "receipt"], ["creditnotes", "Credit notes", "cn"], ["pnl", "Profit & Loss", "chart"], ["balance", "Balance sheet", "scale"], ["statements", "Financial statements", "book"]]],
    ["Stock", [["parts", "Parts & stock", "parts"], ["suppliers", "Suppliers", "truck"], ["orders", "Part orders", "order"]]],
  ];
  const navLink = ([k, l, ic]) => `<a href="#/${k}" data-nav="${k}">${icon(ic)}<span>${l}</span>${k === "jobs" ? '<span class="count" id="navWs" hidden></span>' : k === "inbox" ? '<span class="count" id="navIb" hidden></span>' : ""}</a>`;

  function buildShell() {
    $("#side").innerHTML = `
      <a class="brand" href="#/dashboard" aria-label="The Merc Lab: dashboard"><img src="brand/merc-lab-logo.svg" alt="The Merc Lab" width="168" height="58"></a>
      <nav class="nav">${NAV_TOP.map(navLink).join("")}
        ${NAV.map(([h, items]) => `<details class="nav-g" data-g="${h}"><summary>${h}<span class="dot-n" data-gn="${h}"></span>${icon("cd", "s chev")}</summary>${items.map(navLink).join("")}</details>`).join("")}</nav>
      <div class="side-foot"><a href="#/settings" data-nav="settings">${icon("settings")}<span>Settings</span></a>
        <button type="button" id="logoutBtn">${icon("logout")}<span>Log out</span></button></div>`;
    $("#bottom").className = "bar";
    // Tab bar: navigation only (HIG tab-bars). Create is a floating action above it.
    $("#bottom").innerHTML = `<a href="#/dashboard" data-nav="dashboard">${icon("home")}Home</a><a href="#/jobs" data-nav="jobs">${icon("jobs")}Jobs</a><a href="#/vehicles" data-nav="vehicles">${icon("car")}Cars</a>
      <a href="#/money" data-nav="money">${icon("money")}Money</a><button type="button" id="moreBtn" aria-controls="side">${icon("more")}More</button>`;
    if (!$("#createBtn")) $("#shell").insertAdjacentHTML("beforeend", `<button type="button" class="fab-float" id="createBtn" aria-label="Create: new estimate, payment, booking">${icon("plus")}<span>Create</span></button>`);
    $("#menuBtn").innerHTML = icon("menu");
    $("#gIcon").outerHTML = icon("search");
    if (!$(".gsearch .kbd")) $(".gsearch").insertAdjacentHTML("beforeend", `<span class="kbd" aria-hidden="true">Ctrl K</span><button type="button" class="gcancel" id="gCancel">Cancel</button>`);
    if (!$("#searchBtn")) $(".gsearch").insertAdjacentHTML("beforebegin", `<button type="button" class="btn ghost icon search-btn" id="searchBtn" aria-label="Search">${icon("search")}</button>`);
    const searching = (on) => { document.body.classList.toggle("search-open", on); if (on) $("#gq").focus(); else { $("#gq").value = ""; $("#gres").hidden = true; } };
    $("#searchBtn").onclick = () => searching(true);
    $("#gCancel").onclick = () => searching(false);
    window.addEventListener("hashchange", () => document.body.classList.remove("search-open"));
    // Sheets: swipe down to dismiss (HIG sheets).
    let drag = null;
    document.addEventListener("touchstart", (e) => { const box = e.target.closest(".modal .box"); if (box && box.scrollTop <= 0) drag = { box, y: e.touches[0].clientY, dy: 0 }; }, { passive: true });
    document.addEventListener("touchmove", (e) => { if (!drag) return; drag.dy = Math.max(0, e.touches[0].clientY - drag.y); drag.box.style.transform = drag.dy ? `translateY(${drag.dy}px)` : ""; }, { passive: true });
    document.addEventListener("touchend", () => { if (!drag) return; const { box, dy } = drag; drag = null; if (dy > 110) box.closest(".modal").querySelector(".mh .x")?.click(); else { box.style.transition = "transform .25s var(--ease-ios)"; box.style.transform = ""; setTimeout(() => (box.style.transition = ""), 260); } });
    const open = (on) => {
      document.body.classList.toggle("nav-open", on);
      $("#menuBtn").setAttribute("aria-expanded", on ? "true" : "false");
      $("#moreBtn").setAttribute("aria-expanded", on ? "true" : "false");
      if (on) $("#side a.on, #side a")?.focus({ preventScroll: true });
    };
    $("#menuBtn").setAttribute("aria-controls", "side");
    document.addEventListener("keydown", (e) => e.key === "Escape" && document.body.classList.contains("nav-open") && open(false));
    $("#menuBtn").onclick = () => open(true);
    $("#moreBtn").onclick = () => open(true);
    $("#scrim").onclick = () => open(false);
    $("#side").addEventListener("click", (e) => e.target.closest("a") && open(false));
    $("#createBtn").onclick = () => {
      const items = [["#/jobs/new", "plus", "New estimate", "Customer, car and the work to do"], ["#/money?upload=1", "upload", "Payment slip", "Upload a slip; AI reads it"], ["#/money?cash=1", "money", "Record payment", "Cash or any payment without a slip"], ["#/bookings?new=1", "calendar", "New booking", "When a customer is coming in"]];
      const m = modal("Create", `<div class="rows">${items.map(([h, ic, t, s]) => `<a href="${h}"><span class="mini">${icon(ic)}</span><div class="grow"><b>${t}</b><span>${s}</span></div>${icon("cr", "s")}</a>`).join("")}</div>`);
      m.el.classList.add("sheet-modal");
      m.el.addEventListener("click", (e) => e.target.closest("a") && m.close());
    };
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        $("#gq").focus();
      }
    });
    $("#logoutBtn").onclick = async () => {
      await api("/logout", { method: "POST" }).catch(() => {});
      showLogin();
    };
    setupSearch();
  }

  function setActive(section) {
    $$("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === section));
    // Only the menu group holding this page is open, so the menu fits a 900px-high screen.
    $$(".nav-g").forEach((g) => (g.open = !!g.querySelector(`[data-nav="${section}"]`)));
    const ws = state.jobs.filter(isWorkshop).length;
    const ib = $("#navIb");
    if (ib) {
      const n = inboxNew();
      ib.hidden = !n;
      ib.textContent = n;
    }
    const b = $("#navWs");
    if (b) {
      b.hidden = !ws;
      b.textContent = ws;
      b.title = `${ws} car(s) in the workshop`;
    }
    const today = todayKL();
    const due = state.customers.filter((c) => c.nextFollowUp && c.nextFollowUp <= today).length;
    const low = state.parts.filter((p) => Number(p.qtyLeft) <= 1).length;
    const gn = { Workshop: ws ? `${ws} in` : "", CRM: due ? `${due} due` : "", Finance: "", Stock: low ? `${low} low` : "" };
    $$("[data-gn]").forEach((s) => (s.textContent = gn[s.dataset.gn] || ""));
  }

  function crumbs(list) {
    $("#crumbs").innerHTML = list.map(([l, h], i) => (h && i < list.length - 1 ? `<a href="${h}">${esc(l)}</a>` : `<span>${esc(l)}</span>`)).join(" / ");
    document.title = `${list[list.length - 1][0]} · Merc Lab DMS`;
  }

  function setupSearch() {
    const q = $("#gq");
    const box = $("#gres");
    let hits = [];
    let at = 0;
    const draw = () => {
      box.innerHTML = hits.length
        ? hits.map((h, i) => `<a href="${h.href}" class="${i === at ? "on" : ""}"><span class="k">${h.k}</span><span>${h.html}</span></a>`).join("")
        : `<div class="muted" style="padding:10px">No match.</div>`;
    };
    q.addEventListener("input", () => {
      const s = q.value.trim().toLowerCase();
      const pk = plateKey(s);
      if (s.length < 2) return void (box.hidden = true);
      hits = [];
      for (const v of state.vehicles) if ((pk && v.key.includes(pk)) || v.makeModel.toLowerCase().includes(s)) hits.push({ k: "Car", href: `#/vehicles/${v.key}`, html: `${plateTag(v.plate)} ${esc(v.makeModel)}` });
      for (const c of state.customers) if (c.name.toLowerCase().includes(s) || (s.replace(/\D/g, "").length > 3 && c.phone.replace(/\D/g, "").includes(s.replace(/\D/g, "")))) hits.push({ k: "Customer", href: `#/customers/${c.id}`, html: `${esc(c.name)} <span class="muted">${esc(c.phone)}</span>` });
      for (const j of state.jobs) if ([j.estimateNo, j.invoiceNo].some((n) => n && n.toLowerCase().includes(s))) hits.push({ k: kindOf(j), href: `#/jobs/${j.id}`, html: `${esc(docNo(j))} · ${esc(j.customerName)}` });
      hits = hits.slice(0, 8);
      at = 0;
      box.hidden = false;
      draw();
    });
    q.addEventListener("keydown", (e) => {
      if (box.hidden) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        at = (at + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % Math.max(hits.length, 1);
        draw();
      } else if (e.key === "Enter" && hits[at]) {
        location.hash = hits[at].href;
        box.hidden = true;
        q.value = "";
        q.blur();
      } else if (e.key === "Escape") box.hidden = true;
    });
    box.addEventListener("click", () => { box.hidden = true; q.value = ""; });
    document.addEventListener("click", (e) => !e.target.closest(".gsearch") && (box.hidden = true));
  }

  // ---------- router ----------

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, "");
    const [path, qs] = raw.split("?");
    return { parts: path.split("/").filter(Boolean).map(decodeURIComponent), q: new URLSearchParams(qs || "") };
  }

  function route() {
    if ($("#shell").hidden) return;
    document.body.classList.remove("nav-open");
    $$(".modal").forEach((m) => m.remove());
    const { parts, q } = parseHash();
    const [sec = "dashboard", a, b] = parts;
    setActive(sec);
    window.scrollTo(0, 0);
    try {
      if (sec === "dashboard") return pageDashboard();
      if (sec === "jobs") {
        if (a === "new") return jobForm("new", null, q);
        if (a && b === "invoice") return jobForm("invoice", state.jobs.find((j) => j.id === a));
        if (a && b === "inspection") return pageInspection(a);
        if (a) return pageJob(a);
        return pageJobs(q);
      }
      if (sec === "vehicles") return a ? pageVehicle(a, b || "details") : pageVehicles(q);
      if (sec === "customers") return a ? pageCustomer(a) : pageCustomers();
      if (sec === "parts") return a === "count" ? pageStockCount() : pageParts(q);
      if (sec === "inbox") return pageInbox();
      if (sec === "assistant") return pageAssistant();
      if (sec === "expenses") return pageExpenses(q);
      if (sec === "creditnotes") return pageCredits();
      if (sec === "pnl") return pagePnl(q);
      if (sec === "balance") return pageBalance();
      if (sec === "statements") return pageStatements(q);
      if (sec === "suppliers") return pageSuppliers();
      if (sec === "orders") return pageOrders(q);
      if (sec === "packages") return a ? packageForm(a) : pagePackages();
      if (sec === "faults") return pageFaults();
      if (sec === "hub") return pageHub(q);
      if (sec === "bookings") return pageBookings(q);
      if (sec === "followups") return pageFollowups(q);
      if (sec === "reminders") return pageReminders();
      if (sec === "money") return a === "receipt" ? pageReceipt(b) : pageMoney(q);
      if (sec === "settings") return pageSettings();
      location.hash = "#/dashboard";
    } catch (err) {
      console.error(err);
      view.innerHTML = `<div class="notice bad">${icon("alert")}<div>This page could not open: ${esc(err.message)}</div></div>`;
    }
  }
  window.addEventListener("hashchange", route);

  const pageHead = (title, { sub = "", back = "", acts = "", extra = "" } = {}) => `
    <div class="ph">${back ? `<a class="back" href="${back}" aria-label="Back">${icon("back")}</a>` : ""}
      <div style="min-width:0"><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div>${extra}
      ${acts ? `<div class="acts">${acts}</div>` : ""}</div>`;

  // ================= DASHBOARD =================

  function pageDashboard() {
    crumbs([["Dashboard"]]);
    const today = todayKL();
    const month = today.slice(0, 7);
    const pays = state.payments;
    const inToday = pays.filter((p) => p.paidOn === today).reduce((t, p) => t + p.amount, 0);
    const inMonth = pays.filter((p) => (p.paidOn || "").startsWith(month)).reduce((t, p) => t + p.amount, 0);
    const invMonth = state.jobs.filter((j) => j.invoiceNo && j.status !== "Cancelled" && (j.invoiceDate || "").startsWith(month));
    const pm = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
    const sameDay = (d) => !!d && d.startsWith(pm) && d.slice(8) <= today.slice(8);
    const inPrev = pays.filter((p) => sameDay(p.paidOn)).reduce((t, p) => t + p.amount, 0);
    const invPrev = state.jobs.filter((j) => j.invoiceNo && j.status !== "Cancelled" && sameDay(j.invoiceDate)).reduce((t, j) => t + j.total, 0);
    const days14 = [...Array(14)].map((_, i) => new Date(Date.parse(today) - (13 - i) * 864e5).toISOString().slice(0, 10));
    const spark14 = days14.map((d) => pays.filter((p) => p.paidOn === d).reduce((t, p) => t + p.amount, 0));
    const owed = owedInvoices();
    const ws = state.jobs.filter(isWorkshop);
    const ready = ws.filter((j) => j.stage === "Ready").length;
    const lanes = ["Booked", "In workshop", "Waiting parts", "Ready"];
    const laneJobs = (st) => state.jobs.filter((j) => j.status !== "Cancelled" && j.stage === st && (st !== "Booked" || daysBetween(jobDate(j) || today, today) <= 30));
    const low = state.parts.filter((p) => p.qtyLeft <= 1).slice(0, 6);
    const soon = state.vehicles.filter((v) => v.nextServiceDate && daysBetween(today, v.nextServiceDate) <= 30).sort((a, b) => a.nextServiceDate.localeCompare(b.nextServiceDate)).slice(0, 6);
    const monthName = new Date(today + "T00:00:00Z").toLocaleString("en-MY", { month: "long", timeZone: "UTC" });
    const tile = (href, ic, lbl, val, foot, extra = "") => `<a class="tile" href="${href}"><div class="lbl">${icon(ic)}${lbl}</div><div class="val">${val}</div><div class="foot">${foot}</div>${extra}</a>`;

    view.innerHTML = `
      ${pageHead("Dashboard", { sub: new Date(today + "T00:00:00Z").toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }), acts: `<a class="btn alt" href="#/money?upload=1">${icon("upload")}Payment slip</a><a class="btn" href="#/jobs/new">${icon("plus")}New estimate</a>` })}
      <div class="grid g4 dash-tiles" style="margin-bottom:16px">
        ${tile("#/money", "money", "Money in today", rm(inToday), `${monthName}: ${rm(inMonth)} ${deltaPill(inMonth, inPrev, "on the same days last month")}`, sparkline(spark14))}
        ${tile("#/jobs?f=invoices", "receipt", `Invoiced in ${monthName}`, rm(invMonth.reduce((t, j) => t + j.total, 0)), `${invMonth.length} invoice${invMonth.length === 1 ? "" : "s"} ${deltaPill(invMonth.reduce((t, j) => t + j.total, 0), invPrev, "on the same days last month")}`)}
        ${tile("#/money?tab=owed", "alert", "Owed to you", rm(owed.reduce((t, j) => t + j.balance, 0)), `${owed.length} unpaid invoice${owed.length === 1 ? "" : "s"}`)}
        ${tile("#/jobs?f=workshop", "car", "Cars in workshop", ws.length, `${ready} ready for pickup`)}
      </div>
      <div class="card dash-todo"><div class="card-h"><h2>Needs action</h2><div class="r"><a class="btn ghost sm" href="#/assistant">Assistant</a></div></div>${morningBrief()}</div>
      <div class="split">
        <div>
          <div class="card">
            <div class="card-h"><h2>Workshop board</h2><div class="r"><a class="btn ghost sm" href="#/jobs?f=workshop">All jobs</a></div></div>
            <div class="board">${lanes.map((st) => {
              const list = laneJobs(st);
              return `<div class="lane"><h3>${stagePill(st)}<span class="n">${list.length}</span></h3>
                ${list.slice(0, 6).map((j) => `<a class="jc" href="#/jobs/${j.id}">${plateTag(j.plate) || '<span class="muted">No plate</span>'}<div class="t">${esc(shortCar(j.car) || "Car")}</div><div class="m">${esc(j.customerName)}</div><div class="m">${esc(docNo(j))}</div></a>`).join("")}
                ${list.length > 6 ? `<a class="btn ghost sm block" href="#/jobs?f=workshop">+${list.length - 6} more</a>` : ""}
                ${list.length ? "" : `<div class="muted" style="padding:6px 4px">None</div>`}</div>`;
            }).join("")}</div>
          </div>
          <div class="card">
            <div class="card-h"><h2>Latest jobs</h2><div class="r"><a class="btn ghost sm" href="#/jobs">See all</a></div></div>
            ${jobTable(state.jobs.slice(0, 6), true)}
          </div>
        </div>
        <div>
          ${inboxNew() ? `<a class="notice" href="#/inbox" style="text-decoration:none">${icon("chat")}<div><b>${inboxNew()} new bill(s) from WhatsApp</b> waiting to be checked and saved.</div></a>` : ""}
          ${(() => {
            const bks = state.bookings.filter((b) => b.date === today && b.status !== "Cancelled");
            const fus = state.customers.filter((c) => c.nextFollowUp && c.nextFollowUp <= today);
            return `<div class="card"><div class="card-h"><h2>Today's bookings</h2><div class="r"><a class="btn ghost sm" href="#/bookings">Calendar</a></div></div>
              ${bks.length ? `<div class="rows">${bks.map((b) => `<a href="#/bookings"><div class="grow"><b>${esc(b.time || "Any time")} · ${esc(b.customerName)}</b><span class="muted">${esc([b.plate, b.work].filter(Boolean).join(" · "))}</span></div>${pill(b.status, BK_CLS[b.status])}</a>`).join("")}</div>` : `<p class="muted">No bookings today.</p>`}</div>
              ${fus.length ? `<div class="card"><div class="card-h"><h2>Follow-ups due</h2><div class="r"><a class="btn ghost sm" href="#/followups">All</a></div></div><div class="rows">${fus.slice(0, 5).map((c) => `<a href="#/customers/${c.id}"><div class="grow"><b>${esc(c.name)}</b><span class="muted">${esc(c.followUpNote || "Follow up")}</span></div><span class="r">${c.nextFollowUp < today ? pill(dmy(c.nextFollowUp), "bad") : "Today"}</span></a>`).join("")}</div></div>` : ""}`;
          })()}
          <div class="card"><div class="card-h"><h2>Who owes you</h2><div class="r"><a class="btn ghost sm" href="#/money?tab=owed">All</a></div></div>
            ${owed.length ? `<div class="rows">${owed.slice(0, 5).map((j) => `<a href="#/jobs/${j.id}"><div class="grow"><b>${esc(j.customerName)}</b><span class="muted">${esc(j.invoiceNo)} · ${ago(j.invoiceDate)}</span></div><div class="r"><b>${rm(j.balance)}</b></div></a>`).join("")}</div>` : `<p class="muted">${icon("check")} Nobody owes you money.</p>`}</div>
          <div class="card"><div class="card-h"><h2>Service due (30 days)</h2></div>
            ${soon.length ? `<div class="rows">${soon.map((v) => `<a href="#/vehicles/${v.key}"><div class="grow"><b>${esc(v.makeModel || v.plate)}</b><span class="muted">${plateTag(v.plate)} ${esc(v.ownerName)}</span></div><div class="r"><b>${dmy(v.nextServiceDate)}</b><span class="muted">${ago(v.nextServiceDate)}</span></div></a>`).join("")}</div>` : `<p class="muted">No service due. Set "Next service" on a car to see it here.</p>`}</div>
          <div class="card"><div class="card-h"><h2>Low stock</h2><div class="r"><a class="btn ghost sm" href="#/parts">Parts</a></div></div>
            ${low.length ? `<div class="rows">${low.map((p) => `<a href="#/parts"><div class="grow"><b>${esc(p.name)}</b><span class="muted">${esc([p.brand, p.partNo].filter(Boolean).join(" · "))}</span></div><div class="r">${pill(`${p.qtyLeft} left`, p.qtyLeft <= 0 ? "bad" : "warn")}</div></a>`).join("")}</div>` : `<p class="muted">All parts have stock.</p>`}</div>
          <div class="card"><div class="card-h"><h2>Latest payments</h2></div>
            ${state.payments.length ? `<div class="rows">${state.payments.slice(0, 5).map((p) => `<a href="#/money/receipt/${p.id}"><div class="grow"><b>${esc(p.customerName)}</b><span class="muted">${esc(p.receiptNo)} · ${dmy(p.paidOn)}</span></div><div class="r"><b>${rm(p.amount)}</b></div></a>`).join("")}</div>` : `<p class="muted">No payments yet.</p>`}</div>
        </div>
      </div>`;
  }

  // ================= JOBS =================

  function jobTable(jobs, compact) {
    if (!jobs.length) return emptyBox("jobs", "No jobs here yet.");
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>No.</th><th class="d">Date</th><th>Customer</th><th class="d">Car</th>${compact ? "" : '<th class="d">Stage</th>'}<th>Status</th><th class="num">Total</th>${compact ? "" : '<th class="num d">Balance</th>'}</tr></thead><tbody>
      ${jobs.map((j) => `<tr class="tap" data-href="#/jobs/${j.id}"><td class="nowrap"><a href="#/jobs/${j.id}" class="strong" style="color:inherit;text-decoration:none">${esc(docNo(j))}</a><div class="sm">${kindOf(j)}</div></td>
        <td class="d nowrap">${dmy(jobDate(j))}</td><td>${esc(j.customerName)}<div class="sm">${plateTag(j.plate)}</div></td><td class="d">${esc(j.car)}</td>
        ${compact ? "" : `<td class="d">${stagePill(j.stage)}</td>`}<td>${statusPill(j.status)}</td><td class="num">${rm(j.total)}</td>${compact ? "" : `<td class="num d">${j.balance > 0.009 && j.status !== "Cancelled" ? rm(j.balance) : "—"}</td>`}</tr>`).join("")}
      </tbody></table></div>`;
  }
  // Whole table rows open the job (the number is also a real link for keyboards).
  document.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-href]");
    if (tr && !e.target.closest("a,button,input,select")) location.hash = tr.dataset.href;
  });

  const JOB_FILTERS = {
    all: ["All", () => true],
    estimates: ["Estimates", (j) => !j.invoiceNo && j.status !== "Cancelled"],
    invoices: ["Invoices", (j) => !!j.invoiceNo],
    unpaid: ["Unpaid", (j) => j.invoiceNo && j.status !== "Cancelled" && j.balance > 0.009],
    workshop: ["In workshop", isWorkshop],
    cancelled: ["Cancelled", (j) => j.status === "Cancelled"],
  };

  function pageJobs(q) {
    crumbs([["Jobs"]]);
    let f = JOB_FILTERS[q.get("f")] ? q.get("f") : "all";
    let shown = 50;
    view.innerHTML = `
      ${pageHead("Jobs", { sub: "Estimates and invoices", acts: `<a class="btn" href="#/jobs/new">${icon("plus")}New estimate</a>` })}
      <div class="toolbar"><div class="search">${icon("search")}<input id="jq" type="search" placeholder="Search no., customer, plate" aria-label="Search jobs"></div>
        <div class="chips" id="jf">${Object.entries(JOB_FILTERS).map(([k, [l, fn]]) => `<button type="button" class="chip ${k === f ? "on" : ""}" data-f="${k}">${l} <span class="n">${state.jobs.filter(fn).length}</span></button>`).join("")}</div></div>
      <div class="card flush" id="jt"></div>`;
    const draw = () => {
      const s = $("#jq").value.trim().toLowerCase();
      const list = state.jobs.filter(JOB_FILTERS[f][1]).filter((j) => !s || `${j.estimateNo} ${j.invoiceNo} ${j.customerName} ${j.plate} ${j.car} ${plateKey(j.plate)}`.toLowerCase().includes(s));
      $("#jt").innerHTML = jobTable(list.slice(0, shown)) + (list.length > shown ? `<div style="padding:12px"><button class="btn alt block" id="jmore">Show more (${list.length - shown})</button></div>` : "");
      const m = $("#jmore");
      if (m) m.onclick = () => { shown += 50; draw(); };
    };
    $("#jq").oninput = () => { shown = 50; draw(); };
    $("#jf").onclick = (e) => {
      const b = e.target.closest("[data-f]");
      if (!b) return;
      f = b.dataset.f;
      $$("#jf .chip").forEach((c) => c.classList.toggle("on", c === b));
      history.replaceState(null, "", `#/jobs?f=${f}`);
      draw();
    };
    draw();
  }

  function docActions(j) {
    const plate = j.plate ? ` (${j.plate})` : "";
    const out = [];
    if (j.invoiceNo && j.invoiceToken) {
      const link = docLink(j.invoiceToken);
      out.push({ kind: "Invoice", no: j.invoiceNo, link, wa: waLink(j.phone, `Hi ${j.customerName}, your car${plate} is ready. Here is your invoice ${j.invoiceNo} from ${brandName()}.\nAmount due: ${rm(j.balance)}\n${link}`) });
    }
    if (j.estimateNo && j.token) {
      const link = docLink(j.token);
      out.push({ kind: "Estimate", no: j.estimateNo, link, wa: waLink(j.phone, `Hi ${j.customerName}, here is your estimate ${j.estimateNo}${plate} from ${brandName()}.\nTotal: ${rm(j.total)}\n${link}`) });
    }
    return out;
  }

  function pageJob(id) {
    const j = state.jobs.find((x) => x.id === id);
    if (!j) {
      crumbs([["Jobs", "#/jobs"], ["Not found"]]);
      view.innerHTML = `${pageHead("Job not found", { back: "#/jobs" })}<p class="muted">It may have been removed in Airtable.</p>`;
      return;
    }
    crumbs([["Jobs", "#/jobs"], [docNo(j)]]);
    const pays = state.payments.filter((p) => p.jobId === j.id);
    const docs = docActions(j);
    const cancelled = j.status === "Cancelled";
    const vk = plateKey(j.plate);
    const v = vehicleByKey(vk);
    const cust = state.customers.find((c) => c.id === j.customerId);
    const si = STAGES.indexOf(j.stage);
    const primary = cancelled ? "" : !j.invoiceNo ? `<a class="btn" href="#/jobs/${j.id}/invoice">${icon("check")}Work done → invoice</a>` : j.balance > 0.009 ? `<a class="btn" href="#/money?pay=${j.id}">${icon("money")}Record payment</a>` : "";
    view.innerHTML = `
      ${pageHead(`${esc(docNo(j))}`, { back: "#/jobs", sub: `${esc(j.customerName)}${j.car ? " · " + esc(j.car) : ""}`, extra: `<div class="chips">${pill(kindOf(j), "info")}${statusPill(j.status)}${j.approvedAt ? pill(`Approved online by ${j.approvedName}`, "ok") : ""}</div>`, acts: `<button type="button" class="btn alt" id="jPrint">${icon("print")}Job card</button>${docs[0] ? `<a class="btn wa" data-sent data-doc="${j.id}" href="${esc(docs[0].wa)}" target="_blank" rel="noopener">${icon("chat")}Send ${docs[0].kind.toLowerCase()}</a>` : ""}${primary}` })}
      ${cancelled ? "" : `<div class="card"><div class="stepper" id="stepper" role="group" aria-label="Job stage">${STAGES.map((s, i) => `<button type="button" data-stage="${s}" class="${i < si ? "done" : i === si ? "cur" : ""}" aria-pressed="${i === si}"><span class="b">${i <= si ? icon("check") : ""}</span>${s}</button>`).join("")}</div></div>`}
      <div class="split">
        <div>
          <div class="card"><div class="card-h"><h2>Work</h2>${j.mileageKm ? `<div class="r muted">${icon("gauge")} ${km(j.mileageKm)}</div>` : ""}</div>
            ${j.groups.map((g) => `<div class="jgroup"><div class="h">${esc(g.code)} ${esc(g.request || "")}</div><table class="tbl"><tbody>
              ${g.lines.map((l) => `<tr><td>${esc(l.description)}<div class="sm">${l.type === "part" ? `Part${l.partNo ? " · " + esc(l.partNo) : ""} · ${l.qty} × ${rm(l.unitPrice)}` : esc(l.type[0].toUpperCase() + l.type.slice(1))}</div></td><td class="num">${rm(l.amount)}</td></tr>`).join("")}
              ${g.lines.length ? "" : '<tr><td class="sm">No lines</td><td></td></tr>'}</tbody></table></div>`).join("")}
          </div>
          ${pays.length ? `<div class="card"><div class="card-h"><h2>Payments received</h2></div><div class="rows">${pays.map((p) => `<a href="#/money/receipt/${p.id}"><div class="grow"><b>${esc(p.receiptNo)}</b><span class="muted">${dmy(p.paidOn)} · ${esc(p.method)}${p.reference ? " · " + esc(p.reference) : ""}</span></div><div class="r"><b>${rm(p.amount)}</b></div></a>`).join("")}</div></div>` : ""}
        </div>
        <div>
          <div class="card"><h2>Summary</h2><div class="sum">
            <div><span class="muted">${kindOf(j)} date</span><span>${dmy(jobDate(j))}</span></div>
            ${j.invoiceNo && j.estimateNo ? `<div><span class="muted">From estimate</span><span>${esc(j.estimateNo)}</span></div>` : ""}
            ${!j.invoiceNo && j.validUntil ? `<div><span class="muted">Valid until</span><span>${dmy(j.validUntil)}</span></div>` : ""}
            <div class="big"><span>Total</span><span>${rm(j.total)}</span></div>
            ${j.credited ? `<div><span class="muted">Credit notes</span><span>-${rm(j.credited)}</span></div>` : ""}
            <div><span class="muted">Paid</span><span>${rm(j.paid)}</span></div>
            <div><span class="strong">Balance</span><span class="strong">${rm(j.balance)}</span></div></div>
            ${!cancelled && !j.invoiceNo && j.balance > 0.009 ? `<div class="btns"><a class="btn alt block" href="#/money?pay=${j.id}">${icon("money")}Record deposit</a></div>` : ""}
          </div>
          ${docs.length ? `<div class="card"><h2>Documents</h2><div class="rows">${docs.map((d) => `<div class="docrow"><div class="grow"><b>${d.kind}</b><span class="muted">${esc(d.no)}</span></div>
            <div class="da"><a class="btn alt sm" data-doc="${j.id}" href="${esc(d.link)}" target="_blank" rel="noopener">${icon("open")}PDF</a><a class="btn wa sm" data-sent data-doc="${j.id}" href="${esc(d.wa)}" target="_blank" rel="noopener">${icon("chat")}Send</a></div></div>`).join("")}</div></div>` : ""}
          ${cancelled ? "" : jobExtrasHtml(j)}
          <div class="card"><h2>Customer &amp; car</h2><dl class="kv">
            <dt>Customer</dt><dd>${cust ? `<a href="#/customers/${cust.id}">${esc(j.customerName)}</a>` : esc(j.customerName)}</dd>
            <dt>Phone</dt><dd>${j.phone ? `<a href="tel:${esc(j.phone)}">${esc(j.phone)}</a>` : "—"}</dd>
            <dt>Car</dt><dd>${vk ? `<a href="#/vehicles/${vk}">${plateTag(j.plate)} ${esc(j.car)}</a>` : esc(j.car || "—")}</dd>
            ${vk ? `<dt>Body condition</dt><dd><a href="#/vehicles/${vk}/condition?job=${encodeURIComponent(docNo(j))}">${v && v.openMarks ? `${v.openMarks} mark(s)` : "Check-in"} →</a></dd>` : ""}
          </dl></div>
          ${!j.paid && !j.invoiceNo && !cancelled ? `<button class="btn danger block" id="jCancel">${icon("x")}Cancel estimate</button>` : ""}
          ${j.invoiceNo && !cancelled && j.total - j.credited > 0.009 ? `<button class="btn alt block" id="jCredit">${icon("file")}Credit note</button>` : ""}
        </div>
      </div>`;
    $$("[data-sent]").forEach((a) => a.addEventListener("click", async () => {
      if (j.status !== "Draft") return;
      try { Object.assign(j, await api(`/jobs/${j.id}/status`, { method: "POST", body: { status: "Sent" } })); } catch { /* ignore */ }
    }));
    if (!cancelled) bindJobExtras(j);
    else $("#jPrint").onclick = () => printJobCard(j);
    const cr = $("#jCredit");
    if (cr) cr.onclick = () => creditDialog(j);
    const po = $("#poAdd");
    if (po) po.onclick = () => orderDialog(null, j);
    $$("[data-pord]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); orderDialog(state.partorders.find((o) => o.id === a.dataset.pord)); }));
    const st = $("#stepper");
    if (st) st.onclick = async (e) => {
      const b = e.target.closest("[data-stage]");
      if (!b || b.dataset.stage === j.stage) return;
      try {
        Object.assign(j, await api(`/jobs/${j.id}/stage`, { method: "POST", body: { stage: b.dataset.stage } }));
        toast(`Stage: ${j.stage}`);
        refresh("vehicles").catch(() => {});
        pageJob(j.id);
        setActive("jobs");
      } catch (err) {
        toast(err.message, "err");
      }
    };
    const c = $("#jCancel");
    if (c) c.onclick = async () => {
      if (!confirm(`Cancel ${j.estimateNo}? The number stays in the records.`)) return;
      try { Object.assign(j, await api(`/jobs/${j.id}/status`, { method: "POST", body: { status: "Cancelled" } })); toast("Estimate cancelled"); pageJob(j.id); } catch (err) { toast(err.message, "err"); }
    };
  }

  // ---------- job form (new estimate, or estimate → invoice) ----------

  const LINE_LABEL = { part: "Part", labour: "Labour", sundry: "Sundry", sublet: "Sublet" };
  const labourRate = () => Number(state.settings?.labourRate) || 100;
  // Mercedes chassis no (VIN), e.g. W1K1770542N161234: chars 4-6 model (177 = W177),
  // 7-10 variant (0542 = A45 S), last 6 serial. The rest does not matter here.
  const decodeChassis = (v) => {
    const s = String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (s.length !== 17 || !/^\d{3}$/.test(s.slice(3, 6)) || !/^\d{4}$/.test(s.slice(6, 10))) return null;
    return { model: s.slice(3, 6), variant: s.slice(6, 10), serial: s.slice(11) };
  };
  const fitsText = (codes) => codes.map((c) => (c.length === 7 ? `${c.slice(0, 3)} · ${c.slice(3)}` : c)).join(", ");
  const pkgFits = (pkg, ch) => !(pkg.fits || []).length || (!!ch && pkg.fits.some((c) => (c.length === 3 ? c === ch.model : c === ch.model + ch.variant)));

  function lineHtml(l) {
    const t = l.type;
    const amountField = t === "part"
      ? `<div class="item-grid"><div><label>Qty</label><input name="qty" type="number" inputmode="decimal" step="any" min="0" value="${esc(l.qty ?? 1)}"></div>
         <div><label>Unit price (RM)</label><input name="unitPrice" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(l.unitPrice ?? "")}"></div></div>`
      : t === "labour"
        ? `<div class="item-grid"><div><label>Hours</label><input name="hours" type="number" inputmode="decimal" step="0.25" min="0" value="${esc(l.hours ?? "")}" placeholder="e.g. 1.5"></div>
           <div><label>Amount (RM)</label><input name="amount" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(l.amount ?? "")}"></div></div><p class="hint" style="margin-top:4px">Hours × RM ${labourRate()}/hour fills the amount. You can still change it.</p>`
        : `<label>Amount (RM)</label><input name="amount" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(l.amount ?? "")}" style="max-width:220px">`;
    return `<div class="item" data-type="${t}" data-part="${esc(l.partId || "")}" data-cat="${esc(l.category || "")}" data-tax="${l.taxable ? 1 : 0}">
      <div class="row"><span class="pill info" style="flex:none">${LINE_LABEL[t]}</span>
        ${t === "labour" ? `<input name="opCode" placeholder="Op code" aria-label="Op code" value="${esc(l.opCode || "")}" style="max-width:130px">` : ""}
        ${t === "part" ? `<input name="partNo" placeholder="Part no" aria-label="Part no" value="${esc(l.partNo || "")}" style="max-width:160px">` : ""}
        <span style="flex:1"></span><button type="button" class="x" title="Remove line" aria-label="Remove line">${icon("trash")}</button></div>
      <label>Description</label><input name="description" placeholder="${t === "labour" ? "e.g. Perform Service B" : "Description"}" value="${esc(l.description || "")}">
      ${amountField}
    </div>`;
  }

  function groupHtml(g, i) {
    return `<div class="group">
      <div class="gh"><b>C${i + 1}</b><input name="request" placeholder="Customer request" aria-label="Customer request" value="${esc(g.request || "")}" style="text-transform:uppercase"><button type="button" class="x gx" title="Remove this request" aria-label="Remove this request">${icon("x")}</button></div>
      <div class="lines">${(g.lines || []).map(lineHtml).join("")}</div>
      <label>Add a part from stock</label>
      <input class="pick" list="partOptions" placeholder="Type part name…" autocomplete="off">
      <div class="addrow">
        <button type="button" class="btn alt sm" data-add="part">${icon("plus")}Part</button>
        <button type="button" class="btn alt sm" data-add="labour">${icon("plus")}Labour</button>
        <button type="button" class="btn alt sm" data-add="sundry">${icon("plus")}Sundry</button>
        <button type="button" class="btn alt sm" data-add="sublet">${icon("plus")}Sublet</button>
      </div>
    </div>`;
  }

  // Lines editor events, shared by the job form and the package editor.
  function bindGroups(box, onChange) {
    const renumber = () => $$(".group", box).forEach((g, i) => ($("b", g).textContent = `C${i + 1}`));
    box.addEventListener("click", (e) => {
      const add = e.target.closest("[data-add]");
      if (add) {
        const lines = $(".lines", add.closest(".group"));
        lines.insertAdjacentHTML("beforeend", lineHtml({ type: add.dataset.add, qty: 1 }));
        $(".item:last-child [name=description]", lines).focus();
      } else if (e.target.closest(".gx")) {
        if ($$(".group", box).length > 1) e.target.closest(".group").remove();
        renumber();
      } else if (e.target.closest(".x")) {
        e.target.closest(".item").remove();
      }
      onChange();
    });
    box.addEventListener("change", (e) => {
      if (!e.target.classList.contains("pick")) return;
      const val = e.target.value;
      const p = state.parts.find((x) => `${x.name}${x.partNo ? " · " + x.partNo : ""}` === val) || state.parts.find((x) => x.name === val);
      if (!p) return;
      $(".lines", e.target.closest(".group")).insertAdjacentHTML("beforeend", lineHtml({ type: "part", partId: p.id, partNo: p.partNo, description: [p.brand, p.name].filter(Boolean).join(" ").toUpperCase(), qty: 1, unitPrice: p.sellingPrice }));
      if (p.qtyLeft <= 0) toast(`${p.name}: none left in stock`);
      e.target.value = "";
      onChange();
    });
    box.addEventListener("input", (e) => {
      if (e.target.name === "hours") {
        const h = Number(e.target.value);
        const amt = $("[name=amount]", e.target.closest(".item"));
        if (e.target.value !== "" && h >= 0) amt.value = r2(h * labourRate()).toFixed(2);
      }
      onChange();
    });
    return renumber;
  }
  const readLines = (g) => $$(".item", g).map((el) => ({
    type: el.dataset.type, partId: el.dataset.part, category: el.dataset.cat, taxable: el.dataset.tax === "1",
    partNo: $("[name=partNo]", el)?.value, opCode: $("[name=opCode]", el)?.value, description: $("[name=description]", el).value,
    qty: $("[name=qty]", el)?.value, unitPrice: $("[name=unitPrice]", el)?.value, amount: $("[name=amount]", el)?.value,
    hours: $("[name=hours]", el)?.value,
  }));
  // Package lines with today's stock prices for linked parts.
  const packageLines = (pkg) => pkg.lines.map((l) => {
    const p = l.type === "part" && l.partId && state.parts.find((x) => x.id === l.partId);
    if (p) return { ...l, unitPrice: p.sellingPrice };
    // Labour priced by hours follows today's labour rate.
    if (l.type === "labour" && Number(l.hours) > 0) return { ...l, amount: r2(Number(l.hours) * labourRate()) };
    return { ...l };
  });
  const lineTotal = (lines) => lines.reduce((t, l) => t + (l.type === "part" ? (Number(l.qty) || 0) * (Number(l.unitPrice) || 0) : Number(l.amount) || 0), 0);

  function jobForm(mode, job, q) {
    if (mode === "invoice" && !job) return (location.hash = "#/jobs");
    // Prefill from a car or a customer (links on their pages).
    let pre = job;
    if (!pre && q) {
      const v = q.get("plate") && vehicleByKey(plateKey(q.get("plate")));
      const c = state.customers.find((x) => x.id === (q.get("customer") || v?.customerId));
      if (v || c) {
        pre = {
          customerName: c?.name || v?.ownerName || "", phone: c?.phone || v?.ownerPhone || "", customerId: c?.id || "",
          car: v?.makeModel || "", plate: v?.plate || "", mileageKm: v?.mileageKm || "",
          details: { customerAddress: c?.address ? c.address.split("\n") : [], vehicle: { chassisNo: v?.chassisNo, engineNo: v?.engineNo, regDate: v?.regDate } },
          groups: [],
        };
      }
    }
    crumbs(mode === "invoice" ? [["Jobs", "#/jobs"], [job.estimateNo, `#/jobs/${job.id}`], ["Make invoice"]] : [["Jobs", "#/jobs"], ["New estimate"]]);
    const d = pre?.details || {};
    const adv = d.advisor || LS.get("advisor") || {};
    const groups = pre?.groups?.length ? pre.groups : [{ request: "", lines: [] }];
    const parts = state.parts;
    const v = (x) => esc(x ?? "");
    view.innerHTML = `
      ${pageHead(mode === "invoice" ? `Make invoice from ${esc(job.estimateNo)}` : "New estimate", { back: job ? `#/jobs/${job.id}` : "#/jobs", sub: mode === "invoice" ? "Change the lines to what was actually done." : "Customer, car and the work to do." })}
      <form id="jForm" autocomplete="off" novalidate>
        ${mode === "new" && !pre ? `<div class="card finder" id="finder"><h2>Find the customer or car</h2>
          <p class="muted" style="margin:-4px 0 10px">Type a plate, name or phone. Pick the result to fill everything in.</p>
          <div class="search">${icon("search")}<input id="findQ" type="search" placeholder="Plate, name or phone" aria-label="Find customer or car" autocomplete="off" enterkeyhint="search"></div>
          <div class="rows find-res" id="findRes" aria-live="polite"></div>
          <div class="btns"><button type="button" class="btn alt" id="findNew">${icon("plus")}New customer</button></div></div>
        <div class="card picked" id="picked" hidden></div>` : ""}
        <div class="grid g2" id="jMain"${mode === "new" && !pre ? " hidden" : ""}>
          <div class="card" style="margin:0"><h2>Customer</h2>
            <label for="cName" class="req">Name</label><input id="cName" name="cName" list="custList" required value="${v(pre?.customerName)}">
            <datalist id="custList">${state.customers.map((c) => `<option value="${esc(c.name)}">${esc(c.phone)}</option>`).join("")}</datalist>
            <label for="cPhone">Phone (WhatsApp)</label><input id="cPhone" name="cPhone" type="tel" inputmode="tel" placeholder="012-345 6789" value="${v(pre?.phone)}">
            <label for="cAddress">Address (up to 2 lines)</label><textarea id="cAddress" name="cAddress" rows="2">${v((d.customerAddress || []).join("\n"))}</textarea>
          </div>
          <div class="card" style="margin:0"><h2>Car</h2>
            <div class="fgrid">
              <div><label for="regNo">Plate</label><input id="regNo" name="regNo" list="plateList" style="text-transform:uppercase" value="${v(pre?.plate)}"></div>
              <div><label for="mileageKm" class="req">Mileage (km)</label><input id="mileageKm" name="mileageKm" type="number" inputmode="numeric" min="1" required value="${v(pre?.mileageKm)}"></div>
              <div class="full"><label for="makeModel">Make &amp; model</label><input id="makeModel" name="makeModel" placeholder="e.g. Mercedes-Benz C200 (W205)" value="${v(pre?.car)}"></div>
              <div><label for="chassisNo">Chassis no</label><input id="chassisNo" name="chassisNo" style="text-transform:uppercase" autocapitalize="characters" maxlength="17" value="${v(d.vehicle?.chassisNo)}"></div>
              <div><label for="engineNo">Engine no</label><input id="engineNo" name="engineNo" style="text-transform:uppercase" value="${v(d.vehicle?.engineNo)}"></div>
              <div><label for="regDate">Reg date</label><input id="regDate" name="regDate" type="date" value="${v(d.vehicle?.regDate)}"></div>
            </div>
            <datalist id="plateList">${state.vehicles.map((x) => `<option value="${esc(x.plate)}">${esc(x.makeModel)} · ${esc(x.ownerName)}</option>`).join("")}</datalist>
          </div>
        </div>
        <datalist id="partOptions">${parts.map((p) => `<option value="${esc(p.name)}${p.partNo ? " · " + esc(p.partNo) : ""}">${rm(p.sellingPrice)} · ${p.qtyLeft} left</option>`).join("")}</datalist>
        <div class="card" style="margin-top:16px"><div class="card-h"><h2>Work</h2><div class="r">
            ${state.packages.some((x) => x.active) ? `<select id="pkgPick" aria-label="Add a package" style="min-height:34px;padding:5px 10px;font-size:14px;width:auto"><option value="">+ Add package…</option>${state.packages.filter((x) => x.active).map((x) => `<option value="${x.id}">${esc(x.name)} · ${rm(lineTotal(packageLines(x)))}</option>`).join("")}</select>` : ""}
            <button type="button" class="btn alt sm" id="addGroup">${icon("plus")}Customer request</button></div></div>
          <div id="groups">${groups.map(groupHtml).join("")}</div>
          <div class="fgrid" style="margin-top:4px"><div><label for="discount">Discount (RM)</label><input id="discount" name="discount" type="number" step="0.01" min="0" inputmode="decimal" value="${v(d.discount || "")}"></div></div>
          <details style="margin-top:6px"><summary class="muted">More details (invoice to, served by, reference numbers, dates)</summary>
            <div class="fgrid" style="margin-top:8px">
              ${mode === "invoice"
                ? `<div><label for="repairDate">Repair date</label><input id="repairDate" name="repairDate" type="date" value="${todayKL()}"></div><div><label for="dueDate">Payment due</label><input id="dueDate" name="dueDate" type="date" value="${todayKL()}"></div>`
                : `<div class="full"><label for="plannedDate">Planned repair date</label><input id="plannedDate" name="plannedDate" type="date" value="${v(d.plannedDate)}"></div>`}
              <div><label for="itName">Invoice to</label><input id="itName" name="itName" value="${v(d.invoiceTo?.name || "Service Retail Cash Sales")}"></div>
              <div><label for="itAddress">Invoice to address</label><textarea id="itAddress" name="itAddress" rows="1">${v((d.invoiceTo?.address || []).join("\n"))}</textarea></div>
              <div><label for="advName">Served by</label><input id="advName" name="advName" value="${v(adv.name)}"></div><div><label for="advId">Operator ID</label><input id="advId" name="advId" value="${v(adv.operatorId)}"></div>
              <div><label for="accountNo">Account no</label><input id="accountNo" name="accountNo" value="${v(d.accountNo)}"></div><div><label for="orderNo">Order no</label><input id="orderNo" name="orderNo" value="${v(d.orderNo)}"></div>
              <div><label for="referenceNo">Reference no</label><input id="referenceNo" name="referenceNo" value="${v(d.referenceNo)}"></div><div><label for="wipNo">WIP no</label><input id="wipNo" name="wipNo" value="${v(d.wipNo)}"></div>
              <div><label for="jobNo">Job no</label><input id="jobNo" name="jobNo" value="${v(d.jobNo)}"></div><div></div>
              <div><label for="surcharge">Surcharge (RM)</label><input id="surcharge" name="surcharge" type="number" step="0.01" min="0" value="${v(d.surcharge || "")}"></div><div><label for="menus">Menus (RM)</label><input id="menus" name="menus" type="number" step="0.01" min="0" value="${v(d.menus || "")}"></div>
            </div>
          </details>
          <div class="totbar">
            <div class="t">Parts<b id="tParts">RM 0.00</b></div><div class="t">Labour &amp; sundries<b id="tLabour">RM 0.00</b></div><div class="t" id="tDiscW" hidden>Discount<b id="tDisc">RM 0.00</b></div><div class="t grand">Grand total<b id="tGrand">RM 0.00</b></div>
            <label class="muted" style="display:flex;gap:8px;align-items:center;margin:0;font-weight:500" title="Sets the car's next service date and km from the intervals in Settings"><input type="checkbox" id="nextSvc" ${groups.some((g) => /SERVICE/i.test(g.request || "")) ? "checked" : ""} style="width:18px;min-height:18px">Set next service reminder${mode === "new" ? " (if saved as invoice)" : ""}</label>
            <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
            ${mode === "invoice"
              ? `<button class="btn" type="submit" data-as="invoice">${icon("check")}Make invoice</button>`
              : `<button class="btn alt" type="submit" data-as="invoice" title="Walk-in: the work is already done">Save as invoice</button><button class="btn" type="submit" data-as="estimate">${icon("check")}Save estimate</button>`}
            </div>
          </div>
        </div>
      </form>`;
    const form = $("#jForm");
    const box = $("#groups");

    const totals = () => {
      let p = 0, l = 0;
      $$(".item", box).forEach((el) => {
        if (el.dataset.type === "part") p += (Number($("[name=qty]", el).value) || 0) * (Number($("[name=unitPrice]", el).value) || 0);
        else l += Number($("[name=amount]", el).value) || 0;
      });
      const extra = (Number(form.surcharge.value) || 0) + (Number(form.menus.value) || 0);
      const disc = Math.min(Number(form.discount.value) || 0, p + l + extra);
      $("#tParts").textContent = rm(p);
      $("#tLabour").textContent = rm(l);
      $("#tDiscW").hidden = !disc;
      $("#tDisc").textContent = "-" + rm(disc);
      $("#tGrand").textContent = rm(r2(p + l + extra - disc));
    };

    // ---- find the customer or car first ----
    let pickedId = "";
    const norm = (s) => String(s || "").toLowerCase().replace(/\b(mr|mrs|ms|miss|encik|en|puan|pn|cik|dr|tuan|tn|haji|hj|hajah|hjh|datuk|dato|datin|tan sri|ir|sdn bhd|bhd)\b\.?/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
    const digits = (s) => String(s || "").replace(/\D/g, "");
    function findMatches(qRaw) {
      const q = norm(qRaw), pk = plateKey(qRaw), dq = digits(qRaw);
      if (!q && !pk) return [];
      const out = [], seen = new Set();
      for (const veh of state.vehicles) {
        if ((pk.length >= 2 && veh.key.includes(pk)) || (q.length >= 3 && norm(veh.makeModel).includes(q)) || (dq.length >= 4 && digits(veh.ownerPhone).includes(dq))) {
          out.push({ v: veh, c: state.customers.find((x) => x.id === veh.customerId) || null });
          if (veh.customerId) seen.add(veh.customerId);
        }
      }
      for (const c of state.customers) {
        if (seen.has(c.id)) continue;
        const n = norm(c.name);
        if ((q.length >= 2 && q.split(" ").every((w) => n.includes(w))) || (dq.length >= 4 && digits(c.phone).includes(dq))) out.push({ c, v: null });
      }
      return out.slice(0, 8);
    }
    const resHtml = (list) => list.map(({ c, v: car }, i) => {
      const st = c ? customerStats(c) : null;
      const cars = c ? state.vehicles.filter((x) => x.customerId === c.id) : [];
      const title = car ? `${plateTag(car.plate)} <b style="display:inline">${esc(car.makeModel || "Car")}</b>` : `<b>${esc(c.name)}</b>`;
      const sub = [car ? (c?.name || car.ownerName) : c.phone, c && !car ? (cars.length ? cars.map((x) => x.plate).join(", ") : "No car yet") : car?.ownerPhone,
        st ? `${st.jobs.length} visit${st.jobs.length === 1 ? "" : "s"}${st.last ? " · last " + dmy(st.last) : ""}` : "", st && st.owes > 0.009 ? `owes ${rm(st.owes)}` : ""].filter(Boolean).join(" · ");
      return `<a href="#" data-pick="${i}"><div class="grow">${title}<span>${esc(sub)}</span></div>${pill("Existing", "ok")}</a>`;
    }).join("");
    function pickResult({ c, v: car }) {
      pickedId = c?.id || car?.customerId || "";
      form.cName.value = c?.name || car?.ownerName || "";
      form.cPhone.value = c?.phone || car?.ownerPhone || "";
      form.cAddress.value = c?.address || "";
      const theCar = car || (c ? state.vehicles.filter((x) => x.customerId === c.id).sort((x, y) => (y.lastVisit || "").localeCompare(x.lastVisit || ""))[0] : null);
      if (theCar) { form.regNo.value = ""; form.makeModel.value = ""; form.chassisNo.value = ""; form.engineNo.value = ""; form.regDate.value = ""; fillCar(theCar); }
      chHint && chHint();
      const st = c ? customerStats(c) : null;
      const otherCars = c ? state.vehicles.filter((x) => x.customerId === c.id && x.key !== theCar?.key) : [];
      $("#picked").innerHTML = `<div class="card-h" style="margin-bottom:6px"><h2>${icon("check")} Existing customer</h2><div class="r"><button type="button" class="btn ghost sm" id="pickChange">Change</button></div></div>
        <div><b>${esc(form.cName.value)}</b> <span class="muted">${esc(form.cPhone.value)}</span></div>
        <div class="muted">${theCar ? `${plateTag(theCar.plate)} ${esc(theCar.makeModel || "")}${theCar.mileageKm ? " · last " + Number(theCar.mileageKm).toLocaleString("en-MY") + " km" : ""}` : "No car on file yet: fill in the car below."}</div>
        ${st ? `<div class="muted">${st.jobs.length} visit${st.jobs.length === 1 ? "" : "s"}${st.last ? " · last " + dmy(st.last) : ""}${st.owes > 0.009 ? ` · <b style="color:var(--now)">owes ${rm(st.owes)}</b>` : ""}</div>` : ""}
        ${otherCars.length ? `<div class="chips" style="margin-top:8px">${otherCars.map((x) => `<button type="button" class="chip" data-car="${esc(x.key)}">Use ${esc(x.plate)}</button>`).join("")}</div>` : ""}`;
      $("#finder").hidden = true;
      $("#picked").hidden = false;
      $("#jMain").hidden = false;
      $("#pickChange").onclick = () => { pickedId = ""; $("#picked").hidden = true; $("#finder").hidden = false; $("#findQ").focus(); };
      $$("#picked [data-car]").forEach((b) => (b.onclick = () => { const x = vehicleByKey(b.dataset.car); form.regNo.value = ""; form.makeModel.value = ""; form.chassisNo.value = ""; form.engineNo.value = ""; form.regDate.value = ""; fillCar(x); chHint && chHint(); toast(`${x.plate} selected`); }));
      form.mileageKm.focus();
    }
    if ($("#findQ")) {
      let found = [];
      const draw = () => {
        const q = $("#findQ").value.trim();
        found = findMatches(q);
        $("#findRes").innerHTML = !q ? "" : found.length ? resHtml(found)
          : `<p class="muted" style="margin:8px 0 0">No customer or car matches "${esc(q)}". Press <b>New customer</b> to add them.</p>`;
      };
      $("#findQ").addEventListener("input", draw);
      $("#findRes").addEventListener("click", (e) => { const r = e.target.closest("[data-pick]"); if (!r) return; e.preventDefault(); pickResult(found[Number(r.dataset.pick)]); });
      $("#findQ").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); if (found.length === 1) pickResult(found[0]); } });
      $("#findNew").onclick = () => {
        const q = $("#findQ").value.trim();
        $("#finder").hidden = true;
        $("#jMain").hidden = false;
        if (q) { if (plateKey(q).length >= 3 && /\d/.test(q) && /[a-z]/i.test(q) && !/\s{2,}/.test(q) && q.length <= 10) form.regNo.value = q.toUpperCase(); else if (/\d{6,}/.test(digits(q)) && digits(q).length === q.replace(/[\s-]/g, "").length) form.cPhone.value = q; else form.cName.value = q; }
        (form.cName.value ? form.cPhone : form.cName).focus();
      };
      setTimeout(() => $("#findQ").focus(), 50);
    }
    // Typed a name by hand? Offer the existing customer instead of making a duplicate.
    form.cName.insertAdjacentHTML("afterend", `<div class="rows find-res" id="nameHint" aria-live="polite"></div>`);
    const nameHint = () => {
      const q = form.cName.value.trim();
      if (pickedId || job || q.length < 3) return ($("#nameHint").innerHTML = "");
      const list = findMatches(q).filter((x) => x.c);
      $("#nameHint").innerHTML = list.length ? `<p class="hint" style="margin:6px 0 2px">Already in the DMS? Tap to use:</p>${resHtml(list.slice(0, 3))}` : "";
      $$("#nameHint [data-pick]").forEach((r) => (r.onclick = (e) => { e.preventDefault(); const it = list[Number(r.dataset.pick)]; if ($("#finder")) pickResult(it); else { pickedId = it.c.id; form.cPhone.value = it.c.phone; form.cAddress.value = it.c.address; form.cName.value = it.c.name; $("#nameHint").innerHTML = ""; } }));
    };
    form.cName.addEventListener("input", nameHint);

    form.cName.addEventListener("change", () => {
      const c = state.customers.find((x) => x.name.toLowerCase() === form.cName.value.trim().toLowerCase());
      if (!c) return;
      form.cPhone.value = c.phone;
      form.cAddress.value = c.address;
      if (!form.regNo.value) {
        const car = state.vehicles.find((x) => x.customerId === c.id) || (c.plate && vehicleByKey(plateKey(c.plate)));
        if (car) fillCar(car);
        else { form.regNo.value = c.plate; if (!form.makeModel.value) form.makeModel.value = c.car; }
      }
    });
    function fillCar(car) {
      form.regNo.value = car.plate;
      if (!form.makeModel.value) form.makeModel.value = car.makeModel;
      if (!form.chassisNo.value) form.chassisNo.value = car.chassisNo;
      if (!form.engineNo.value) form.engineNo.value = car.engineNo;
      if (!form.regDate.value) form.regDate.value = car.regDate;
      if (car.mileageKm) form.mileageKm.placeholder = `Last: ${Number(car.mileageKm).toLocaleString("en-MY")}`;
    }
    form.regNo.addEventListener("change", () => {
      const car = vehicleByKey(plateKey(form.regNo.value));
      if (!car) return;
      fillCar(car);
      if (!form.cName.value && car.ownerName) {
        form.cName.value = car.ownerName;
        form.cPhone.value = car.ownerPhone;
        const c = state.customers.find((x) => x.id === car.customerId);
        if (c) form.cAddress.value = c.address;
      }
    });
    const renumber = bindGroups(box, totals);
    const pick = $("#pkgPick");
    const chHint = () => {
      if (!$("#chHint")) return; // the help line under Chassis no was removed (Chairman's request); the package check still runs
      const raw = form.chassisNo.value.trim();
      const ch = decodeChassis(raw);
      const fit = ch ? state.packages.filter((x) => x.active && (x.fits || []).length && pkgFits(x, ch)).length : 0;
      $("#chHint").textContent = !raw ? "Needed to check that packages fit this car." : ch ? `Model ${ch.model} · variant ${ch.variant} · serial ${ch.serial}${fit ? ` · ${fit} package(s) made for this model` : ""}` : "A chassis number has 17 characters, e.g. W1K1770542N161234.";
    };
    form.chassisNo.addEventListener("input", chHint);
    chHint();
    if (pick) pick.onchange = () => {
      const pkg = state.packages.find((x) => x.id === pick.value);
      pick.value = "";
      if (!pkg) return;
      const ch = decodeChassis(form.chassisNo.value);
      if ((pkg.fits || []).length && !ch && !confirm(`${pkg.name} is for model ${fitsText(pkg.fits)}.\n\nType the chassis number first so the DMS can check it fits this car.\n\nAdd it anyway?`)) return;
      if (ch && !pkgFits(pkg, ch) && !confirm(`${pkg.name} is for model ${fitsText(pkg.fits)}, but this car's chassis number says model ${ch.model} · ${ch.variant}.\n\nThe parts may not fit. Add it anyway?`)) return;
      const gs = $$(".group", box);
      if (gs.length === 1 && !$("[name=request]", gs[0]).value.trim() && !$$(".item", gs[0]).length) gs[0].outerHTML = "";
      box.insertAdjacentHTML("beforeend", groupHtml({ request: pkg.request, lines: packageLines(pkg) }, 0));
      renumber();
      totals();
      if (pkg.setsService) $("#nextSvc").checked = true;
      toast(`${pkg.name} added`);
    };
    form.surcharge.oninput = totals;
    form.menus.oninput = totals;
    form.discount.oninput = totals;
    $("#addGroup").onclick = () => { box.insertAdjacentHTML("beforeend", groupHtml({ request: "", lines: [] }, $$(".group", box).length)); renumber(); };
    totals();

    form.onsubmit = async (e) => {
      e.preventDefault();
      const as = e.submitter?.dataset.as || "estimate";
      const name = form.cName.value.trim();
      if (!name) { toast("Customer name is needed."); return form.cName.focus(); }
      if (!(Number(form.mileageKm.value) > 0)) { toast("Mileage (km) is needed."); return form.mileageKm.focus(); }
      const cust = state.customers.find((x) => x.name.toLowerCase() === name.toLowerCase());
      const advisor = { name: form.advName.value.trim(), operatorId: form.advId.value.trim() };
      LS.set("advisor", advisor);
      const body = {
        asInvoice: as === "invoice" && mode === "new",
        nextService: $("#nextSvc").checked,
        customerId: job?.customerId || pre?.customerId || pickedId || (cust ? cust.id : ""),
        customer: { name, phone: form.cPhone.value, address: form.cAddress.value },
        vehicle: { makeModel: form.makeModel.value, regNo: form.regNo.value, mileageKm: form.mileageKm.value, chassisNo: form.chassisNo.value, engineNo: form.engineNo.value, regDate: form.regDate.value },
        invoiceTo: { name: form.itName.value, address: form.itAddress.value },
        advisor,
        accountNo: form.accountNo.value, orderNo: form.orderNo.value, referenceNo: form.referenceNo.value, wipNo: form.wipNo.value, jobNo: form.jobNo.value,
        surcharge: form.surcharge.value, menus: form.menus.value, discount: form.discount.value,
        plannedDate: form.plannedDate?.value || "",
        repairDate: form.repairDate?.value || "",
        dueDate: form.dueDate?.value || "",
        groups: $$(".group", box).map((g) => ({
          request: $("[name=request]", g).value,
          lines: readLines(g),
        })),
      };
      const btn = e.submitter;
      busy(btn, true, "Saving…");
      try {
        const out = mode === "invoice"
          ? await api(`/jobs/${job.id}/invoice`, { method: "POST", body })
          : await api("/jobs", { method: "POST", body });
        const bkId = q && q.get("booking");
        if (bkId) await api(`/bookings/${bkId}`, { method: "PATCH", body: { jobId: out.job.id, status: "Arrived" } }).catch(() => {});
        await refresh("jobs", "customers", "parts", "vehicles", "bookings");
        toast(`${docNo(out.job)} saved`);
        if (out.lowStock?.length) setTimeout(() => toast(`Stock went below 0 for: ${out.lowStock.join(", ")}`), 1800);
        location.hash = `#/jobs/${out.job.id}`;
      } catch (err) {
        toast(err.message, "err");
        busy(btn, false);
      }
    };
  }

  // ================= WORKSHOP EXTRAS =================

  const FUEL = ["E", "1/4", "1/2", "3/4", "F"];
  const INS_ST = { ok: ["OK", "ok"], soon: ["Soon", "warn"], now: ["Now", "bad"], na: ["N/A", ""] };
  const CHECKLIST = [
    ["Tyres", [["tyre_fl", "Tyre front left", "mm"], ["tyre_fr", "Tyre front right", "mm"], ["tyre_rl", "Tyre rear left", "mm"], ["tyre_rr", "Tyre rear right", "mm"], ["tyre_press", "Tyre pressures", "bar"]]],
    ["Brakes", [["pads_f", "Front brake pads", "mm"], ["pads_r", "Rear brake pads", "mm"], ["discs", "Brake discs", ""], ["brake_fluid", "Brake fluid (water %)", "%"]]],
    ["Fluids & leaks", [["oil", "Engine oil level & condition", ""], ["coolant", "Coolant level", ""], ["leak_engine", "Engine oil leaks", ""], ["leak_trans", "Gearbox / axle leaks", ""]]],
    ["Electrics", [["battery", "Battery test", "V / %"], ["lights", "Exterior lights", ""], ["dash", "Warning lights on dash", ""], ["wipers", "Wipers & washer", ""]]],
    ["Under the car", [["susp_f", "Front suspension & steering", ""], ["susp_r", "Rear suspension", ""], ["exhaust", "Exhaust", ""], ["mounts", "Engine & gearbox mounts", ""]]],
    ["Engine bay & cabin", [["belt", "Drive belt & hoses", ""], ["air_filter", "Air filter", ""], ["cabin_filter", "Cabin (AC) filter", ""], ["ac", "Air-con (vent temp)", "°C"]]],
  ];
  const partOptions = () => `<datalist id="partOptions">${state.parts.map((p) => `<option value="${esc(p.name)}${p.partNo ? " · " + esc(p.partNo) : ""}">${rm(p.sellingPrice)} · ${p.qtyLeft} left</option>`).join("")}</datalist>`;
  function replaceJob(nj) {
    const i = state.jobs.findIndex((x) => x.id === nj.id);
    if (i >= 0) state.jobs[i] = nj;
  }

  function jobExtrasHtml(j) {
    const ci = j.checkin;
    const ins = j.inspection;
    const n = (s) => (ins ? ins.items.filter((i) => i.status === s).length : 0);
    const faults = state.faults.filter((f) => f.jobId === j.id);
    const odo = ci?.odoPhotoId && j.photos[ci.odoPhotoId];
    const plate = j.plate ? ` (${j.plate})` : "";
    return `
      <div class="card"><div class="card-h"><h2>Check-in</h2><div class="r"><button type="button" class="btn ghost sm" id="ciEdit">${icon("edit")}${ci ? "Edit" : "Start"}</button></div></div>
        ${ci ? `<dl class="kv"><dt>Fuel</dt><dd>${esc(ci.fuel || "—")}</dd><dt>Keys</dt><dd>${esc(ci.keys || "—")}</dd><dt>Left in car</dt><dd>${esc(ci.items || "—")}</dd>${ci.notes ? `<dt>Notes</dt><dd>${esc(ci.notes)}</dd>` : ""}
          <dt>Odometer</dt><dd>${odo ? `<a href="${esc(odo.url)}" target="_blank" rel="noopener"><img class="thumb" src="${esc(odo.thumb)}" alt="Odometer photo"></a>` : "No photo"}</dd></dl>`
          : `<p class="muted">When the car arrives: fuel, keys, items left in the car and an odometer photo.</p>`}
      </div>
      <div class="card"><div class="card-h"><h2>Inspection</h2></div>
        ${ins ? `<div class="chips" style="margin-bottom:12px">${pill(`${n("now")} now`, "bad")}${pill(`${n("soon")} soon`, "warn")}${pill(`${n("ok")} OK`, "ok")}</div>` : `<p class="muted">Tyres, brakes, fluids, battery and more, with photos. The customer gets a report without prices.</p>`}
        <div class="stack"><a class="btn alt block" href="#/jobs/${j.id}/inspection">${icon("clipboard")}${ins ? "Open checklist" : "Start inspection"}</a>
        ${ins && j.inspectionToken ? `<a class="btn wa block" href="${esc(waLink(j.phone, `Hi ${j.customerName}, here is the inspection report for your car${plate} from ${brandName()}:\n${docLink(j.inspectionToken)}`))}" target="_blank" rel="noopener">${icon("chat")}Send report</a>
          <a class="btn ghost block" href="${esc(docLink(j.inspectionToken))}" target="_blank" rel="noopener">${icon("open")}Open report</a>` : ""}</div>
      </div>
      ${(() => {
        const ords = state.partorders.filter((o) => o.jobId === j.id && o.status !== "Cancelled");
        return `<div class="card"><div class="card-h"><h2>Parts on order</h2><div class="r"><button type="button" class="btn ghost sm" id="poAdd">${icon("plus")}Order part</button></div></div>
          ${ords.length ? `<div class="rows">${ords.map((o) => `<a href="#/orders" data-pord="${o.id}"><div class="grow"><b>${esc(o.part)}</b><span class="muted">${esc([o.supplier, o.eta ? "expected " + dmy(o.eta) : ""].filter(Boolean).join(" · "))}</span></div>${pill(o.status, ORD_CLS[o.status])}</a>`).join("")}</div>` : `<p class="muted">Track parts you ordered for this car until they arrive.</p>`}</div>`;
      })()}
      <div class="card"><div class="card-h"><h2>Fault case</h2><div class="r"><button type="button" class="btn ghost sm" id="fcAdd">${icon("plus")}Record</button></div></div>
        ${faults.length ? `<div class="rows">${faults.map((f) => `<a href="#/faults" data-fc="${f.id}"><div class="grow"><b>${esc(f.title)}</b><span class="muted">${esc(f.cause || "Cause not written yet")}</span></div>${f.verified ? pill("Verified", "ok") : ""}</a>`).join("")}</div>`
          : `<p class="muted">What was wrong and how you fixed it. It builds your Mercedes knowledge base.</p>`}
      </div>`;
  }

  function bindJobExtras(j) {
    $("#ciEdit").onclick = () => checkinDialog(j);
    $("#fcAdd").onclick = () => faultDialog(null, j);
    $$("[data-fc]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); faultDialog(state.faults.find((f) => f.id === a.dataset.fc)); }));
    const pc = $("#jPrint");
    if (pc) pc.onclick = () => printJobCard(j);
  }

  function checkinDialog(j) {
    const ci = j.checkin || {};
    let fuel = ci.fuel || "";
    const m = modal("Check-in", `
      <label>Fuel level</label><div class="seg" id="ciFuel" role="group" aria-label="Fuel level">${FUEL.map((f) => `<button type="button" class="${f === fuel ? "on" : ""}" data-f="${f}">${f}</button>`).join("")}</div>
      <div class="fgrid"><div><label for="ciKeys">Keys received</label><input id="ciKeys" value="${esc(ci.keys || "")}" placeholder="e.g. 1 key + spare"></div>
        <div><label for="ciItems">Items left in the car</label><input id="ciItems" value="${esc(ci.items || "")}" placeholder="e.g. child seat, umbrella"></div></div>
      <label for="ciNotes">Notes</label><textarea id="ciNotes" rows="2" placeholder="What the customer said, anything unusual">${esc(ci.notes || "")}</textarea>
      <div class="btns"><label class="btn alt upload">${icon("camera")}<span id="ciOdoL">${ci.odoPhotoId ? "Replace odometer photo" : "Odometer photo"}</span><input type="file" id="ciOdo" accept="image/*" capture="environment"></label></div>
      <p class="hint">Scratches and dents go on the car's <a href="#/vehicles/${plateKey(j.plate)}/condition?job=${encodeURIComponent(docNo(j))}">Body condition</a> page.</p>
      <div class="btns"><button type="button" class="btn" id="ciSave">${icon("check")}Save check-in</button></div>`);
    let file = null;
    m.$("#ciFuel").onclick = (e) => {
      const b = e.target.closest("[data-f]");
      if (!b) return;
      fuel = b.dataset.f;
      $$("#ciFuel button", m.el).forEach((x) => x.classList.toggle("on", x === b));
    };
    m.$("#ciOdo").onchange = async (e) => { file = await shrink(e.target.files[0]); m.$("#ciOdoL").textContent = file ? "Photo added ✓" : "Odometer photo"; };
    m.$("#ciSave").onclick = async (e) => {
      const fd = new FormData();
      if (file) fd.append("file", file);
      fd.append("data", JSON.stringify({ fuel, keys: m.$("#ciKeys").value, items: m.$("#ciItems").value, notes: m.$("#ciNotes").value }));
      busy(e.currentTarget, true, "Saving…");
      try {
        replaceJob(await api(`/jobs/${j.id}/checkin`, { method: "POST", form: fd }));
        m.close();
        toast("Check-in saved");
        pageJob(j.id);
      } catch (err) {
        toast(err.message, "err");
        busy(e.currentTarget, false);
      }
    };
  }

  function faultDialog(f, j) {
    const car = j ? vehicleByKey(plateKey(j.plate)) : null;
    const d = f || { makeModel: j?.car || "", engine: car?.engine || "", mileageKm: j?.mileageKm || "", docNo: j ? docNo(j) : "", plate: j?.plate || "", jobId: j?.id || "", date: todayKL() };
    const ta = (k, label, ph, rows = 2) => `<label for="f_${k}">${label}</label><textarea id="f_${k}" name="${k}" rows="${rows}" placeholder="${ph}">${esc(d[k] || "")}</textarea>`;
    const m = modal(f ? "Fault case" : "Record fault case", `<form id="ff" novalidate>
      <div class="fgrid"><div class="full"><label for="f_title">Title</label><input id="f_title" name="title" value="${esc(d.title || "")}" placeholder="Leave empty: made from the car and the symptom"></div>
        <div><label for="f_makeModel">Make &amp; model</label><input id="f_makeModel" name="makeModel" value="${esc(d.makeModel)}"></div>
        <div><label for="f_engine">Engine</label><input id="f_engine" name="engine" value="${esc(d.engine || "")}" placeholder="e.g. M274, OM651"></div>
        <div><label for="f_mileageKm">Mileage (km)</label><input id="f_mileageKm" name="mileageKm" type="number" inputmode="numeric" value="${esc(d.mileageKm ?? "")}"></div>
        <div><label for="f_hours">Hours spent</label><input id="f_hours" name="hours" type="number" step="0.1" inputmode="decimal" value="${esc(d.hours ?? "")}"></div></div>
      ${ta("symptom", "Symptom (what the customer noticed)", "e.g. Coolant level drops, no visible leak")}
      ${ta("codes", "Fault codes", "e.g. P0128, 2B9A00", 1)}
      ${ta("tests", "Tests done", "e.g. Pressure test 1.4 bar for 15 min, UV dye")}
      ${ta("cause", "Root cause", "e.g. Water pump seal weeping when hot")}
      ${ta("fix", "Fix", "e.g. Replaced water pump and thermostat, bled the system")}
      ${ta("parts", "Parts used", "e.g. water pump, thermostat, coolant", 1)}
      <div class="fgrid"><div><label for="f_tags">Tags</label><input id="f_tags" name="tags" value="${esc(d.tags || "")}" placeholder="cooling, W205"></div>
        <div><label style="display:flex;gap:8px;align-items:center;margin-top:36px"><input type="checkbox" name="verified" ${d.verified ? "checked" : ""} style="width:20px;min-height:20px">Fix verified (car checked after)</label></div></div>
      ${d.docNo ? `<p class="hint">Job ${esc(d.docNo)}. No customer names are kept here, so this can feed the Workshop Datahub.</p>` : ""}
      <div class="btns"><button class="btn" type="submit">${icon("check")}Save</button></div></form>`, { wide: true });
    m.$("#ff").onsubmit = async (e) => {
      e.preventDefault();
      const b = formObj(e.target);
      b.verified = e.target.elements.verified.checked;
      if (!f) Object.assign(b, { jobId: d.jobId, plate: d.plate, docNo: d.docNo, date: d.date });
      busy(e.submitter, true, "Saving…");
      try {
        if (f) await api(`/faults/${f.id}`, { method: "PATCH", body: b });
        else await api("/faults", { method: "POST", body: b });
        await refresh("faults");
        m.close();
        toast("Fault case saved");
        route();
      } catch (err) {
        toast(err.message, "err");
        busy(e.submitter, false);
      }
    };
  }

  function pageFaults() {
    crumbs([["Fault cases"]]);
    view.innerHTML = `${pageHead("Fault cases", { sub: "Your Mercedes knowledge base: symptom → cause → fix", acts: `<button class="btn" id="fcNew">${icon("plus")}New fault case</button>` })}
      <div class="toolbar"><div class="search">${icon("search")}<input id="fq" type="search" placeholder="Search symptom, code, model, engine, cause" aria-label="Search fault cases"></div></div>
      <div id="fl"></div>`;
    const draw = () => {
      const words = $("#fq").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const list = state.faults.filter((f) => {
        const hay = `${f.title} ${f.makeModel} ${f.engine} ${f.symptom} ${f.codes} ${f.tests} ${f.cause} ${f.fix} ${f.parts} ${f.tags}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      });
      $("#fl").innerHTML = list.length
        ? `<div class="grid g2">${list.map((f) => `<a class="card" style="display:block;text-decoration:none;color:inherit;margin:0" data-fc="${f.id}" href="#/faults">
            <div class="card-h" style="margin-bottom:4px"><h2>${esc(f.title)}</h2><div class="r">${f.verified ? pill("Verified", "ok") : pill("Not verified")}</div></div>
            <div class="muted">${esc([f.makeModel, f.engine, f.mileageKm ? km(f.mileageKm) : "", dmy(f.date)].filter(Boolean).join(" · "))}</div>
            ${f.codes ? `<div class="chips" style="margin:8px 0 0">${f.codes.split(/[\s,;]+/).filter(Boolean).slice(0, 6).map((c) => `<span class="pill info">${esc(c)}</span>`).join("")}</div>` : ""}
            <dl class="kv" style="margin-top:10px"><dt>Symptom</dt><dd>${esc(f.symptom) || "—"}</dd><dt>Cause</dt><dd>${esc(f.cause) || "—"}</dd><dt>Fix</dt><dd>${esc(f.fix) || "—"}</dd></dl></a>`).join("")}</div>`
        : `<div class="card">${emptyBox("book", state.faults.length ? "No fault case matches." : "No fault cases yet. Record one from a job page, or press New fault case.")}</div>`;
      $$("#fl [data-fc]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); faultDialog(state.faults.find((x) => x.id === a.dataset.fc)); }));
    };
    $("#fq").oninput = draw;
    $("#fcNew").onclick = () => faultDialog(null, null);
    draw();
  }

  // ---------- Merc HUB: diagnosis database ----------
  // Every fault the workshop has solved, searchable by model (chassis code),
  // fault code and symptom. Built from the fault cases, with no customer names
  // or plates, so it can later be shared as the Merc HUB across workshops.

  const chassisOf = (s) => (String(s || "").toUpperCase().match(/\b[WXCRSAVH]\d{3}\b/g) || [""]).pop(); // last match: "C200 W205" → W205
  const codesOf = (s) => [...new Set(String(s || "").toUpperCase().split(/[\s,;/|]+/).filter((c) => /^[PBCU][0-9A-F]{4}(-[0-9A-F]{2,3})?$/.test(c) || /^[0-9A-F]{4,6}-[0-9A-F]{2,3}$/.test(c)))];

  function hubCase(f) {
    // The shareable form: no plate, job or customer, mileage rounded to 5,000 km.
    return { model: f.makeModel, chassis: chassisOf(`${f.makeModel} ${f.title}`), engine: f.engine, mileageBand: f.mileageKm ? `${Math.floor(f.mileageKm / 5000) * 5}k km` : "",
      symptom: f.symptom, codes: codesOf(f.codes), tests: f.tests, cause: f.cause, fix: f.fix, parts: f.parts, hours: f.hours, tags: f.tags, verified: f.verified, year: (f.date || "").slice(0, 4) };
  }

  function pageHub(q) {
    crumbs([["Merc HUB"]]);
    let model = q.get("m") || "";
    let verifiedOnly = q.get("v") === "1";
    const all = state.faults.map((f) => ({ f, h: hubCase(f) }));
    const models = {};
    const codes = {};
    for (const { h } of all) {
      if (h.chassis) models[h.chassis] = (models[h.chassis] || 0) + 1;
      for (const c of h.codes) codes[c] = (codes[c] || 0) + 1;
    }
    view.innerHTML = `${pageHead("Merc HUB", { sub: "Diagnosis database: symptom → codes → tests → cause → fix, by Mercedes model", acts: `<button type="button" class="btn alt" id="hubExport">${icon("download")}Export for HUB</button><button class="btn" id="hubNew">${icon("plus")}New fault case</button>` })}
      <div class="grid g4" style="margin-bottom:16px">
        <div class="tile"><div class="lbl">${icon("layers")}Cases</div><div class="val">${all.length}</div><div class="foot">fault cases recorded</div></div>
        <div class="tile"><div class="lbl">${icon("check")}Verified</div><div class="val">${all.filter((x) => x.h.verified).length}</div><div class="foot">fix confirmed on the car</div></div>
        <div class="tile"><div class="lbl">${icon("car")}Models</div><div class="val">${Object.keys(models).length}</div><div class="foot">chassis codes covered</div></div>
        <div class="tile"><div class="lbl">${icon("fault")}Fault codes</div><div class="val">${Object.keys(codes).length}</div><div class="foot">different codes logged</div></div></div>
      <div class="split"><div>
        <div class="toolbar"><div class="search">${icon("search")}<input id="hq" type="search" placeholder="Symptom, fault code, model, part" aria-label="Search the diagnosis database" value="${esc(q.get("q") || "")}"></div>
          <label class="chip" style="margin:0"><input type="checkbox" id="hv" ${verifiedOnly ? "checked" : ""} style="width:auto;min-height:0;margin:0"> Verified only</label></div>
        <div class="chips scroll" id="hm" style="margin-bottom:14px"><button type="button" class="chip" data-m="">All models</button>${Object.entries(models).sort((a, b) => b[1] - a[1]).map(([m, n]) => `<button type="button" class="chip" data-m="${esc(m)}">${esc(m)} <span class="n">${n}</span></button>`).join("")}</div>
        <div id="hl"></div></div>
        <div class="stack">
          <div class="card"><div class="card-h"><h2>Most seen fault codes</h2></div>${Object.keys(codes).length ? `<div class="rows">${Object.entries(codes).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, n]) => `<a href="#/hub?q=${encodeURIComponent(c)}"><div class="grow"><b>${esc(c)}</b><span>${n} case${n === 1 ? "" : "s"}</span></div>${icon("cr", "s")}</a>`).join("")}</div>` : `<p class="muted">Codes appear here as you record fault cases with their codes.</p>`}</div>
          <div class="card"><div class="card-h"><h2>About Merc HUB</h2></div>
            <p class="muted" style="margin-top:0">The Merc HUB (Workshop Diagnostic Network) is the diagnosis database we are building for independent Mercedes-Benz workshops. Each solved job becomes a case: what the customer noticed, the codes, the tests, the root cause and the fix.</p>
            <div class="rows">
              <div><span class="mini">${icon("check")}</span><div class="grow"><b>Stage 1 · now</b><span>Our own cases, searchable here</span></div>${pill("Live", "ok")}</div>
              <div><span class="mini">${icon("layers")}</span><div class="grow"><b>Stage 2 · shared HUB</b><span>Anonymised cases from partner workshops</span></div>${pill("Planned")}</div>
              <div><span class="mini">${icon("sparkle")}</span><div class="grow"><b>Stage 3 · AI diagnosis</b><span>Likely causes suggested from symptoms and codes</span></div>${pill("Planned")}</div></div>
            <p class="hint">No customer names, plates or prices ever leave the DMS. "Export for HUB" downloads the anonymised cases.</p></div></div></div>`;
    const draw = () => {
      $$("#hm [data-m]").forEach((b) => b.classList.toggle("on", b.dataset.m === model));
      const words = $("#hq").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const list = all.filter(({ f, h }) => (!model || h.chassis === model) && (!verifiedOnly || h.verified) && words.every((w) => `${f.title} ${f.makeModel} ${f.engine} ${f.symptom} ${f.codes} ${f.tests} ${f.cause} ${f.fix} ${f.parts} ${f.tags}`.toLowerCase().includes(w)));
      $("#hl").innerHTML = list.length
        ? `<div class="stack">${list.map(({ f, h }) => `<a class="card" style="display:block;text-decoration:none;color:inherit" data-fc="${f.id}" href="#/hub">
            <div class="card-h" style="margin-bottom:6px"><h2>${esc(f.title)}</h2><div class="r">${h.verified ? pill("Verified", "ok") : pill("Not verified")}</div></div>
            <div class="row wrap" style="margin-bottom:8px">${h.chassis ? `<span class="pill ink plain">${esc(h.chassis)}</span>` : ""}<span class="muted">${esc([f.makeModel, f.engine, h.mileageBand, h.year].filter(Boolean).join(" · "))}</span>${h.codes.map((c) => `<span class="pill info plain">${esc(c)}</span>`).join("")}</div>
            <dl class="kv"><dt>Symptom</dt><dd>${esc(f.symptom) || "—"}</dd>${f.tests ? `<dt>Tests</dt><dd>${esc(f.tests)}</dd>` : ""}<dt>Cause</dt><dd>${esc(f.cause) || "—"}</dd><dt>Fix</dt><dd>${esc(f.fix) || "—"}</dd>${f.parts ? `<dt>Parts</dt><dd>${esc(f.parts)}</dd>` : ""}</dl></a>`).join("")}</div>`
        : `<div class="card">${emptyBox("layers", all.length ? "No case matches. Try fewer words or another model." : "No cases yet. Record a fault case on a job (what was wrong and how you fixed it) and it appears here.")}</div>`;
      $$("#hl [data-fc]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); faultDialog(state.faults.find((x) => x.id === a.dataset.fc)); }));
    };
    $("#hq").oninput = draw;
    $("#hv").onchange = () => { verifiedOnly = $("#hv").checked; draw(); };
    $("#hm").onclick = (e) => {
      const b = e.target.closest("[data-m]");
      if (!b) return;
      model = b.dataset.m;
      draw();
    };
    $("#hubNew").onclick = () => faultDialog(null, null);
    $("#hubExport").onclick = () => {
      const blob = new Blob([JSON.stringify({ hub: "Merc HUB", version: 1, format: "Workshop Diagnostic Network cases", source: "The Merc Lab", exported: todayKL(), cases: all.map(({ h }, i) => ({ case_number: `ML-${todayKL().slice(0, 4)}-${String(i + 1).padStart(4, "0")}`, case_date: h.year, vehicle_model: h.model, model_series: h.chassis, engine: h.engine, mileage: h.mileageBand, fault_codes: h.codes.join(", "), symptom: h.symptom, diagnosis_steps: h.tests, root_cause: h.cause, fix_applied: h.fix, parts_used: h.parts, time_spent_hours: h.hours, status: h.verified ? "Resolved" : "Open", notes: h.tags })) }, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `merc-hub-cases-${todayKL()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    draw();
  }

  // ---------- Merc Lab Assistant + the AI team ----------
  // Read-only: the Assistant answers from the records and drafts; the owner acts.

  const AI_TEAM = [
    ["ML-CEO", "Kazumi", "CEO", "The overall picture and what to focus on today", "dashboard", ["How is the workshop doing this month?", "What should I focus on today?"]],
    ["ML-COO", "COO", "Operations", "Cars in the workshop, parts waiting, bookings", "jobs", ["Which cars are waiting for parts?", "What is booked this week?"]],
    ["ML-CFO", "CFO", "Finance", "Money in, who owes, expenses, profit", "money", ["Who owes us money and for how long?", "What did we spend most on this month?"]],
    ["ML-CRM", "Customer CRM", "Customers", "Follow-ups, service reminders, win-backs", "users", ["Who should I follow up today?", "Which cars are due for service soon?"]],
    ["ML-TEC", "Technical", "Merc HUB", "Fault cases and the diagnosis database", "layers", ["What faults have we fixed on W205 cars?", "Which fault codes come up most?"]],
  ];
  const assistantLog = [];

  function assistantContext() {
    const today = todayKL();
    const month = periodRange("m:" + today.slice(0, 7));
    const x = pnlFor(month);
    const in7 = new Date(Date.parse(today) + 7 * 864e5).toISOString().slice(0, 10);
    return {
      today,
      workshop: state.jobs.filter(isWorkshop).map((j) => ({ no: docNo(j), stage: j.stage, status: j.status, car: j.car, plate: j.plate, customer: j.customerName, total: j.total })),
      openEstimates: state.jobs.filter((j) => j.estimateNo && !j.invoiceNo && j.status !== "Cancelled").slice(0, 40).map((j) => ({ no: j.estimateNo, date: j.date, customer: j.customerName, car: j.car, total: j.total, status: j.status, approvedOnline: !!j.approvedAt })),
      owed: owedInvoices().map((j) => ({ no: j.invoiceNo, date: j.invoiceDate, customer: j.customerName, balance: j.balance, total: j.total })),
      thisMonth: { netSales: x.net, grossProfit: x.gross, runningCosts: x.expenses, netProfit: x.profit, invoices: x.invs.length, cashIn: x.cashIn, costsByCategory: x.cats },
      recentInvoices: state.jobs.filter((j) => j.invoiceNo).sort((a, b) => (b.invoiceDate || "").localeCompare(a.invoiceDate || "")).slice(0, 40).map((j) => ({ no: j.invoiceNo, date: j.invoiceDate, customer: j.customerName, car: j.car, total: j.total, balance: j.balance, status: j.status })),
      recentPayments: state.payments.slice(0, 30).map((p) => ({ no: p.receiptNo, date: p.paidOn, customer: p.customerName, amount: p.amount, method: p.method, for: p.docNo })),
      bookingsNext7Days: state.bookings.filter((b) => b.date >= today && b.date <= in7).map((b) => ({ date: b.date, time: b.time, customer: b.customerName, plate: b.plate, work: b.work, status: b.status })),
      followUpsDue: state.customers.filter((c) => c.nextFollowUp && c.nextFollowUp <= in7).map((c) => ({ customer: c.name, due: c.nextFollowUp, note: c.followUpNote })),
      serviceDue: state.vehicles.filter((v) => v.nextServiceDate && v.nextServiceDate <= new Date(Date.parse(today) + 30 * 864e5).toISOString().slice(0, 10)).map((v) => ({ plate: v.plate, car: v.makeModel, owner: v.ownerName, due: v.nextServiceDate })),
      lowStock: state.parts.filter((p) => Number(p.qtyLeft) <= 1).map((p) => ({ part: p.name, partNo: p.partNo, left: p.qtyLeft })),
      expensesThisMonth: state.expenses.filter((e) => inRange(e.date, month)).map((e) => ({ date: e.date, description: e.description, category: e.category, amount: e.amount })),
      faultCases: state.faults.slice(0, 80).map((f) => ({ title: f.title, model: f.makeModel, engine: f.engine, codes: f.codes, symptom: f.symptom, cause: f.cause, fix: f.fix, verified: f.verified })),
      supplierBillsUnpaid: state.purchases.filter((p) => p.status === "Unpaid").map((p) => ({ ref: p.ref, supplier: p.supplier, date: p.date, total: p.total })),
    };
  }

  function morningBrief() {
    const today = todayKL();
    const owed = owedInvoices();
    const late = owed.filter((j) => (Date.parse(today) - Date.parse(j.invoiceDate)) / 864e5 > 30);
    const ready = state.jobs.filter((j) => isWorkshop(j) && j.stage === "Ready");
    const waiting = state.jobs.filter((j) => isWorkshop(j) && j.stage === "Waiting parts");
    const bks = state.bookings.filter((b) => b.date === today && b.status !== "Cancelled");
    const fus = state.customers.filter((c) => c.nextFollowUp && c.nextFollowUp <= today);
    const low = state.parts.filter((p) => Number(p.qtyLeft) <= 0);
    const ib = inboxNew();
    const items = [
      late.length && ["now", "alert", `${rm(sum(late, (j) => j.balance))} overdue over 30 days`, `${late.length} invoice(s): ${late.slice(0, 2).map((j) => j.customerName).join(", ")}`, "#/money?tab=owed"],
      ready.length && ["ok", "check", `${ready.length} car(s) ready for pickup`, ready.map((j) => j.plate || j.customerName).join(", "), "#/jobs?f=workshop"],
      waiting.length && ["soon", "clock", `${waiting.length} car(s) waiting for parts`, waiting.map((j) => j.plate || j.customerName).join(", "), "#/orders"],
      bks.length && ["info", "calendar", `${bks.length} booking(s) today`, bks.map((b) => `${b.time || ""} ${b.customerName}`.trim()).join(", "), "#/bookings"],
      fus.length && ["info", "phone", `${fus.length} follow-up(s) due`, fus.slice(0, 3).map((c) => c.name).join(", "), "#/followups"],
      low.length && ["soon", "parts", `${low.length} part(s) out of stock`, low.slice(0, 3).map((p) => p.name).join(", "), "#/parts"],
      ib && ["info", "inbox", `${ib} new item(s) in the WhatsApp inbox`, "Bills and slips to check and save", "#/inbox"],
    ].filter(Boolean);
    return items.length
      ? `<div class="list" style="border:0;background:none;box-shadow:none">${items.map(([c, ic, t, s, h]) => `<a class="todo" href="${h}"><span class="ai ${c}">${icon(ic)}</span><div style="min-width:0"><b>${esc(t)}</b><span>${esc(s)}</span></div>${icon("cr", "s")}</a>`).join("")}</div>`
      : `<p class="muted">${icon("check")} Nothing needs you right now.</p>`;
  }

  function pageAssistant() {
    crumbs([["Assistant"]]);
    let role = "ML-CEO";
    view.innerHTML = `${pageHead("Assistant", { sub: "Ask about your workshop. It reads your DMS records and never changes them." })}
      <div class="split"><div class="stack">
        <div class="card"><div class="card-h"><h2>${icon("sun")} Morning brief</h2><div class="r"><span class="muted">${dmy(todayKL())}</span></div></div>${morningBrief()}</div>
        <div class="card"><div class="card-h"><h2>${icon("sparkle")} Ask</h2></div>
          <div class="seg" id="asRole" style="flex-wrap:wrap;margin-bottom:12px">${AI_TEAM.map(([id, n]) => `<button type="button" data-r="${id}">${esc(n)}</button>`).join("")}</div>
          <form id="asF"><label for="asQ" class="sr">Your question</label><textarea id="asQ" rows="3" maxlength="500" placeholder="e.g. Who owes us money and for how long?"></textarea>
            <div class="chips" id="asSug" style="margin-top:10px"></div>
            <div class="btns"><button class="btn" type="submit" id="asGo">${icon("send")}Ask</button></div></form>
          <p class="hint" id="asStat"></p></div>
        <div id="asLog" class="stack"></div></div>
        <div class="stack">
          <div class="card"><div class="card-h"><h2>Your AI team</h2></div>
            <p class="muted" style="margin-top:0">The Merc Lab team from your Command Center. Each one knows this DMS and answers here from its own angle.</p>
            <div class="rows">${AI_TEAM.map(([id, n, r, what, ic]) => `<div><span class="mini">${icon(ic)}</span><div class="grow"><b>${esc(n)} <span class="pill plain">${esc(id)}</span></b><span>${esc(r)} · ${esc(what)}</span></div></div>`).join("")}</div></div>
          <div class="card"><div class="card-h"><h2>${icon("shield")} Safe by design</h2></div>
            <div class="rows">
              <div><div class="grow"><b>Reads only</b><span>It cannot save, send, pay or delete anything</span></div></div>
              <div><div class="grow"><b>You decide</b><span>It tells you what to press; you do it</span></div></div>
              <div><div class="grow"><b>Shows its sources</b><span>Every answer lists the records it used</span></div></div>
              <div><div class="grow"><b>Daily limit</b><span>A cap on questions per day keeps AI costs small</span></div></div></div></div></div></div>`;
    const drawRole = () => {
      $$("#asRole button").forEach((b) => b.classList.toggle("on", b.dataset.r === role));
      const t = AI_TEAM.find((a) => a[0] === role);
      $("#asSug").innerHTML = t[5].map((s) => `<button type="button" class="chip" data-s="${esc(s)}">${esc(s)}</button>`).join("");
    };
    const drawLog = () => {
      $("#asLog").innerHTML = assistantLog.map((e) => `<div class="card"><div class="muted" style="margin-bottom:6px">${esc(AI_TEAM.find((a) => a[0] === e.role)?.[1] || "Assistant")} · ${esc(e.q)}</div>
        ${e.err ? `<div class="notice bad">${icon("alert")}<div>${esc(e.err)}</div></div>` : e.a === null ? `<p class="muted">Thinking…</p>` : `<div style="white-space:pre-wrap">${esc(e.a)}</div>${e.src && e.src.length ? `<div class="chips" style="margin-top:10px">${e.src.map((s) => `<span class="pill line plain">${esc(s)}</span>`).join("")}</div>` : ""}`}</div>`).join("");
    };
    $("#asRole").onclick = (e) => {
      const b = e.target.closest("[data-r]");
      if (b) { role = b.dataset.r; drawRole(); }
    };
    $("#asSug").onclick = (e) => {
      const b = e.target.closest("[data-s]");
      if (b) { $("#asQ").value = b.dataset.s; $("#asF").requestSubmit(); }
    };
    $("#asF").onsubmit = async (e) => {
      e.preventDefault();
      const q = $("#asQ").value.trim();
      if (!q) return $("#asQ").focus();
      const entry = { q, role, a: null };
      assistantLog.unshift(entry);
      drawLog();
      busy($("#asGo"), true, "Asking…");
      try {
        const out = await api("/assistant/ask", { method: "POST", body: { question: q, role, context: assistantContext() } });
        entry.a = out.answer;
        entry.src = out.sources;
        $("#asQ").value = "";
      } catch (err) {
        entry.err = err.message;
      }
      busy($("#asGo"), false);
      drawLog();
    };
    api("/assistant/status").then((s) => { $("#asStat").textContent = s.on ? `${s.usedToday} of ${s.cap} questions used today.` : "The Assistant is switched off or not set up (needs the Gemini key)."; }).catch(() => {});
    drawRole();
    drawLog();
  }

  function pagePackages() {
    crumbs([["Packages"]]);
    view.innerHTML = `${pageHead("Packages", { sub: "Ready-made jobs. One tap adds them to an estimate.", acts: `<a class="btn" href="#/packages/new">${icon("plus")}New package</a>` })}
      <div class="card flush">${state.packages.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Package</th><th class="d">Customer request</th><th class="num d">Lines</th><th class="num">Price now</th><th>Status</th></tr></thead><tbody>
        ${state.packages.map((p) => `<tr class="tap" data-href="#/packages/${p.id}"><td><a class="strong" style="color:inherit;text-decoration:none" href="#/packages/${p.id}">${esc(p.name)}</a><div class="sm">${(p.fits || []).length ? `Fits ${esc(fitsText(p.fits))}` : "Any model"}${p.setsService ? " · sets next service" : ""}</div></td>
          <td class="d">${esc(p.request)}</td><td class="num d">${p.lines.length}</td><td class="num strong">${rm(lineTotal(packageLines(p)))}</td><td>${p.active ? pill("Active", "ok") : pill("Hidden")}</td></tr>`).join("")}</tbody></table></div>`
        : emptyBox("box", "No packages yet. Make one for each job you do often: Service A, Service B, front brake pads, gearbox oil change…")}</div>`;
  }

  function packageForm(id) {
    const p = id === "new" ? { name: "", request: "", lines: [], active: true, setsService: false, notes: "", fits: [] } : state.packages.find((x) => x.id === id);
    if (!p) return (location.hash = "#/packages");
    crumbs([["Packages", "#/packages"], [p.name || "New package"]]);
    const chk = (name, on, label) => `<label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" name="${name}" ${on ? "checked" : ""} style="width:20px;min-height:20px">${label}</label>`;
    view.innerHTML = `${pageHead(id === "new" ? "New package" : esc(p.name), { back: "#/packages" })}${partOptions()}
      <form id="pkf" novalidate><div class="card"><div class="fgrid">
        <div><label for="pk_name" class="req">Package name</label><input id="pk_name" name="pname" value="${esc(p.name)}" placeholder="e.g. Service B (petrol)"></div>
        <div><label for="pk_notes">Notes (only you see this)</label><input id="pk_notes" name="notes" value="${esc(p.notes)}"></div>
        <div class="full"><label for="pk_fits">Fits models (from the chassis number)</label><input id="pk_fits" name="fits" inputmode="numeric" value="${esc((p.fits || []).join(", "))}" placeholder="e.g. 177 for every W177, or 1770542 for the A45 S only"></div>
        <div class="full">${chk("setsService", p.setsService, "This is a service: set the car's next service reminder when invoiced")}</div>
        <div class="full">${chk("active", p.active, "Show in the estimate's package list")}</div>
      </div></div>
      <div class="card"><h2>Request and lines</h2><p class="muted" style="margin:-6px 0 6px">Parts picked from stock always use today's selling price.</p>
        <div id="groups">${groupHtml({ request: p.request, lines: packageLines(p) }, 0)}</div>
        <div class="totbar"><div class="t grand">Package price now<b id="pkT">RM 0.00</b></div><div style="margin-left:auto"><button class="btn" type="submit">${icon("check")}Save package</button></div></div></div></form>`;
    const box = $("#groups");
    const tot = () => ($("#pkT").textContent = rm(lineTotal(readLines(box))));
    bindGroups(box, tot);
    $(".gx", box).hidden = true;
    tot();
    $("#pkf").onsubmit = async (e) => {
      e.preventDefault();
      const el = e.target.elements;
      const body = { name: el.pname.value, notes: el.notes.value, fits: el.fits.value, setsService: el.setsService.checked, active: el.active.checked, request: $("[name=request]", box).value, lines: readLines(box) };
      busy(e.submitter, true, "Saving…");
      try {
        if (id === "new") await api("/packages", { method: "POST", body });
        else await api(`/packages/${id}`, { method: "PATCH", body });
        await refresh("packages");
        toast("Package saved");
        location.hash = "#/packages";
      } catch (err) {
        toast(err.message, "err");
        busy(e.submitter, false);
      }
    };
  }

  function pageInspection(id) {
    const j = state.jobs.find((x) => x.id === id);
    if (!j) return (location.hash = "#/jobs");
    crumbs([["Jobs", "#/jobs"], [docNo(j), `#/jobs/${j.id}`], ["Inspection"]]);
    const saved = new Map((j.inspection?.items || []).map((i) => [i.key, i]));
    const items = CHECKLIST.flatMap(([g, list]) => list.map(([key, label, unit]) => ({ key, group: g, label, unit, status: "", value: "", note: "", photoIds: [], ...(saved.get(key) || {}) })));
    const segBtns = (it) => ["ok", "soon", "now", "na"].map((st) => `<button type="button" data-s="${st}" class="${it.status === st ? "on s-" + st : ""}" aria-pressed="${it.status === st}">${INS_ST[st][0]}</button>`).join("");
    const row = (it) => `<div class="insrow" data-key="${it.key}">
        <div class="ih"><b>${esc(it.label)}</b><div class="seg st" role="group" aria-label="${esc(it.label)}">${segBtns(it)}</div></div>
        <div class="ib"><input name="value" placeholder="${it.unit ? `Reading (${esc(it.unit)})` : "Reading"}" value="${esc(it.value)}" aria-label="${esc(it.label)} reading">
          <input name="note" placeholder="Note" value="${esc(it.note)}" aria-label="${esc(it.label)} note">
          <label class="btn alt sm upload" aria-label="Add photo for ${esc(it.label)}">${icon("camera")}<span class="pc">${it.photoIds.length || ""}</span><input type="file" accept="image/*" capture="environment"></label></div>
        <div class="phs">${it.photoIds.map((pid) => (j.photos[pid] ? `<img class="thumb" src="${esc(j.photos[pid].thumb)}" alt="">` : "")).join("")}</div>
      </div>`;
    view.innerHTML = `${pageHead("Inspection", { back: `#/jobs/${j.id}`, sub: `${esc(j.car)} ${plateTag(j.plate)}`, acts: `<button type="button" class="btn alt" id="allOk">${icon("check")}Mark the rest OK</button>` })}
      <p class="muted" style="margin-top:-8px">Tap OK, Soon or Now for each item. Add a reading, a note and photos where useful. The customer sees this report without prices.</p>
      <form id="insf">${CHECKLIST.map(([g, list]) => `<div class="card"><h2>${esc(g)}</h2>${list.map(([key]) => row(items.find((i) => i.key === key))).join("")}</div>`).join("")}
        <div class="card"><label for="insSum">Summary for the customer</label><textarea id="insSum" rows="2" placeholder="e.g. Front brake pads are at 2 mm and should be replaced now. Everything else is fine.">${esc(j.inspection?.summary || "")}</textarea>
        <div class="btns"><button class="btn" type="submit">${icon("check")}Save inspection</button></div></div></form>`;
    const form = $("#insf");
    const paint = (el) => {
      const it = items.find((i) => i.key === el.dataset.key);
      $$(".st button", el).forEach((x) => { const on = x.dataset.s === it.status; x.className = on ? "on s-" + x.dataset.s : ""; x.setAttribute("aria-pressed", on); });
    };
    form.addEventListener("click", (e) => {
      const b = e.target.closest(".st [data-s]");
      if (!b) return;
      const el = b.closest(".insrow");
      const it = items.find((i) => i.key === el.dataset.key);
      it.status = it.status === b.dataset.s ? "" : b.dataset.s;
      paint(el);
    });
    form.addEventListener("change", async (e) => {
      if (e.target.type !== "file") return;
      const el = e.target.closest(".insrow");
      const it = items.find((i) => i.key === el.dataset.key);
      const file = await shrink(e.target.files[0]);
      e.target.value = "";
      if (!file) return;
      const fd = new FormData();
      fd.append("file", file);
      toast("Uploading photo…");
      try {
        const ph = await api(`/jobs/${j.id}/photo`, { method: "POST", form: fd });
        j.photos[ph.id] = { url: ph.url, thumb: ph.thumb };
        it.photoIds.push(ph.id);
        $(".phs", el).insertAdjacentHTML("beforeend", `<img class="thumb" src="${esc(ph.thumb)}" alt="">`);
        $(".pc", el).textContent = it.photoIds.length;
        toast("Photo added. Remember to save.");
      } catch (err) {
        toast(err.message, "err");
      }
    });
    $("#allOk").onclick = () => {
      items.forEach((it) => { if (!it.status) it.status = "ok"; });
      $$(".insrow").forEach(paint);
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      $$(".insrow").forEach((el) => {
        const it = items.find((i) => i.key === el.dataset.key);
        it.value = $("[name=value]", el).value;
        it.note = $("[name=note]", el).value;
      });
      busy(e.submitter, true, "Saving…");
      try {
        replaceJob(await api(`/jobs/${j.id}/inspection`, { method: "PUT", body: { summary: $("#insSum").value, items: items.map(({ unit, ...x }) => x) } }));
        toast("Inspection saved");
        location.hash = `#/jobs/${j.id}`;
      } catch (err) {
        toast(err.message, "err");
        busy(e.submitter, false);
      }
    };
  }

  // Printable job card for the mechanic: no prices.
  function printJobCard(j) {
    const w = window.open("", "_blank");
    if (!w) return toast("Allow pop-ups to print the job card.");
    const v = vehicleByKey(plateKey(j.plate));
    const ci = j.checkin || {};
    const K = CarDiagram.KINDS;
    const marks = (v?.marks || []).filter((m) => !m.fixed);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Job card ${esc(docNo(j))}</title><style>
      body{font:13px/1.45 Arial,sans-serif;color:#111;margin:0}.p{max-width:190mm;margin:0 auto;padding:10mm 6mm}
      h1{font-size:22px;margin:0}.top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:6px}
      table{width:100%;border-collapse:collapse;margin-top:10px}td,th{border:1px solid #888;padding:5px 7px;text-align:left;vertical-align:top}th{background:#e8e8e8;font-size:12px}
      .g{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.b{border:1px solid #888;padding:6px 8px}.b b{display:block;font-size:11px;text-transform:uppercase;color:#444}
      .chk{width:15px;height:15px;border:1.5px solid #111;display:inline-block;vertical-align:-3px}.ln{height:24px;border-bottom:1px solid #aaa}
      @page{size:A4;margin:10mm}@media print{.p{padding:0}}
    </style></head><body><div class="p">
      <div class="top"><div><h1>JOB CARD</h1><div>${esc(brandName())}</div></div><div style="text-align:right"><b style="font-size:16px">${esc(docNo(j))}</b><br>${dmy(jobDate(j))}</div></div>
      <div class="g"><div class="b"><b>Car</b>${esc(j.car)} · ${esc(j.plate)}<br>${km(j.mileageKm)}${v?.chassisNo ? " · VIN " + esc(v.chassisNo) : ""}</div>
        <div class="b"><b>Customer</b>${esc(j.customerName)} · ${esc(j.phone)}</div>
        <div class="b"><b>Check-in</b>Fuel ${esc(ci.fuel || "—")} · Keys ${esc(ci.keys || "—")}<br>Left in car: ${esc(ci.items || "—")}</div>
        <div class="b"><b>Body marks</b>${marks.length ? marks.map((m) => `${esc(m.area)} (${esc((K[m.kind] || K.other).label)})`).join(", ") : "None recorded"}</div></div>
      ${ci.notes ? `<div class="b" style="margin-top:8px"><b>Customer said</b>${esc(ci.notes)}</div>` : ""}
      <table><thead><tr><th style="width:38px">Done</th><th>Work</th><th style="width:44px">Qty</th><th style="width:170px">Mechanic notes</th></tr></thead><tbody>
      ${j.groups.map((g) => `<tr><td></td><td colspan="3"><b>${esc(g.code)} ${esc(g.request)}</b></td></tr>${g.lines.map((l) => `<tr><td><span class="chk"></span></td><td>${esc(l.description)}${l.partNo ? ` <small>(${esc(l.partNo)})</small>` : ""}</td><td>${l.type === "part" ? esc(l.qty) : ""}</td><td></td></tr>`).join("")}`).join("")}
      </tbody></table>
      <div class="b" style="margin-top:10px"><b>Extra findings / parts needed</b><div class="ln"></div><div class="ln"></div><div class="ln"></div></div>
      <div class="g" style="margin-top:14px"><div class="b"><b>Mechanic</b><br>Name / sign: ______________________</div><div class="b"><b>Final check</b><br><span class="chk"></span> Road test &nbsp; <span class="chk"></span> Fluids &nbsp; <span class="chk"></span> Clean</div></div>
    </div><script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`);
    w.document.close();
  }

  // ================= CRM =================

  const SOURCES = ["Walk-in", "Referral", "Returning", "Facebook", "Instagram", "Threads", "TikTok", "Google", "Other"];
  const CTYPES = ["Customer", "Lead", "Fleet"];
  const IKINDS = ["Call", "WhatsApp", "Visit", "Email", "Note"];
  const IK_ICON = { Call: "phone", WhatsApp: "chat", Visit: "car", Email: "file", Note: "edit" };
  const addDaysISO = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  const tagChips = (t) => String(t || "").split(",").map((x) => x.trim()).filter(Boolean).map((x) => `<span class="pill">${esc(x)}</span>`).join(" ");
  const opt = (list, cur, empty) => `${empty !== undefined ? `<option value="">${empty}</option>` : ""}${list.map((x) => `<option ${x === cur ? "selected" : ""}>${esc(x)}</option>`).join("")}`;
  function replaceCustomer(c) {
    const i = state.customers.findIndex((x) => x.id === c.id);
    if (i >= 0) state.customers[i] = c;
  }

  // Log a call / WhatsApp / visit, and set the next follow-up.
  function logDialog(c, after) {
    let kind = "Call";
    const m = modal(`Log contact: ${c.name}`, `
      <label>What happened</label><div class="seg" id="lkKind" role="group" aria-label="Contact type">${IKINDS.map((k) => `<button type="button" class="${k === kind ? "on" : ""}" data-k="${k}">${k}</button>`).join("")}</div>
      <label for="lkNote">Note</label><textarea id="lkNote" rows="3" placeholder="e.g. Asked about Service B price. Will reply after payday."></textarea>
      <div class="fgrid"><div><label for="lkNext">Next follow-up</label><input id="lkNext" type="date" value="${esc(c.nextFollowUp && c.nextFollowUp > todayKL() ? c.nextFollowUp : "")}"></div>
        <div><label for="lkWhat">Follow-up about</label><input id="lkWhat" value="${esc(c.followUpNote)}" placeholder="e.g. Confirm brake job"></div></div>
      <div class="chips" style="margin-top:8px">${[["+3 days", 3], ["+1 week", 7], ["+1 month", 30], ["No follow-up", 0]].map(([l, n]) => `<button type="button" class="chip" data-d="${n}">${l}</button>`).join("")}</div>
      <div class="btns"><button type="button" class="btn" id="lkSave">${icon("check")}Save</button></div>`);
    m.$("#lkKind").onclick = (e) => {
      const b = e.target.closest("[data-k]");
      if (!b) return;
      kind = b.dataset.k;
      $$("#lkKind button", m.el).forEach((x) => x.classList.toggle("on", x === b));
    };
    m.el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-d]");
      if (b) m.$("#lkNext").value = Number(b.dataset.d) ? addDaysISO(todayKL(), Number(b.dataset.d)) : "";
    });
    m.$("#lkSave").onclick = async (e) => {
      busy(e.currentTarget, true, "Saving…");
      try {
        const out = await api("/interactions", { method: "POST", body: { customerId: c.id, type: kind, note: m.$("#lkNote").value, nextFollowUp: m.$("#lkNext").value, followUpNote: m.$("#lkWhat").value } });
        state.interactions.unshift(out.interaction);
        replaceCustomer(out.customer);
        m.close();
        toast("Saved");
        (after || route)();
      } catch (err) {
        toast(err.message, "err");
        busy(e.currentTarget, false);
      }
    };
  }

  function pageFollowups(q) {
    crumbs([["Follow-ups"]]);
    const today = todayKL();
    let tab = ["due", "winback", "leads"].includes(q.get("tab")) ? q.get("tab") : "due";
    const stats = new Map(state.customers.map((c) => [c.id, customerStats(c)]));
    const due = state.customers.filter((c) => c.nextFollowUp && c.nextFollowUp <= addDaysISO(today, 7)).sort((a, b) => a.nextFollowUp.localeCompare(b.nextFollowUp));
    const winback = state.customers.filter((c) => {
      const s = stats.get(c.id);
      return s.last && daysBetween(s.last, today) > 180 && !s.jobs.some((j) => isWorkshop(j)) && !c.nextFollowUp;
    }).sort((a, b) => stats.get(b.id).spent - stats.get(a.id).spent);
    const leads = state.customers.filter((c) => c.type === "Lead");
    const TABS = { due: [`Due (${due.length})`, due], winback: [`Win-back (${winback.length})`, winback], leads: [`Leads (${leads.length})`, leads] };
    view.innerHTML = `${pageHead("Follow-ups", { sub: "Who to contact, and customers who have not come back" })}
      <nav class="tabs" id="ftabs">${Object.entries(TABS).map(([k, [l]]) => `<a href="#/followups?tab=${k}" data-t="${k}">${l}</a>`).join("")}</nav>
      <p class="muted" id="fhint" style="margin-top:-6px"></p><div class="card flush" id="fbody"></div>`;
    const HINT = { due: "Follow-ups due in the next 7 days. Overdue ones are at the top.", winback: "Customers who last came more than 6 months ago and have no follow-up set. Best customers first.", leads: "People who asked but have not had work done yet." };
    const msg = (c) => (tab === "winback" ? `Hi ${c.name}, it's ${brandName()}. It has been a while since your car's last visit. Would you like us to check it, or book a service?` : `Hi ${c.name}, it's ${brandName()}.`);
    const draw = () => {
      $$("#ftabs a").forEach((a) => a.classList.toggle("on", a.dataset.t === tab));
      $("#fhint").textContent = HINT[tab];
      const list = TABS[tab][1];
      $("#fbody").innerHTML = list.length
        ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Customer</th><th>${tab === "due" ? "Due" : "Last visit"}</th><th class="d">About</th><th class="num d">Spent</th><th></th></tr></thead><tbody>
          ${list.map((c) => {
            const s = stats.get(c.id);
            const late = tab === "due" && c.nextFollowUp < today;
            return `<tr><td><div class="who">${avatar(c.name)}<div style="min-width:0"><a href="#/customers/${c.id}" class="strong" style="color:inherit;text-decoration:none">${esc(c.name)}</a><div class="sm">${esc(c.phone)}${s.plates.length ? " · " + s.plates.map((p) => esc(vehicleByKey(p)?.plate || p)).join(", ") : ""}</div></div></div></td>
              <td class="nowrap">${tab === "due" ? `${late ? pill(dmy(c.nextFollowUp), "bad") : dmy(c.nextFollowUp)}<div class="sm">${ago(c.nextFollowUp)}</div>` : s.last ? `${dmy(s.last)}<div class="sm">${ago(s.last)}</div>` : "—"}</td>
              <td class="d">${esc(c.followUpNote) || '<span class="sm">—</span>'}</td><td class="num d">${rm(s.spent)}</td>
              <td class="num nowrap">${c.phone ? `<a class="btn wa sm" href="${esc(waLink(c.phone, msg(c)))}" target="_blank" rel="noopener" aria-label="WhatsApp ${esc(c.name)}">${icon("chat")}</a> <a class="btn alt sm" href="tel:${esc(c.phone)}" aria-label="Call ${esc(c.name)}">${icon("phone")}</a>` : ""} <button type="button" class="btn alt sm" data-log="${c.id}">Log</button></td></tr>`;
          }).join("")}</tbody></table></div>`
        : emptyBox("check", tab === "due" ? "No follow-ups due. Set one from a customer's page." : tab === "winback" ? "No one to win back right now." : "No leads. Mark a customer as Lead when someone asks but has not booked.");
      $$("[data-log]").forEach((b) => (b.onclick = () => logDialog(state.customers.find((c) => c.id === b.dataset.log))));
    };
    $("#ftabs").onclick = (e) => {
      const a = e.target.closest("[data-t]");
      if (!a) return;
      e.preventDefault();
      tab = a.dataset.t;
      history.replaceState(null, "", a.getAttribute("href"));
      draw();
    };
    draw();
  }

  // Expected mileage today from the car's visit history (km per day).
  function predictKm(v) {
    const pts = jobsOfVehicle(v.key).filter((j) => j.mileageKm && jobDate(j) && j.status !== "Cancelled").map((j) => [jobDate(j), j.mileageKm]).sort((a, b) => a[0].localeCompare(b[0]));
    if (pts.length < 2) return null;
    const [d0, k0] = pts[0];
    const [d1, k1] = pts[pts.length - 1];
    const days = daysBetween(d0, d1);
    if (days < 30 || k1 <= k0) return null;
    return Math.round(k1 + ((k1 - k0) / days) * daysBetween(d1, todayKL()));
  }

  function pageReminders() {
    crumbs([["Service reminders"]]);
    const today = todayKL();
    const rows = state.vehicles.map((v) => ({ v, pk: predictKm(v) })).filter(({ v, pk }) =>
      (v.nextServiceDate && daysBetween(today, v.nextServiceDate) <= 30) || (v.nextServiceKm && pk && pk >= v.nextServiceKm - 1000))
      .sort((a, b) => (a.v.nextServiceDate || "9").localeCompare(b.v.nextServiceDate || "9"));
    const unset = state.vehicles.filter((v) => v.visits && !v.nextServiceDate && !v.nextServiceKm).length;
    view.innerHTML = `${pageHead("Service reminders", { sub: "Cars due for service in the next 30 days, or close to their service km" })}
      ${unset ? `<div class="notice">${icon("alert")}<div>${unset} car(s) have no next service set. It is set when you tick "Set next service reminder" on an invoice, or on the car's Details tab.</div></div>` : ""}
      <div class="card flush">${rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Car</th><th>Due</th><th class="d">Km now (estimate)</th><th class="d">Last reminded</th><th></th></tr></thead><tbody>
        ${rows.map(({ v, pk }) => {
          const over = v.nextServiceDate && v.nextServiceDate < today;
          const msg = `Hi ${v.ownerName || ""}, this is ${brandName()}. Your ${v.makeModel || "car"} (${v.plate}) is due for service${v.nextServiceDate ? ` on ${dmy(v.nextServiceDate)}` : ""}${v.nextServiceKm ? ` or at ${Number(v.nextServiceKm).toLocaleString("en-MY")} km` : ""}. Would you like to book a slot?`;
          return `<tr><td><a href="#/vehicles/${v.key}" class="strong" style="color:inherit;text-decoration:none">${esc(v.makeModel || "Car")}</a><div class="sm">${plateTag(v.plate)} ${esc(v.ownerName)}</div></td>
            <td class="nowrap">${v.nextServiceDate ? (over ? pill(dmy(v.nextServiceDate), "bad") : dmy(v.nextServiceDate)) : "—"}${v.nextServiceKm ? `<div class="sm">or ${km(v.nextServiceKm)}</div>` : ""}</td>
            <td class="d nowrap">${pk ? km(pk) : "—"}</td><td class="d nowrap">${v.lastReminded ? `${dmy(v.lastReminded)}<div class="sm">${ago(v.lastReminded)}</div>` : "Not yet"}</td>
            <td class="num nowrap">${v.ownerPhone ? `<a class="btn wa sm" data-remind="${v.key}" href="${esc(waLink(v.ownerPhone, msg))}" target="_blank" rel="noopener">${icon("chat")}Remind</a>` : ""} <button type="button" class="btn alt sm" data-book="${v.key}">${icon("calendar")}Book</button></td></tr>`;
        }).join("")}</tbody></table></div>`
        : emptyBox("calendar", "No services due in the next 30 days.")}</div>`;
    $$("[data-remind]").forEach((a) => a.addEventListener("click", async () => {
      try { updateVehicle(await api(`/vehicles/${a.dataset.remind}`, { method: "PATCH", body: { lastReminded: todayKL() } })); } catch { /* the message still opens */ }
    }));
    $$("[data-book]").forEach((b) => (b.onclick = () => {
      const v = vehicleByKey(b.dataset.book);
      bookingDialog(null, { customerId: v.customerId, customerName: v.ownerName, phone: v.ownerPhone, plate: v.plate, car: v.makeModel, work: "Service" });
    }));
  }

  // ---------- bookings ----------

  const weekStart = (iso) => {
    const d = new Date(iso + "T00:00:00Z");
    return addDaysISO(iso, -((d.getUTCDay() + 6) % 7));
  };
  const BK_CLS = { Booked: "info", Arrived: "ok", "No-show": "bad", Cancelled: "" };

  function bookingDialog(b, preset = {}) {
    const d = b || { date: preset.date || todayKL(), time: "", status: "Booked", ...preset };
    const m = modal(b ? "Booking" : "New booking", `<form id="bkf" novalidate><div class="fgrid">
        <div><label for="bk_date" class="req">Date</label><input id="bk_date" name="date" type="date" value="${esc(d.date)}"></div>
        <div><label for="bk_time">Time</label><input id="bk_time" name="time" type="time" value="${esc(d.time)}"></div>
        <div><label for="bk_name" class="req">Customer</label><input id="bk_name" name="customerName" list="custList2" value="${esc(d.customerName || "")}"></div>
        <div><label for="bk_phone">Phone</label><input id="bk_phone" name="phone" type="tel" value="${esc(d.phone || "")}"></div>
        <div><label for="bk_plate">Plate</label><input id="bk_plate" name="plate" list="plateList2" style="text-transform:uppercase" value="${esc(d.plate || "")}"></div>
        <div><label for="bk_car">Car</label><input id="bk_car" name="car" value="${esc(d.car || "")}"></div>
        <div class="full"><label for="bk_work">Work</label><input id="bk_work" name="work" list="workList" value="${esc(d.work || "")}" placeholder="e.g. Service B, brake noise"></div>
        <div class="full"><label for="bk_notes">Notes</label><textarea id="bk_notes" name="notes" rows="2">${esc(d.notes || "")}</textarea></div>
        ${b ? `<div class="full"><label>Status</label><div class="seg" id="bkSt">${["Booked", "Arrived", "No-show", "Cancelled"].map((s) => `<button type="button" class="${s === d.status ? "on" : ""}" data-s="${s}">${s}</button>`).join("")}</div></div>` : ""}
      </div>
      <datalist id="custList2">${state.customers.map((c) => `<option value="${esc(c.name)}">${esc(c.phone)}</option>`).join("")}</datalist>
      <datalist id="plateList2">${state.vehicles.map((v) => `<option value="${esc(v.plate)}">${esc(v.makeModel)} · ${esc(v.ownerName)}</option>`).join("")}</datalist>
      <datalist id="workList">${state.packages.filter((p) => p.active).map((p) => `<option value="${esc(p.name)}">`).join("")}</datalist>
      <div class="btns"><button class="btn" type="submit">${icon("check")}Save</button>
        ${b && d.phone ? `<a class="btn wa" href="${esc(waLink(d.phone, `Hi ${d.customerName}, this is ${brandName()} confirming your booking on ${dmy(d.date)}${d.time ? " at " + d.time : ""}${d.work ? " for " + d.work : ""}. See you then!`))}" target="_blank" rel="noopener">${icon("chat")}Confirm by WhatsApp</a>` : ""}
        ${b && d.jobId ? `<a class="btn alt" href="#/jobs/${d.jobId}">Open job</a>` : b && d.status !== "Cancelled" ? `<button type="button" class="btn alt" id="bkStart">${icon("jobs")}Car arrived: start estimate</button>` : ""}
      </div></form>`);
    let status = d.status;
    const f = m.$("#bkf");
    const st = m.$("#bkSt");
    if (st) st.onclick = (e) => {
      const x = e.target.closest("[data-s]");
      if (!x) return;
      status = x.dataset.s;
      $$("#bkSt button", m.el).forEach((y) => y.classList.toggle("on", y === x));
    };
    f.elements.customerName.addEventListener("change", () => {
      const c = state.customers.find((x) => x.name.toLowerCase() === f.elements.customerName.value.trim().toLowerCase());
      if (!c) return;
      if (!f.elements.phone.value) f.elements.phone.value = c.phone;
      const car = state.vehicles.find((v) => v.customerId === c.id);
      if (car && !f.elements.plate.value) { f.elements.plate.value = car.plate; f.elements.car.value = car.makeModel; }
    });
    f.elements.plate.addEventListener("change", () => {
      const v = vehicleByKey(plateKey(f.elements.plate.value));
      if (!v) return;
      f.elements.car.value = f.elements.car.value || v.makeModel;
      if (!f.elements.customerName.value) { f.elements.customerName.value = v.ownerName; f.elements.phone.value = v.ownerPhone; }
    });
    const body = () => {
      const o = formObj(f);
      const c = state.customers.find((x) => x.name.toLowerCase() === o.customerName.trim().toLowerCase());
      o.customerId = c ? c.id : d.customerId || "";
      if (b) o.status = status;
      return o;
    };
    const save = async (extra = {}) => {
      const out = b ? await api(`/bookings/${b.id}`, { method: "PATCH", body: { ...body(), ...extra } }) : await api("/bookings", { method: "POST", body: body() });
      await refresh("bookings");
      return out;
    };
    f.onsubmit = async (e) => {
      e.preventDefault();
      busy(e.submitter, true, "Saving…");
      try { await save(); m.close(); toast("Booking saved"); route(); } catch (err) { toast(err.message, "err"); busy(e.submitter, false); }
    };
    const start = m.$("#bkStart");
    if (start) start.onclick = async () => {
      try {
        const out = await save({ status: "Arrived" });
        m.close();
        const v = vehicleByKey(plateKey(out.plate));
        location.hash = `#/jobs/new?booking=${out.id}${v ? `&plate=${v.key}` : ""}${out.customerId ? `&customer=${out.customerId}` : ""}`;
      } catch (err) { toast(err.message, "err"); }
    };
  }

  function pageBookings(q) {
    const today = todayKL();
    let start = weekStart(/^\d{4}-\d{2}-\d{2}$/.test(q.get("w") || "") ? q.get("w") : today);
    crumbs([["Bookings"]]);
    view.innerHTML = `${pageHead("Bookings", { sub: "Who is coming in, and when", acts: `<button class="btn" id="bkNew">${icon("plus")}New booking</button>` })}
      <div class="toolbar"><div class="seg"><button type="button" id="wPrev" aria-label="Previous week">${icon("back")}</button><button type="button" id="wToday">This week</button><button type="button" id="wNext" aria-label="Next week" style="transform:scaleX(-1)">${icon("back")}</button></div><b id="wLabel"></b></div>
      <div class="week" id="week"></div>`;
    const fmtDay = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    const draw = () => {
      const days = Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
      $("#wLabel").textContent = `${fmtDay(days[0])} – ${fmtDay(days[6])}`;
      $("#week").innerHTML = days.map((d) => {
        const list = state.bookings.filter((b) => b.date === d);
        return `<div class="day ${d === today ? "today" : ""}"><div class="dh"><span>${fmtDay(d)}</span><button type="button" class="btn ghost sm icon" data-new="${d}" aria-label="New booking on ${fmtDay(d)}">${icon("plus")}</button></div>
          ${list.map((b) => `<button type="button" class="bk ${b.status === "Cancelled" ? "off" : ""}" data-bk="${b.id}"><span class="t">${esc(b.time || "Any time")}</span>${pill(b.status, BK_CLS[b.status])}
            <b>${esc(b.customerName)}</b><span class="m">${b.plate ? plateTag(b.plate) + " " : ""}${esc(b.work)}</span></button>`).join("") || `<div class="muted" style="padding:4px 2px">—</div>`}</div>`;
      }).join("");
      $$("#week [data-bk]").forEach((x) => (x.onclick = () => bookingDialog(state.bookings.find((b) => b.id === x.dataset.bk))));
      $$("#week [data-new]").forEach((x) => (x.onclick = () => bookingDialog(null, { date: x.dataset.new })));
    };
    const go = (s) => { start = s; history.replaceState(null, "", `#/bookings?w=${start}`); draw(); };
    $("#wPrev").onclick = () => go(addDaysISO(start, -7));
    $("#wNext").onclick = () => go(addDaysISO(start, 7));
    $("#wToday").onclick = () => go(weekStart(today));
    $("#bkNew").onclick = () => bookingDialog(null);
    draw();
    if (q.get("new")) bookingDialog(null);
  }

  // Activity on the customer page: log form + timeline of contacts, jobs and payments.
  function customerActivity(c, st) {
    const items = [
      ...state.interactions.filter((i) => i.customerId === c.id).map((i) => ({ date: i.date, ic: IK_ICON[i.type] || "edit", title: i.type, text: i.note })),
      ...st.jobs.map((j) => ({ date: jobDate(j), ic: "jobs", title: `${kindOf(j)} ${docNo(j)}`, text: `${j.car || ""} · ${rm(j.total)} · ${j.status}`, href: `#/jobs/${j.id}` })),
      ...state.payments.filter((p) => st.jobs.some((j) => j.id === p.jobId)).map((p) => ({ date: p.paidOn, ic: "money", title: `Paid ${rm(p.amount)}`, text: `${p.receiptNo} · ${p.method}`, href: `#/money/receipt/${p.id}` })),
      ...state.bookings.filter((b) => b.customerId === c.id).map((b) => ({ date: b.date, ic: "calendar", title: `Booking: ${b.status}`, text: `${b.time ? b.time + " · " : ""}${b.work}` })),
    ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return `<div class="card"><div class="card-h"><h2>Activity</h2><div class="r"><button type="button" class="btn alt sm" id="logC">${icon("plus")}Log contact</button></div></div>
      ${items.length ? `<ol class="tl">${items.slice(0, 40).map((x) => `<li><span class="tli">${icon(x.ic)}</span><div><div class="tlh">${x.href ? `<a href="${x.href}">${esc(x.title)}</a>` : `<b>${esc(x.title)}</b>`}<span class="muted">${dmy(x.date)}</span></div>${x.text ? `<div class="muted" style="white-space:pre-line">${esc(x.text)}</div>` : ""}</div></li>`).join("")}</ol>` : `<p class="muted">Nothing yet.</p>`}</div>`;
  }

  // ================= FINANCE =================

  const ECATS = ["Rent", "Utilities", "Wages", "Workshop supplies", "Sublet (outside work)", "Parts for jobs (no stock)", "Tools & equipment (asset)", "Transport", "Marketing", "Phone & internet", "Bank fees", "Insurance & licences", "Owner drawings", "Other"];
  const NOT_PNL = ["Tools & equipment (asset)", "Owner drawings"];
  const METHODS = ["Bank transfer", "DuitNow", "Cash", "Card", "Cheque", "E-wallet", "Other"];
  const inRange = (d, [a, b]) => !!d && d >= a && d <= b;
  const sum = (list, f) => list.reduce((t, x) => t + (Number(f(x)) || 0), 0);
  const monthRange = (ym) => {
    const [y, m] = ym.split("-").map(Number);
    return [`${ym}-01`, new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)];
  };
  const ymLabel = (ym) => new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-MY", { month: "long", year: "numeric", timeZone: "UTC" });

  // Excel opens CSV directly; the BOM keeps RM and names readable.
  function downloadCsv(name, cols, rows) {
    const cell = (v) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = "﻿" + [cols.map((c) => cell(c[0])).join(","), ...rows.map((r) => cols.map((c) => cell(c[1](r))).join(","))].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // Period picker shared by P&L and expenses: this month / last month / this year / any month.
  function periodPicker(id, cur) {
    const t = todayKL();
    const ym = t.slice(0, 7);
    const last = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 2, 1)).toISOString().slice(0, 7);
    return `<div class="toolbar" id="${id}"><div class="seg">
      <button type="button" data-p="m:${ym}" class="${cur === "m:" + ym ? "on" : ""}">This month</button><button type="button" data-p="m:${last}" class="${cur === "m:" + last ? "on" : ""}">Last month</button><button type="button" data-p="y:${t.slice(0, 4)}" class="${cur === "y:" + t.slice(0, 4) ? "on" : ""}">This year</button></div>
      <input type="month" aria-label="Pick a month" value="${cur.startsWith("m:") ? cur.slice(2) : ""}" style="width:auto;min-height:38px"></div>`;
  }
  const periodRange = (p) => (p.startsWith("y:") ? [`${p.slice(2)}-01-01`, `${p.slice(2)}-12-31`] : monthRange(p.slice(2)));
  const periodLabel = (p) => (p.startsWith("y:") ? `Year ${p.slice(2)}` : ymLabel(p.slice(2)));
  function bindPeriod(id, onPick) {
    const box = $("#" + id);
    box.onclick = (e) => { const b = e.target.closest("[data-p]"); if (b) onPick(b.dataset.p); };
    $("input[type=month]", box).onchange = (e) => e.target.value && onPick("m:" + e.target.value);
  }

  // ---------- expenses ----------

  function expenseDialog(x, file, ai, inboxItem) {
    const d = x || { date: todayKL(), category: "", method: "Bank transfer" };
    const c = (v) => (ai && v != null && v !== "" ? "ai" : "");
    const m = modal(x?.id ? "Expense" : "Add expense", `<form id="exf" novalidate>
      ${ai ? `<div class="notice">${icon("alert")}<div>AI filled the <b>blue</b> boxes. Check them, choose a category, then save.</div></div>` : ""}
      <div class="fgrid"><div class="full"><label for="ex_d" class="req">What for</label><input id="ex_d" class="${c(d.description)}" name="description" value="${esc(d.description || "")}" placeholder="e.g. TNB electricity November"></div>
        <div><label for="ex_a" class="req">Amount (RM)</label><input id="ex_a" class="${c(d.amount)}" name="amount" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(d.amount ?? "")}"></div>
        <div><label for="ex_dt">Date</label><input id="ex_dt" class="${c(d.date)}" name="date" type="date" value="${esc(d.date || todayKL())}"></div>
        <div><label for="ex_c" class="req">Category</label><select id="ex_c" name="category">${opt(ECATS, d.category, "— choose —")}</select></div>
        <div><label for="ex_m">Paid by</label><select id="ex_m" name="method">${opt(METHODS, d.method || "Bank transfer")}</select></div>
        <div class="full"><label for="ex_p">Paid to</label><input id="ex_p" class="${c(d.paidTo)}" name="paidTo" value="${esc(d.paidTo || "")}"></div>
        <div class="full"><label for="ex_n">Notes</label><input id="ex_n" name="notes" value="${esc(d.notes || "")}"></div></div>
      <p class="hint">Parts you buy for stock go in Parts &amp; stock (supplier receipt), not here. "Tools &amp; equipment" counts as an asset, and "Owner drawings" is money you take out; neither lowers profit.</p>
      ${x?.receipt ? `<p><a href="${esc(x.receipt)}" target="_blank" rel="noopener">${icon("file")} View receipt</a></p>` : ""}
      ${inboxItem ? `<p>${icon("chat")} From WhatsApp · ${inboxFileLink(inboxItem)}</p>` : ""}
      <div class="btns"><button class="btn" type="submit">${icon("check")}Save</button></div></form>`);
    m.$("#exf").addEventListener("input", (e) => e.target.classList.remove("ai"));
    m.$("#exf").onsubmit = async (e) => {
      e.preventDefault();
      const b = formObj(e.target);
      busy(e.submitter, true, "Saving…");
      try {
        if (x?.id) await api(`/expenses/${x.id}`, { method: "PATCH", body: b });
        else {
          const fd = new FormData();
          if (file) fd.append("file", file);
          fd.append("data", JSON.stringify({ ...b, inboxId: inboxItem ? inboxItem.id : "" }));
          const out = await api("/expenses", { method: "POST", form: fd });
          if (!out.fileSaved) toast("Saved, but the receipt file did not upload.");
        }
        await refresh("expenses", "inbox");
        m.close();
        toast("Expense saved");
        route();
      } catch (err) {
        toast(err.message, "err");
        busy(e.submitter, false);
      }
    };
  }

  function pageExpenses(q) {
    crumbs([["Expenses"]]);
    let per = q.get("p") || "m:" + todayKL().slice(0, 7);
    view.innerHTML = `${pageHead("Expenses", { sub: "Rent, bills, wages, tools: money spent running the workshop", acts: `<button class="btn alt" id="exAdd">${icon("edit")}Add by hand</button><label class="btn upload">${icon("upload")}Upload receipt<input type="file" id="exFile" accept="image/*,application/pdf"></label>` })}
      <div id="per"></div><div class="grid g3" style="margin-bottom:16px" id="exTiles"></div><div class="card flush" id="exT"></div>`;
    const draw = () => {
      $("#per").innerHTML = periodPicker("pp", per);
      bindPeriod("pp", (p) => { per = p; history.replaceState(null, "", `#/expenses?p=${p}`); draw(); });
      const r = periodRange(per);
      const list = state.expenses.filter((x) => inRange(x.date, r));
      const run = list.filter((x) => !NOT_PNL.includes(x.category));
      const byCat = {};
      run.forEach((x) => (byCat[x.category] = (byCat[x.category] || 0) + x.amount));
      const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
      $("#exTiles").innerHTML = `<div class="tile"><div class="lbl">${icon("money")}Running costs</div><div class="val">${rm(sum(run, (x) => x.amount))}</div><div class="foot">${periodLabel(per)}</div></div>
        <div class="tile"><div class="lbl">${icon("receipt")}Biggest cost</div><div class="val">${top ? rm(top[1]) : "—"}</div><div class="foot">${top ? esc(top[0]) : "No expenses yet"}</div></div>
        <div class="tile"><div class="lbl">${icon("parts")}Tools &amp; drawings</div><div class="val">${rm(sum(list.filter((x) => NOT_PNL.includes(x.category)), (x) => x.amount))}</div><div class="foot">not counted in profit</div></div>`;
      $("#exT").innerHTML = list.length
        ? `<div class="card-h" style="padding:14px 18px 0"><h2>${periodLabel(per)}</h2><div class="r"><button type="button" class="btn ghost sm" id="exCsv">${icon("file")}Excel</button></div></div><div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>Date</th><th>What for</th><th class="d">Category</th><th class="d">Paid to</th><th class="num">Amount</th></tr></thead><tbody>
          ${list.map((x) => `<tr class="tap" data-ex="${x.id}" tabindex="0"><td class="nowrap">${dmy(x.date)}</td><td class="strong">${esc(x.description)}${x.receipt ? ` <span class="sm">${icon("file")}</span>` : ""}<div class="sm">${esc(x.category)}</div></td><td class="d">${esc(x.category)}</td><td class="d">${esc(x.paidTo)}</td><td class="num">${rm(x.amount)}</td></tr>`).join("")}</tbody></table></div>`
        : emptyBox("receipt", "No expenses in this period. Upload a receipt and AI fills it in.");
      $$("#exT [data-ex]").forEach((el) => (el.onclick = () => expenseDialog(state.expenses.find((x) => x.id === el.dataset.ex))));
      const csv = $("#exCsv");
      if (csv) csv.onclick = () => downloadCsv(`expenses-${per.slice(2)}.csv`, [["Date", (x) => x.date], ["Description", (x) => x.description], ["Category", (x) => x.category], ["Paid to", (x) => x.paidTo], ["Method", (x) => x.method], ["Amount (RM)", (x) => x.amount.toFixed(2)]], list);
    };
    $("#exAdd").onclick = () => expenseDialog(null);
    $("#exFile").onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      toast("Reading the receipt…");
      const fd = new FormData();
      fd.append("file", file);
      try {
        const { suggestion } = await api("/expenses/extract", { method: "POST", form: fd });
        expenseDialog({ ...suggestion, method: "Bank transfer" }, file, true);
      } catch (err) {
        toast(err.message, "err");
        expenseDialog(null, file);
      }
    };
    draw();
  }

  // ---------- credit notes ----------

  function creditDialog(j) {
    const left = r2(j.total - j.credited);
    const m = modal(`Credit note for ${j.invoiceNo}`, `<form id="cnf" novalidate>
      <p class="muted" style="margin-top:0">Invoice total ${rm(j.total)}${j.credited ? ` · already credited ${rm(j.credited)}` : ""} · paid ${rm(j.paid)}. You can credit up to <b>${rm(left)}</b>.</p>
      <div class="fgrid"><div><label for="cn_a" class="req">Amount (RM)</label><input id="cn_a" name="amount" type="number" step="0.01" min="0" max="${left}" inputmode="decimal"></div>
        <div id="cnRefW" hidden><label for="cn_m">Refund by</label><select id="cn_m" name="refundMethod">${opt(METHODS, "Bank transfer")}</select></div></div>
      <label for="cn_r" class="req">Reason</label><textarea id="cn_r" name="reason" rows="2" placeholder="e.g. Part returned unused / price correction / goodwill"></textarea>
      <p class="hint" id="cnHint"></p>
      <div class="btns"><button class="btn" type="submit">${icon("check")}Make credit note</button></div></form>`);
    const f = m.$("#cnf");
    const hint = () => {
      const a = Number(f.elements.amount.value) || 0;
      const net = r2(left - a);
      const refund = Math.max(0, r2(j.paid - net)) - Math.max(0, r2(j.paid - left));
      m.$("#cnRefW").hidden = !(refund > 0);
      m.$("#cnHint").textContent = a ? (refund > 0 ? `The customer already paid, so you refund ${rm(refund)}.` : `The customer will owe ${rm(Math.max(0, net - j.paid))}.`) : "";
    };
    f.addEventListener("input", hint);
    f.onsubmit = async (e) => {
      e.preventDefault();
      busy(e.submitter, true, "Saving…");
      try {
        const out = await api("/creditnotes", { method: "POST", body: { jobId: j.id, ...formObj(f) } });
        replaceJob(out.job);
        await refresh("creditnotes");
        m.close();
        const cn = out.creditnote;
        const link = docLink(cn.token);
        const d2 = modal(`Credit note ${cn.no}`, `<p>${rm(cn.amount)} credited on ${esc(cn.invoiceNo)}.${cn.refund ? ` Refund ${rm(cn.refund)} to the customer by ${esc(cn.refundMethod)}.` : ""}</p>
          <div class="stack"><a class="btn wa block" href="${esc(waLink(j.phone, `Hi ${j.customerName}, here is credit note ${cn.no} for invoice ${cn.invoiceNo} from ${brandName()}: ${rm(cn.amount)}.\n${link}`))}" target="_blank" rel="noopener">${icon("chat")}Send by WhatsApp</a>
          <a class="btn alt block" href="${esc(link)}" target="_blank" rel="noopener">${icon("open")}Open / save as PDF</a></div>`);
        d2.el.addEventListener("click", (ev) => ev.target === d2.el && route());
        route();
      } catch (err) {
        toast(err.message, "err");
        busy(e.submitter, false);
      }
    };
  }

  function pageCredits() {
    crumbs([["Credit notes"]]);
    const list = state.creditnotes;
    view.innerHTML = `${pageHead("Credit notes", { sub: "Price corrections, returned parts and goodwill against an invoice. Make one from the invoice's job page." })}
      <div class="card flush">${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>No.</th><th class="d">Date</th><th>Customer</th><th class="d">Invoice</th><th class="d">Reason</th><th class="num">Amount</th><th></th></tr></thead><tbody>
        ${list.map((c) => `<tr><td class="nowrap strong">${esc(c.no)}<div class="sm">${dmy(c.date)}</div></td><td class="d nowrap">${dmy(c.date)}</td><td>${esc(c.customerName)}${c.refund ? `<div class="sm">Refund ${rm(c.refund)}</div>` : ""}</td>
          <td class="d">${c.jobId ? `<a href="#/jobs/${c.jobId}">${esc(c.invoiceNo)}</a>` : esc(c.invoiceNo)}</td><td class="d">${esc(c.reason)}</td><td class="num strong">${rm(c.amount)}</td>
          <td class="num"><a class="btn ghost sm" href="${esc(docLink(c.token))}" target="_blank" rel="noopener">${icon("open")}PDF</a></td></tr>`).join("")}</tbody></table></div>`
        : emptyBox("cn", "No credit notes yet. To correct an invoice or refund a customer, open the invoice and press Credit note.")}</div>`;
  }

  // ---------- profit & loss ----------

  function pnlFor(r) {
    const markup = Number(state.settings.markupPercent) || 0;
    const partCost = new Map(state.parts.map((p) => [p.id, p.unitCost]));
    const invs = state.jobs.filter((j) => j.invoiceNo && j.status !== "Cancelled" && inRange(j.invoiceDate, r));
    let parts = 0, labour = 0, other = 0, discount = 0, cost = 0, estLines = 0;
    for (const j of invs) {
      for (const g of j.groups) for (const l of g.lines) {
        const amt = l.type === "part" ? (Number(l.qty) || 0) * (Number(l.unitPrice) || 0) : Number(l.amount) || 0;
        if (l.type === "part") {
          parts += amt;
          if (l.partId && partCost.has(l.partId)) cost += (Number(l.qty) || 0) * partCost.get(l.partId);
          else { cost += amt / (1 + markup / 100); estLines++; }
        } else if (l.type === "sublet") other += amt;
        else labour += amt;
      }
      other += (Number(j.details.surcharge) || 0) + (Number(j.details.menus) || 0);
      discount += Number(j.details.discount) || 0;
    }
    const credits = sum(state.creditnotes.filter((c) => inRange(c.date, r)), (c) => c.amount);
    const net = parts + labour + other - discount - credits;
    const exp = state.expenses.filter((x) => inRange(x.date, r) && !NOT_PNL.includes(x.category));
    const DIRECT = ["Sublet (outside work)", "Parts for jobs (no stock)"];
    const sublet = sum(exp.filter((x) => DIRECT.includes(x.category)), (x) => x.amount);
    const gross = net - cost - sublet;
    const cats = {};
    exp.filter((x) => !DIRECT.includes(x.category)).forEach((x) => (cats[x.category] = (cats[x.category] || 0) + x.amount));
    const expenses = sum(Object.values(cats), (v) => v);
    // Cash view
    const cashIn = sum(state.payments.filter((p) => inRange(p.paidOn, r)), (p) => p.amount);
    const refunds = sum(state.creditnotes.filter((c) => inRange(c.date, r)), (c) => c.refund);
    const spent = sum(state.expenses.filter((x) => inRange(x.date, r)), (x) => x.amount);
    const bills = sum(state.purchases.filter((p) => p.status === "Paid" && inRange(p.paidOn || p.date, r)), (p) => p.total);
    return { invs, parts, labour, other, discount, credits, net, cost, estLines, sublet, gross, cats, expenses, profit: gross - expenses, cashIn, refunds, spent, bills };
  }

  function pagePnl(q) {
    crumbs([["Profit & Loss"]]);
    let per = q.get("p") || "m:" + todayKL().slice(0, 7);
    view.innerHTML = `${pageHead("Profit &amp; Loss", { sub: "Did the workshop make money? Sales are counted on the invoice date." })}<div id="per"></div><div id="pl"></div>`;
    const draw = () => {
      $("#per").innerHTML = periodPicker("pp", per);
      bindPeriod("pp", (p) => { per = p; history.replaceState(null, "", `#/pnl?p=${p}`); draw(); });
      const r = periodRange(per);
      const x = pnlFor(r);
      const L = (label, v, cls = "") => `<tr class="${cls}"><td>${label}</td><td class="num">${v < 0 ? "-" + rm(-v) : rm(v)}</td></tr>`;
      const margin = x.net > 0 ? Math.round((x.gross / x.net) * 100) : 0;
      $("#pl").innerHTML = `<div class="grid g4" style="margin-bottom:16px">
          <div class="tile"><div class="lbl">${icon("receipt")}Net sales</div><div class="val">${rm(x.net)}</div><div class="foot">${x.invs.length} invoice(s)</div></div>
          <div class="tile"><div class="lbl">${icon("parts")}Gross profit</div><div class="val">${rm(x.gross)}</div><div class="foot">${margin}% of sales</div></div>
          <div class="tile"><div class="lbl">${icon("money")}Running costs</div><div class="val">${rm(x.expenses)}</div><div class="foot">expenses</div></div>
          <div class="tile"><div class="lbl">${icon(x.profit >= 0 ? "check" : "alert")}Net profit</div><div class="val" style="color:${x.profit >= 0 ? "var(--ok)" : "var(--bad)"}">${x.profit < 0 ? "-" : ""}${rm(Math.abs(x.profit))}</div><div class="foot">${x.profit >= 0 ? "profit" : "loss"}</div></div></div>
        <div class="split"><div class="card flush"><div class="card-h" style="padding:16px 18px 0"><h2>Profit &amp; Loss · ${periodLabel(per)}</h2><div class="r"><button type="button" class="btn ghost sm" id="plCsv">${icon("file")}Excel</button></div></div>
          <table class="tbl fin" style="margin-top:10px"><tbody>
          <tr class="sec"><td colspan="2">Sales</td></tr>${L("Parts", x.parts)}${L("Labour &amp; sundries", x.labour)}${L("Sublet, surcharge &amp; menus", x.other)}${x.discount ? L("Less discounts", -x.discount) : ""}${x.credits ? L("Less credit notes", -x.credits) : ""}${L("<b>Net sales</b>", x.net, "tot")}
          <tr class="sec"><td colspan="2">Cost of sales</td></tr>${L(`Parts used (at cost)${x.estLines ? ` <span class="sm">· ${x.estLines} line(s) estimated</span>` : ""}`, -x.cost)}${x.sublet ? L("Sublet &amp; parts bought for jobs", -x.sublet) : ""}${L(`<b>Gross profit</b> <span class="sm">${margin}%</span>`, x.gross, "tot")}
          <tr class="sec"><td colspan="2">Running costs</td></tr>${Object.entries(x.cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => L(esc(k), -v)).join("") || `<tr><td class="sm" colspan="2">No expenses recorded</td></tr>`}${L("<b>Total running costs</b>", -x.expenses, "tot")}
          ${L(`<b>Net ${x.profit >= 0 ? "profit" : "loss"}</b>`, x.profit, "grand")}</tbody></table></div>
        <div><div class="card"><h2>Cash in and out</h2><div class="sum">
          <div><span class="muted">Payments received</span><span>${rm(x.cashIn)}</span></div>
          <div><span class="muted">Refunds paid</span><span>-${rm(x.refunds)}</span></div>
          <div><span class="muted">Expenses paid</span><span>-${rm(x.spent)}</span></div>
          <div><span class="muted">Supplier bills paid</span><span>-${rm(x.bills)}</span></div>
          <div class="big"><span>Net cash</span><span style="color:${x.cashIn - x.refunds - x.spent - x.bills >= 0 ? "var(--ok)" : "var(--bad)"}">${rm(x.cashIn - x.refunds - x.spent - x.bills)}</span></div></div>
          <p class="hint">Profit is not the same as cash: parts bought for stock are a cost only when used on a job, and customers may still owe you.</p></div>
          ${x.estLines ? `<div class="notice warn">${icon("alert")}<div>${x.estLines} part line(s) were not picked from stock, so their cost is estimated from your ${esc(state.settings.markupPercent)}% markup. Pick parts from stock for exact profit.</div></div>` : ""}
          <div class="card"><h2>Export to Excel</h2><p class="muted" style="margin-top:-6px">For your accountant · ${periodLabel(per)}</p><div class="stack">
            <button type="button" class="btn alt block" data-x="inv">${icon("file")}Invoices</button><button type="button" class="btn alt block" data-x="pay">${icon("file")}Payments received</button>
            <button type="button" class="btn alt block" data-x="exp">${icon("file")}Expenses</button><button type="button" class="btn alt block" data-x="bill">${icon("file")}Supplier bills</button><button type="button" class="btn alt block" data-x="cn">${icon("file")}Credit notes</button></div></div></div></div>`;
      const tag = per.slice(2);
      $("#plCsv").onclick = () => {
        const rows = [["Net sales: parts", x.parts], ["Net sales: labour & sundries", x.labour], ["Net sales: sublet, surcharge & menus", x.other], ["Less discounts", -x.discount], ["Less credit notes", -x.credits], ["Net sales", x.net], ["Parts used at cost", -x.cost], ["Sublet (outside work)", -x.sublet], ["Gross profit", x.gross],
          ...Object.entries(x.cats).map(([k, v]) => [k, -v]), ["Total running costs", -x.expenses], ["Net profit", x.profit]];
        downloadCsv(`profit-and-loss-${tag}.csv`, [["Line", (r0) => r0[0]], ["RM", (r0) => r0[1].toFixed(2)]], rows);
      };
      const EX = {
        inv: () => downloadCsv(`invoices-${tag}.csv`, [["Invoice no", (j) => j.invoiceNo], ["Date", (j) => j.invoiceDate], ["Customer", (j) => j.customerName], ["Plate", (j) => j.plate], ["Total (RM)", (j) => j.total.toFixed(2)], ["Credited (RM)", (j) => (j.credited || 0).toFixed(2)], ["Paid (RM)", (j) => j.paid.toFixed(2)], ["Balance (RM)", (j) => j.balance.toFixed(2)], ["Status", (j) => j.status]], x.invs),
        pay: () => downloadCsv(`payments-${tag}.csv`, [["Receipt no", (p) => p.receiptNo], ["Date", (p) => p.paidOn], ["Customer", (p) => p.customerName], ["For", (p) => p.docNo], ["Method", (p) => p.method], ["Reference", (p) => p.reference], ["Amount (RM)", (p) => p.amount.toFixed(2)]], state.payments.filter((p) => inRange(p.paidOn, r))),
        exp: () => downloadCsv(`expenses-${tag}.csv`, [["Date", (e) => e.date], ["Description", (e) => e.description], ["Category", (e) => e.category], ["Paid to", (e) => e.paidTo], ["Method", (e) => e.method], ["Amount (RM)", (e) => e.amount.toFixed(2)]], state.expenses.filter((e) => inRange(e.date, r))),
        bill: () => downloadCsv(`supplier-bills-${tag}.csv`, [["Ref", (p) => p.ref], ["Date", (p) => p.date], ["Supplier", (p) => p.supplier], ["Supplier receipt no", (p) => p.receiptNo], ["Total (RM)", (p) => p.total.toFixed(2)], ["Status", (p) => p.status], ["Paid on", (p) => p.paidOn]], state.purchases.filter((p) => inRange(p.date, r))),
        cn: () => downloadCsv(`credit-notes-${tag}.csv`, [["CN no", (c) => c.no], ["Date", (c) => c.date], ["Invoice", (c) => c.invoiceNo], ["Customer", (c) => c.customerName], ["Reason", (c) => c.reason], ["Amount (RM)", (c) => c.amount.toFixed(2)], ["Refund (RM)", (c) => c.refund.toFixed(2)]], state.creditnotes.filter((c) => inRange(c.date, r))),
      };
      $$("[data-x]").forEach((b) => (b.onclick = () => EX[b.dataset.x]()));
    };
    draw();
  }

  // ---------- balance sheet ----------

  function pageBalance() {
    crumbs([["Balance sheet"]]);
    const s = state.settings;
    const t = todayKL();
    const from = s.openingDate || "0000-01-01";
    const after = (d) => !!d && d >= from && d <= t;
    const opening = Number(s.openingCash) || 0;
    const cashIn = sum(state.payments.filter((p) => after(p.paidOn)), (p) => p.amount);
    const refunds = sum(state.creditnotes.filter((c) => after(c.date)), (c) => c.refund);
    const spent = sum(state.expenses.filter((x) => after(x.date)), (x) => x.amount);
    const bills = sum(state.purchases.filter((p) => p.status === "Paid" && after(p.paidOn || p.date)), (p) => p.total);
    const cash = opening + cashIn - refunds - spent - bills;
    const owedToYou = sum(owedInvoices(), (j) => j.balance);
    const stock = sum(state.parts.filter((p) => p.qtyLeft > 0), (p) => p.qtyLeft * p.unitCost);
    const equipment = sum(state.expenses.filter((x) => x.category === "Tools & equipment (asset)"), (x) => x.amount);
    const assets = cash + owedToYou + stock + equipment;
    const owedSuppliers = sum(state.purchases.filter((p) => p.status === "Unpaid"), (p) => p.total);
    const deposits = sum(state.jobs.filter((j) => !j.invoiceNo && j.status !== "Cancelled"), (j) => j.paid);
    const liabilities = owedSuppliers + deposits;
    const capital = Number(s.ownerCapital) || 0;
    const drawings = sum(state.expenses.filter((x) => x.category === "Owner drawings"), (x) => x.amount);
    const kept = assets - liabilities - capital + drawings;
    const L = (label, v, cls = "", note = "") => `<tr class="${cls}"><td>${label}${note ? `<div class="sm">${note}</div>` : ""}</td><td class="num">${v < 0 ? "-" + rm(-v) : rm(v)}</td></tr>`;
    view.innerHTML = `${pageHead("Balance sheet", { sub: `What the business owns and owes, as at ${dmy(t)}` })}
      ${s.openingDate ? "" : `<div class="notice warn">${icon("alert")}<div>Set your <b>opening cash</b>, <b>opening date</b> and <b>owner capital</b> in <a href="#/settings">Settings</a>, so the cash figure is right.</div></div>`}
      <div class="grid g3" style="margin-bottom:16px">
        <div class="tile"><div class="lbl">${icon("parts")}Owns</div><div class="val">${rm(assets)}</div><div class="foot">total assets</div></div>
        <div class="tile"><div class="lbl">${icon("alert")}Owes</div><div class="val">${rm(liabilities)}</div><div class="foot">total liabilities</div></div>
        <div class="tile"><div class="lbl">${icon("check")}Worth</div><div class="val">${rm(assets - liabilities)}</div><div class="foot">owner's equity</div></div></div>
      <div class="split"><div class="card flush"><div class="card-h" style="padding:16px 18px 0"><h2>Balance sheet · ${dmy(t)}</h2><div class="r"><button type="button" class="btn ghost sm" id="bsCsv">${icon("file")}Excel</button></div></div>
        <table class="tbl fin" style="margin-top:10px"><tbody>
        <tr class="sec"><td colspan="2">What the business owns (assets)</td></tr>
        ${L("Cash &amp; bank", cash, "", `Opening ${rm(opening)}${s.openingDate ? " on " + dmy(s.openingDate) : ""} + money in − money out`)}${L("Customers owe you", owedToYou, "", `${owedInvoices().length} unpaid invoice(s)`)}${L("Parts in stock (at cost)", stock)}${L("Tools &amp; equipment", equipment, "", "at purchase price")}
        ${L("<b>Total assets</b>", assets, "tot")}
        <tr class="sec"><td colspan="2">What the business owes (liabilities)</td></tr>
        ${L("Supplier bills not paid", owedSuppliers)}${L("Customer deposits", deposits, "", "paid on estimates not yet invoiced")}${L("<b>Total liabilities</b>", liabilities, "tot")}
        <tr class="sec"><td colspan="2">Owner's equity</td></tr>
        ${L("Owner capital", capital)}${L("Less owner drawings", -drawings)}${L("Profit kept in the business", kept, "", "the balancing figure")}${L("<b>Total equity</b>", assets - liabilities, "grand")}
        </tbody></table></div>
        <div><div class="card"><h2>About this balance sheet</h2><p class="muted" style="margin:0">It is built from the records in this DMS, so it is only as complete as they are. Record every expense and supplier bill. It is not audited: give it to your accountant to check.</p></div></div></div>`;
    $("#bsCsv").onclick = () => downloadCsv(`balance-sheet-${t}.csv`, [["Line", (r0) => r0[0]], ["RM", (r0) => r0[1].toFixed(2)]],
      [["Cash & bank", cash], ["Customers owe you", owedToYou], ["Parts in stock (at cost)", stock], ["Tools & equipment", equipment], ["Total assets", assets], ["Supplier bills not paid", owedSuppliers], ["Customer deposits", deposits], ["Total liabilities", liabilities], ["Owner capital", capital], ["Less owner drawings", -drawings], ["Profit kept in the business", kept], ["Total equity", assets - liabilities]]);
  }

  // ---------- financial statements (MPERS) ----------
  // Malaysian Private Entities Reporting Standard layout, built from the DMS
  // records: statement of financial position, profit or loss and other
  // comprehensive income, changes in equity, cash flows (direct method) and
  // notes. Read-only; it never changes any record.

  const DEP_RATE = 0.2; // tools & equipment: straight line over 5 years
  const FS_COS = ["Sublet (outside work)", "Parts for jobs (no stock)"];
  const FS_SELL = ["Marketing"];
  const FS_FIN = ["Bank fees"];

  function fsAt(t) {
    // Balances as at date t (yyyy-mm-dd).
    const s = state.settings;
    const from = s.openingDate || "0000-01-01";
    const upto = (d) => !!d && d >= from && d <= t;
    const opening = t >= from ? Number(s.openingCash) || 0 : 0;
    const cashIn = sum(state.payments.filter((p) => upto(p.paidOn)), (p) => p.amount);
    const refunds = sum(state.creditnotes.filter((c) => upto(c.date)), (c) => c.refund);
    const spent = sum(state.expenses.filter((x) => upto(x.date)), (x) => x.amount);
    const bills = sum(state.purchases.filter((p) => p.status === "Paid" && upto(p.paidOn || p.date)), (p) => p.total);
    const cash = opening + cashIn - refunds - spent - bills;
    // Trade receivables: invoices dated on or before t, less credit notes and payments up to t.
    const recv = [];
    for (const j of state.jobs) {
      if (!j.invoiceNo || j.status === "Cancelled" || !j.invoiceDate || j.invoiceDate > t) continue;
      const credited = sum(state.creditnotes.filter((c) => c.jobId === j.id && c.date <= t), (c) => c.amount);
      const paid = sum(state.payments.filter((p) => p.jobId === j.id && p.paidOn <= t), (p) => p.amount);
      const bal = Math.round((j.total - credited - paid) * 100) / 100;
      if (bal > 0.009) recv.push({ j, bal, days: Math.round((Date.parse(t) - Date.parse(j.invoiceDate)) / 864e5) });
    }
    const receivables = sum(recv, (r) => r.bal);
    const stock = sum(state.parts.filter((p) => p.qtyLeft > 0), (p) => p.qtyLeft * p.unitCost);
    // Property, plant and equipment: tools bought, depreciated monthly.
    const tools = state.expenses.filter((x) => x.category === "Tools & equipment (asset)" && x.date && x.date <= t);
    const months = (a, b) => Math.max(0, (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7)) + 1);
    const ppeCost = sum(tools, (x) => x.amount);
    const accDep = sum(tools, (x) => Math.min(x.amount, (x.amount * DEP_RATE * months(x.date, t)) / 12));
    const payables = sum(state.purchases.filter((p) => p.date && p.date <= t && (p.status === "Unpaid" || (p.paidOn && p.paidOn > t))), (p) => p.total);
    const deposits = sum(state.jobs.filter((j) => j.status !== "Cancelled" && (!j.invoiceNo || j.invoiceDate > t)), (j) => sum(state.payments.filter((p) => p.jobId === j.id && p.paidOn <= t), (p) => p.amount));
    const drawingsTo = sum(state.expenses.filter((x) => x.category === "Owner drawings" && x.date && x.date <= t), (x) => x.amount);
    return { t, cash, opening, receivables, recv, stock, ppeCost, accDep, ppe: ppeCost - accDep, payables, deposits, drawingsTo,
      assets: cash + receivables + stock + ppeCost - accDep, liabilities: payables + deposits };
  }

  function fsYear(year) {
    const today = todayKL();
    const a = `${year}-01-01`;
    const b = `${year}-12-31` < today ? `${year}-12-31` : today;
    const prevEnd = `${year - 1}-12-31`;
    const x = pnlFor([a, b]);
    const end = fsAt(b);
    const start = fsAt(prevEnd);
    const exp = state.expenses.filter((e) => inRange(e.date, [a, b]));
    const by = (cats) => sum(exp.filter((e) => cats.includes(e.category)), (e) => e.amount);
    const revenue = x.net;
    const cos = x.cost + by(FS_COS);
    const selling = by(FS_SELL);
    const finance = by(FS_FIN);
    const depreciation = end.accDep - start.accDep;
    const adminCats = {};
    exp.filter((e) => !NOT_PNL.includes(e.category) && ![...FS_COS, ...FS_SELL, ...FS_FIN].includes(e.category)).forEach((e) => (adminCats[e.category] = (adminCats[e.category] || 0) + e.amount));
    const admin = sum(Object.values(adminCats), (v) => v) + depreciation;
    const profit = revenue - cos - selling - admin - finance;
    const s = state.settings;
    const firstYear = !s.openingDate || s.openingDate.slice(0, 4) === String(year);
    const capitalIn = firstYear ? Number(s.ownerCapital) || 0 : 0;
    const drawings = sum(exp.filter((e) => e.category === "Owner drawings"), (e) => e.amount);
    const equityOpen = firstYear ? 0 : start.assets - start.liabilities;
    const equityClose = end.assets - end.liabilities;
    const diff = Math.round((equityClose - (equityOpen + capitalIn + profit - drawings)) * 100) / 100;
    // Cash flows (direct method) for the part of the year after the opening date.
    const from = s.openingDate && s.openingDate > a ? s.openingDate : a;
    const r = [from, b];
    const cfOpen = s.openingDate && s.openingDate >= a ? Number(s.openingCash) || 0 : start.cash;
    const fromCustomers = sum(state.payments.filter((p) => inRange(p.paidOn, r)), (p) => p.amount) - sum(state.creditnotes.filter((c) => inRange(c.date, r)), (c) => c.refund);
    const toSuppliers = sum(state.purchases.filter((p) => p.status === "Paid" && inRange(p.paidOn || p.date, r)), (p) => p.total);
    const opEx = sum(state.expenses.filter((e) => inRange(e.date, r) && !NOT_PNL.includes(e.category)), (e) => e.amount);
    const ppeBought = sum(state.expenses.filter((e) => inRange(e.date, r) && e.category === "Tools & equipment (asset)"), (e) => e.amount);
    const drawn = sum(state.expenses.filter((e) => inRange(e.date, r) && e.category === "Owner drawings"), (e) => e.amount);
    const cfOps = fromCustomers - toSuppliers - opEx;
    const cfInv = -ppeBought;
    const cfFin = -drawn;
    return { year, a, b, x, end, start, revenue, cos, gross: revenue - cos, selling, admin, adminCats, depreciation, finance, profit, firstYear, capitalIn, drawings, equityOpen, equityClose, diff,
      cf: { from, fromCustomers, toSuppliers, opEx, cfOps, ppeBought, cfInv, drawn, cfFin, net: cfOps + cfInv + cfFin, open: cfOpen, close: cfOpen + cfOps + cfInv + cfFin } };
  }

  function pageStatements(q) {
    crumbs([["Financial statements"]]);
    const thisYear = Number(todayKL().slice(0, 4));
    const years = [];
    const firstData = [state.settings.openingDate, ...state.jobs.map((j) => j.invoiceDate), ...state.expenses.map((e) => e.date)].filter(Boolean).sort()[0];
    for (let y = thisYear; y >= Math.min(thisYear, Number((firstData || String(thisYear)).slice(0, 4))); y--) years.push(y);
    let year = Number(q.get("y")) || thisYear;
    const s = state.settings;
    const name = s.legalName || "TNS Legacy";
    view.innerHTML = `${pageHead("Financial statements", { sub: "MPERS format · Malaysian Private Entities Reporting Standard", acts: `<button type="button" class="btn alt" id="fsCsv">${icon("download")}Excel</button><button type="button" class="btn" id="fsPrint">${icon("print")}Print / PDF</button>` })}
      <div class="toolbar"><div class="seg" id="fsYears">${years.map((y) => `<button type="button" data-y="${y}">${y}</button>`).join("")}</div><span class="muted" id="fsPer"></span></div>
      <div id="fs"></div>`;
    const draw = () => {
      $$("#fsYears button").forEach((b) => b.classList.toggle("on", Number(b.dataset.y) === year));
      const f = fsYear(year);
      const e = f.end;
      const ongoing = f.b !== `${year}-12-31`;
      $("#fsPer").textContent = `${dmy(f.a)} to ${dmy(f.b)}${ongoing ? " (year to date)" : ""}`;
      const N = (v) => (Math.abs(v) < 0.005 ? "–" : v < 0 ? `(${rm(-v).replace("RM ", "")})` : rm(v).replace("RM ", ""));
      const L = (label, v, cls = "", note = "") => `<tr class="${cls}"><td>${label}</td><td class="nt">${note}</td><td class="num">${N(v)}</td></tr>`;
      const H = (label) => `<tr class="sec"><td colspan="3">${label}</td></tr>`;
      const head = `<thead><tr><th></th><th class="nt">Note</th><th class="num">RM</th></tr></thead>`;
      const T = (title, rows) => `<div class="card flush fs-st"><div class="card-h"><h2>${title}</h2></div><div class="tbl-wrap"><table class="tbl fin keep">${head}<tbody>${rows}</tbody></table></div></div>`;
      const ageing = [[0, 30, "0–30 days"], [31, 60, "31–60 days"], [61, 90, "61–90 days"], [91, 1e9, "Over 90 days"]].map(([lo, hi, l]) => [l, sum(e.recv.filter((r) => r.days >= lo && r.days <= hi), (r) => r.bal)]);
      $("#fs").innerHTML = `
        <div class="card fs-cover"><div class="eyebrow">Financial statements for the financial year ended ${dmy(`${year}-12-31`)}${ongoing ? " · year to date " + dmy(f.b) : ""}</div>
          <h2 class="h2" style="margin:6px 0 2px">${esc(name)} <span class="muted">(trading as The Merc Lab)</span></h2>
          <div class="muted">${s.registrationNo ? "Registration no. " + esc(s.registrationNo) + " · " : ""}Sole proprietorship registered in Malaysia · Amounts in Ringgit Malaysia (RM)</div>
          ${f.diff ? `<div class="notice warn" style="margin-top:12px">${icon("alert")}<div>The equity movement does not fully reconcile by <b>${rm(Math.abs(f.diff))}</b>. Usually a record is missing (an expense, supplier bill or opening balance). Shown as "Unreconciled difference" in the statement of changes in equity for your accountant to clear.</div></div>` : ""}</div>

        ${T(`Statement of financial position as at ${dmy(f.b)}`, `
          ${H("Assets")}<tr class="sub"><td colspan="3">Non-current assets</td></tr>${L("Property, plant and equipment", e.ppe, "", "4")}${L("<b>Total non-current assets</b>", e.ppe, "tot")}
          <tr class="sub"><td colspan="3">Current assets</td></tr>${L("Inventories", e.stock, "", "5")}${L("Trade receivables", e.receivables, "", "6")}${L("Cash and bank balances", e.cash, "", "7")}${L("<b>Total current assets</b>", e.stock + e.receivables + e.cash, "tot")}
          ${L("<b>TOTAL ASSETS</b>", e.assets, "grand")}
          ${H("Owner's equity and liabilities")}${L("Owner's equity", f.equityClose, "", "SOCE")}
          <tr class="sub"><td colspan="3">Current liabilities</td></tr>${L("Trade payables", e.payables, "", "8")}${L("Customer deposits (contract liabilities)", e.deposits, "", "8")}${L("<b>Total current liabilities</b>", e.liabilities, "tot")}
          ${L("<b>TOTAL EQUITY AND LIABILITIES</b>", f.equityClose + e.liabilities, "grand")}`)}

        ${T(`Statement of profit or loss and other comprehensive income for the year ended ${dmy(`${year}-12-31`)}`, `
          ${L("Revenue", f.revenue, "", "9")}${L("Cost of sales", -f.cos, "", "10")}${L("<b>Gross profit</b>", f.gross, "tot")}
          ${L("Other income", 0)}${L("Selling and distribution expenses", -f.selling, "", "10")}${L("Administrative and other operating expenses", -f.admin, "", "10")}${L("Finance costs", -f.finance, "", "10")}
          ${L("<b>Profit before tax</b>", f.profit, "tot")}${L("Income tax expense", 0, "", "11")}${L(`<b>Profit for the ${ongoing ? "period" : "year"}</b>`, f.profit, "tot")}
          ${L("Other comprehensive income", 0)}${L(`<b>Total comprehensive income for the ${ongoing ? "period" : "year"}</b>`, f.profit, "grand")}`)}

        ${T("Statement of changes in owner's equity", `
          ${L(`At 1 January ${year}`, f.equityOpen)}${f.capitalIn ? L("Capital introduced", f.capitalIn) : ""}${L(`Profit for the ${ongoing ? "period" : "year"}`, f.profit)}${L("Drawings", -f.drawings, "", "12")}
          ${f.diff ? L("Unreconciled difference (to be cleared by the accountant)", f.diff) : ""}${L(`<b>At ${dmy(f.b)}</b>`, f.equityClose, "grand")}`)}

        ${T("Statement of cash flows (direct method)", `
          ${H("Cash flows from operating activities")}${L("Receipts from customers (net of refunds)", f.cf.fromCustomers)}${L("Payments to suppliers for parts", -f.cf.toSuppliers)}${L("Payments for operating expenses", -f.cf.opEx)}${L("<b>Net cash from operating activities</b>", f.cf.cfOps, "tot")}
          ${H("Cash flows from investing activities")}${L("Purchase of property, plant and equipment", -f.cf.ppeBought)}${L("<b>Net cash used in investing activities</b>", f.cf.cfInv, "tot")}
          ${H("Cash flows from financing activities")}${L("Drawings by the owner", -f.cf.drawn)}${L("<b>Net cash used in financing activities</b>", f.cf.cfFin, "tot")}
          ${L("<b>Net change in cash and bank balances</b>", f.cf.net, "tot")}${L(`Cash and bank balances at ${dmy(f.cf.from)}${state.settings.openingDate && state.settings.openingDate >= f.a ? " (opening balance)" : ""}`, f.cf.open)}${L(`<b>Cash and bank balances at ${dmy(f.b)}</b>`, f.cf.close, "grand", "7")}`)}

        <div class="card fs-notes"><div class="card-h"><h2>Notes to the financial statements</h2></div>
          <h3 class="h3">1. General information</h3><p>${esc(name)} is a sole proprietorship registered in Malaysia, trading as The Merc Lab. Its principal activity is the repair, servicing and maintenance of Mercedes-Benz vehicles and the sale of related parts.</p>
          <h3 class="h3">2. Basis of preparation</h3><p>These financial statements are prepared in accordance with the Malaysian Private Entities Reporting Standard (MPERS) issued by the Malaysian Accounting Standards Board, under the historical cost convention, and are presented in Ringgit Malaysia (RM). They are compiled from the records kept in the Merc Lab DMS and have not been audited.</p>
          <h3 class="h3">3. Significant accounting policies</h3>
          <p><b>Revenue (Section 23).</b> Revenue from repair services and parts is recognised when the work is completed and invoiced, at the invoiced amount less discounts and credit notes.</p>
          <p><b>Inventories (Section 13).</b> Parts are stated at the lower of cost and estimated selling price less costs to sell. Cost is the purchase price per supplier receipt.</p>
          <p><b>Property, plant and equipment (Section 17).</b> Tools and equipment are stated at cost less accumulated depreciation, depreciated on a straight-line basis at ${DEP_RATE * 100}% a year from the month of purchase.</p>
          <p><b>Financial instruments (Section 11).</b> Trade receivables and payables are measured at the transaction price. Receivables are reviewed for impairment at the reporting date.</p>
          <p><b>Income tax (Section 29).</b> As a sole proprietorship, the business is not taxed separately. Its income is assessed on the owner personally (Form B), so no tax is charged in these statements.</p>
          <h3 class="h3">4. Property, plant and equipment</h3>${fsTable([["Cost", e.ppeCost], ["Accumulated depreciation", -e.accDep], ["Carrying amount", e.ppe], [`Depreciation charge for the ${ongoing ? "period" : "year"}`, f.depreciation]])}
          <h3 class="h3">5. Inventories</h3>${fsTable([["Parts in stock, at cost", e.stock]])}<p class="hint">Stock is valued from the quantities in the DMS on the day this report is opened. Do a stock count close to the year end.</p>
          <h3 class="h3">6. Trade receivables</h3>${fsTable([...ageing, ["Total", e.receivables]])}
          <h3 class="h3">7. Cash and bank balances</h3>${fsTable([["Cash and bank", e.cash]])}<p class="hint">Opening balance ${rm(e.opening)}${state.settings.openingDate ? " on " + dmy(state.settings.openingDate) : ""}, plus money received, less money paid.</p>
          <h3 class="h3">8. Trade payables and customer deposits</h3>${fsTable([["Supplier bills not yet paid", e.payables], ["Deposits received on estimates not yet invoiced", e.deposits]])}
          <h3 class="h3">9. Revenue</h3>${fsTable([["Parts", f.x.parts], ["Labour and sundries", f.x.labour], ["Sublet, surcharge and menus", f.x.other], ["Less discounts", -f.x.discount], ["Less credit notes", -f.x.credits], ["Revenue", f.revenue]])}
          <h3 class="h3">10. Expenses by nature</h3>${fsTable([["Parts used (at cost)", f.x.cost], ...FS_COS.map((c) => [c, sum(state.expenses.filter((x) => x.category === c && inRange(x.date, [f.a, f.b])), (x) => x.amount)]), ...Object.entries(f.adminCats).sort((p, q2) => q2[1] - p[1]), ["Depreciation", f.depreciation], ["Marketing", f.selling], ["Bank fees", f.finance]].filter(([, v]) => Math.abs(v) > 0.004))}
          ${f.x.estLines ? `<p class="hint">${f.x.estLines} part line(s) were not picked from stock, so their cost is estimated from the ${esc(state.settings.markupPercent)}% markup.</p>` : ""}
          <h3 class="h3">11. Income tax</h3><p>No tax expense is recognised. The owner declares the business income on Form B.</p>
          <h3 class="h3">12. Related party transactions</h3><p>Drawings by the owner during the ${ongoing ? "period" : "year"}: ${rm(f.drawings)}.</p>
          <p class="hint" style="margin-top:16px">Prepared from the DMS records. Give these to your accountant or tax agent to review before filing.</p></div>`;
      $("#fsCsv").onclick = () => {
        const rows = [["Statement of financial position", ""], ["Property, plant and equipment", e.ppe], ["Inventories", e.stock], ["Trade receivables", e.receivables], ["Cash and bank balances", e.cash], ["Total assets", e.assets], ["Owner's equity", f.equityClose], ["Trade payables", e.payables], ["Customer deposits", e.deposits], ["Total equity and liabilities", f.equityClose + e.liabilities],
          ["Profit or loss", ""], ["Revenue", f.revenue], ["Cost of sales", -f.cos], ["Gross profit", f.gross], ["Selling and distribution expenses", -f.selling], ["Administrative and other operating expenses", -f.admin], ["Finance costs", -f.finance], ["Profit for the year", f.profit],
          ["Changes in equity", ""], ["Opening equity", f.equityOpen], ["Capital introduced", f.capitalIn], ["Profit", f.profit], ["Drawings", -f.drawings], ["Unreconciled difference", f.diff], ["Closing equity", f.equityClose],
          ["Cash flows", ""], ["Receipts from customers", f.cf.fromCustomers], ["Payments to suppliers", -f.cf.toSuppliers], ["Operating expenses paid", -f.cf.opEx], ["Purchase of PPE", -f.cf.ppeBought], ["Drawings", -f.cf.drawn], ["Opening cash", f.cf.open], ["Closing cash", f.cf.close]];
        downloadCsv(`financial-statements-${year}.csv`, [["Line", (r0) => r0[0]], ["RM", (r0) => (r0[1] === "" ? "" : Number(r0[1]).toFixed(2))]], rows);
      };
    };
    $("#fsYears").onclick = (ev) => {
      const b = ev.target.closest("button[data-y]");
      if (!b) return;
      year = Number(b.dataset.y);
      history.replaceState(null, "", `#/statements?y=${year}`);
      draw();
    };
    $("#fsPrint").onclick = () => window.print();
    draw();
  }

  function fsTable(rows) {
    return `<table class="tbl fin keep fs-note"><tbody>${rows.map(([l, v]) => `<tr><td>${esc(l)}</td><td class="num">${Math.abs(v) < 0.005 ? "–" : v < 0 ? `(${rm(-v).replace("RM ", "")})` : rm(v).replace("RM ", "")}</td></tr>`).join("")}</tbody></table>`;
  }

  // ================= STOCK =================

  const supplierOwed = (name) => state.purchases.filter((p) => p.status === "Unpaid" && p.supplier.toLowerCase() === String(name).toLowerCase());

  function supplierDialog(sp) {
    const m = modal(sp ? sp.name : "Add supplier", `<form id="spf" novalidate><div class="fgrid">
      <div class="full"><label for="sp_n" class="req">Name</label><input id="sp_n" name="name" value="${esc(sp?.name)}"></div>
      <div><label for="sp_p">Phone</label><input id="sp_p" name="phone" type="tel" value="${esc(sp?.phone)}"></div><div><label for="sp_c">Contact person</label><input id="sp_c" name="contact" value="${esc(sp?.contact)}"></div>
      <div><label for="sp_a">Your account no</label><input id="sp_a" name="accountNo" value="${esc(sp?.accountNo)}"></div><div><label for="sp_t">Pay within (days)</label><input id="sp_t" name="termsDays" type="number" min="0" inputmode="numeric" value="${esc(sp?.termsDays ?? "")}"></div>
      <div class="full"><label for="sp_no">Notes</label><textarea id="sp_no" name="notes" rows="2">${esc(sp?.notes)}</textarea></div></div>
      <div class="btns"><button class="btn" type="submit">${icon("check")}Save</button></div></form>`);
    m.$("#spf").onsubmit = async (e) => {
      e.preventDefault();
      busy(e.submitter, true, "Saving…");
      try {
        if (sp) await api(`/suppliers/${sp.id}`, { method: "PATCH", body: formObj(e.target) });
        else await api("/suppliers", { method: "POST", body: formObj(e.target) });
        await refresh("suppliers");
        m.close();
        toast("Supplier saved");
        route();
      } catch (err) {
        toast(err.message, "err");
        busy(e.submitter, false);
      }
    };
  }

  function pageSuppliers() {
    crumbs([["Suppliers"]]);
    const t = todayKL();
    const unpaid = state.purchases.filter((p) => p.status === "Unpaid").sort((a, b) => (a.dueDate || a.date).localeCompare(b.dueDate || b.date));
    const names = new Set(state.suppliers.map((s) => s.name.toLowerCase()));
    const extra = [...new Set(state.purchases.map((p) => p.supplier).filter((n) => n && !names.has(n.toLowerCase())))];
    view.innerHTML = `${pageHead("Suppliers", { sub: "Who you buy parts from, and what you still owe them", acts: `<button class="btn" id="spAdd">${icon("plus")}Add supplier</button>` })}
      <div class="grid g2" style="margin-bottom:16px"><div class="tile"><div class="lbl">${icon("alert")}You owe suppliers</div><div class="val">${rm(sum(unpaid, (p) => p.total))}</div><div class="foot">${unpaid.length} unpaid bill(s)</div></div>
        <div class="tile"><div class="lbl">${icon("calendar")}Overdue</div><div class="val">${rm(sum(unpaid.filter((p) => p.dueDate && p.dueDate < t), (p) => p.total))}</div><div class="foot">past the due date</div></div></div>
      <div class="card flush"><div class="card-h" style="padding:16px 18px 0"><h2>Bills to pay</h2></div>${unpaid.length ? `<div class="tbl-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>Supplier</th><th class="d">Ref</th><th class="d">Bought</th><th>Due</th><th class="num">Amount</th><th></th></tr></thead><tbody>
        ${unpaid.map((p) => `<tr><td class="strong">${esc(p.supplier)}<div class="sm">${esc(p.receiptNo || p.ref)}</div></td><td class="d">${esc(p.ref)}</td><td class="d nowrap">${dmy(p.date)}</td><td class="nowrap">${p.dueDate ? (p.dueDate < t ? pill(dmy(p.dueDate), "bad") : dmy(p.dueDate)) : "—"}</td><td class="num strong">${rm(p.total)}</td>
          <td class="num"><button type="button" class="btn alt sm" data-pay="${p.id}">${icon("check")}Paid</button></td></tr>`).join("")}</tbody></table></div>` : `<div style="padding:4px 18px 18px" class="muted">${icon("check")} Nothing owed to suppliers.</div>`}</div>
      <div class="card flush"><div class="card-h" style="padding:16px 18px 0"><h2>Suppliers</h2></div>${state.suppliers.length || extra.length ? `<div class="tbl-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>Name</th><th class="d">Phone</th><th class="d">Terms</th><th class="num d">Bills</th><th class="num">Owed</th></tr></thead><tbody>
        ${state.suppliers.map((s) => `<tr class="tap" data-sp="${s.id}" tabindex="0"><td class="strong">${esc(s.name)}<div class="sm">${esc(s.contact)}</div></td><td class="d">${esc(s.phone)}</td><td class="d">${s.termsDays ? s.termsDays + " days" : "—"}</td>
          <td class="num d">${state.purchases.filter((p) => p.supplier.toLowerCase() === s.name.toLowerCase()).length}</td><td class="num strong">${rm(sum(supplierOwed(s.name), (p) => p.total))}</td></tr>`).join("")}
        ${extra.map((n) => `<tr><td>${esc(n)}<div class="sm">From receipts · <button type="button" class="btn ghost sm" data-addsp="${esc(n)}">Add details</button></div></td><td class="d"></td><td class="d"></td><td class="num d">${state.purchases.filter((p) => p.supplier === n).length}</td><td class="num strong">${rm(sum(supplierOwed(n), (p) => p.total))}</td></tr>`).join("")}
        </tbody></table></div>` : emptyBox("parts", "No suppliers yet. They appear here from your supplier receipts.")}</div>`;
    $("#spAdd").onclick = () => supplierDialog(null);
    $$("[data-sp]").forEach((el) => (el.onclick = () => supplierDialog(state.suppliers.find((s) => s.id === el.dataset.sp))));
    $$("[data-addsp]").forEach((b) => (b.onclick = async () => {
      try { await api("/suppliers", { method: "POST", body: { name: b.dataset.addsp } }); await refresh("suppliers"); route(); } catch (err) { toast(err.message, "err"); }
    }));
    $$("[data-pay]").forEach((b) => (b.onclick = async () => {
      const d = prompt("Paid on (YYYY-MM-DD):", todayKL());
      if (d === null) return;
      try { await api(`/purchases/${b.dataset.pay}`, { method: "PATCH", body: { status: "Paid", paidOn: d } }); await refresh("purchases"); toast("Marked paid"); route(); } catch (err) { toast(err.message, "err"); }
    }));
  }

  // ---------- parts ordered for a job ----------

  const ORD_CLS = { Ordered: "warn", Arrived: "info", Fitted: "ok", Cancelled: "" };

  function orderDialog(o, job) {
    const d = o || { part: "", qty: 1, jobId: job?.id || "", docNo: job ? docNo(job) : "", plate: job?.plate || "", status: "Ordered" };
    const open = state.jobs.filter((j) => j.status !== "Cancelled" && j.stage !== "Collected");
    const m = modal(o ? "Part order" : "Order a part", `<form id="pof" novalidate><div class="fgrid">
      <div class="full"><label for="po_p" class="req">Part</label><input id="po_p" name="part" value="${esc(d.part)}" placeholder="e.g. Water pump"></div>
      <div><label for="po_n">Part no</label><input id="po_n" name="partNo" value="${esc(d.partNo || "")}"></div><div><label for="po_s">Supplier</label><input id="po_s" name="supplier" list="supList" value="${esc(d.supplier || "")}"></div>
      <div><label for="po_q">Qty</label><input id="po_q" name="qty" type="number" step="any" min="0" value="${esc(d.qty)}"></div><div><label for="po_c">Cost (RM)</label><input id="po_c" name="cost" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(d.cost ?? "")}"></div>
      <div><label for="po_e">Expected</label><input id="po_e" name="eta" type="date" value="${esc(d.eta || "")}"></div>
      <div><label for="po_j">For job</label><select id="po_j" name="jobId"><option value="">— stock / no job —</option>${open.map((j) => `<option value="${j.id}" ${j.id === d.jobId ? "selected" : ""}>${esc(docNo(j))} · ${esc(j.plate)} · ${esc(j.customerName)}</option>`).join("")}</select></div>
      <div class="full"><label for="po_no">Notes</label><input id="po_no" name="notes" value="${esc(d.notes || "")}"></div>
      ${o ? `<div class="full"><label>Status</label><div class="seg" id="poSt">${["Ordered", "Arrived", "Fitted", "Cancelled"].map((x) => `<button type="button" data-s="${x}" class="${x === d.status ? "on" : ""}">${x}</button>`).join("")}</div></div>` : ""}</div>
      <datalist id="supList">${[...new Set([...state.suppliers.map((x) => x.name), ...state.purchases.map((x) => x.supplier)].filter(Boolean))].map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
      <div class="btns"><button class="btn" type="submit">${icon("check")}Save</button></div></form>`);
    let status = d.status;
    const st = m.$("#poSt");
    if (st) st.onclick = (e) => { const b = e.target.closest("[data-s]"); if (!b) return; status = b.dataset.s; $$("#poSt button", m.el).forEach((x) => x.classList.toggle("on", x === b)); };
    m.$("#pof").onsubmit = async (e) => {
      e.preventDefault();
      const b = formObj(e.target);
      const j = state.jobs.find((x) => x.id === b.jobId);
      Object.assign(b, { docNo: j ? docNo(j) : "", plate: j ? j.plate : "" });
      if (o) b.status = status;
      busy(e.submitter, true, "Saving…");
      try {
        if (o) await api(`/partorders/${o.id}`, { method: "PATCH", body: b });
        else await api("/partorders", { method: "POST", body: b });
        await refresh("partorders");
        m.close();
        toast("Saved");
        route();
      } catch (err) {
        toast(err.message, "err");
        busy(e.submitter, false);
      }
    };
  }

  function pageOrders(q) {
    crumbs([["Part orders"]]);
    const t = todayKL();
    let f = q.get("f") || "open";
    const F = { open: ["Waiting", (o) => ["Ordered", "Arrived"].includes(o.status)], fitted: ["Fitted", (o) => o.status === "Fitted"], cancelled: ["Cancelled", (o) => o.status === "Cancelled"], all: ["All", () => true] };
    view.innerHTML = `${pageHead("Part orders", { sub: "Parts ordered for a car, until they arrive and are fitted", acts: `<button class="btn" id="poNew">${icon("plus")}Order a part</button>` })}
      <div class="toolbar"><div class="chips" id="pof2">${Object.entries(F).map(([k, [l, fn]]) => `<button type="button" class="chip ${k === f ? "on" : ""}" data-f="${k}">${l} <span class="n">${state.partorders.filter(fn).length}</span></button>`).join("")}</div></div>
      <div class="card flush" id="poT"></div>`;
    const draw = () => {
      const list = state.partorders.filter(F[f][1]);
      $("#poT").innerHTML = list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Part</th><th>For</th><th class="d">Supplier</th><th class="d">Ordered</th><th>Expected</th><th>Status</th><th></th></tr></thead><tbody>
        ${list.map((o) => `<tr class="tap" data-po="${o.id}"><td class="strong">${esc(o.part)}<div class="sm">${esc([o.partNo, o.qty !== 1 ? "× " + o.qty : "", o.cost ? rm(o.cost) : ""].filter(Boolean).join(" · "))}</div></td>
          <td>${o.jobId ? `<a href="#/jobs/${o.jobId}">${esc(o.docNo)}</a><div class="sm">${plateTag(o.plate)}</div>` : '<span class="sm">Stock</span>'}</td><td class="d">${esc(o.supplier)}</td><td class="d nowrap">${dmy(o.orderedOn)}</td>
          <td class="nowrap">${o.eta ? (o.status === "Ordered" && o.eta < t ? pill(dmy(o.eta), "bad") : dmy(o.eta)) : "—"}</td><td>${pill(o.status, ORD_CLS[o.status])}</td>
          <td class="num nowrap">${o.status === "Ordered" ? `<button type="button" class="btn alt sm" data-st="${o.id}:Arrived">Arrived</button>` : o.status === "Arrived" ? `<button type="button" class="btn alt sm" data-st="${o.id}:Fitted">Fitted</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
        : emptyBox("box", "No part orders here.");
      $$("#poT [data-po]").forEach((el) => (el.onclick = (e) => !e.target.closest("button,a") && orderDialog(state.partorders.find((o) => o.id === el.dataset.po))));
      $$("#poT [data-st]").forEach((b) => (b.onclick = async () => {
        const [id, st] = b.dataset.st.split(":");
        try { await api(`/partorders/${id}`, { method: "PATCH", body: { status: st } }); await refresh("partorders"); toast(`Marked ${st.toLowerCase()}`); draw(); } catch (err) { toast(err.message, "err"); }
      }));
    };
    $("#pof2").onclick = (e) => { const b = e.target.closest("[data-f]"); if (!b) return; f = b.dataset.f; $$("#pof2 .chip").forEach((x) => x.classList.toggle("on", x === b)); draw(); };
    $("#poNew").onclick = () => orderDialog(null, null);
    draw();
  }

  // ---------- stock count ----------

  function pageStockCount() {
    crumbs([["Parts & stock", "#/parts"], ["Stock count"]]);
    const parts = state.parts.slice().sort((a, b) => a.name.localeCompare(b.name));
    view.innerHTML = `${pageHead("Stock count", { back: "#/parts", sub: "Count what is on the shelf. Leave a box empty if you did not count it." })}
      <form id="scf"><div class="card flush"><div class="tbl-wrap"><table class="tbl keep"><thead><tr><th>Part</th><th class="num">System</th><th class="num" style="width:130px">Counted</th></tr></thead><tbody>
      ${parts.map((p) => `<tr><td class="strong">${esc(p.name)}<div class="sm">${esc([p.brand, p.partNo, p.supplier].filter(Boolean).join(" · "))}</div></td><td class="num">${p.qtyLeft}</td>
        <td class="num"><input data-id="${p.id}" type="number" step="any" min="0" inputmode="decimal" aria-label="Counted ${esc(p.name)}" style="text-align:right"></td></tr>`).join("") || `<tr><td colspan="3">${emptyBox("parts", "No parts yet.")}</td></tr>`}
      </tbody></table></div></div>
      <div class="card"><div class="fgrid"><div><label for="scR">Reason</label><input id="scR" value="Stock count" placeholder="e.g. Monthly count, broken, lost"></div></div>
        <div class="btns"><button class="btn" type="submit">${icon("check")}Save count</button></div></div></form>`;
    $("#scf").onsubmit = async (e) => {
      e.preventDefault();
      const counts = $$("#scf input[data-id]").filter((i) => i.value !== "").map((i) => ({ id: i.dataset.id, qty: i.value }));
      if (!counts.length) return toast("Enter at least one count.");
      busy(e.submitter, true, "Saving…");
      try {
        const out = await api("/stockcount", { method: "POST", body: { counts, reason: $("#scR").value } });
        await refresh("parts");
        toast(out.changed ? `${out.changed} part(s) changed` : "No differences");
        location.hash = "#/parts";
      } catch (err) {
        toast(err.message, "err");
        busy(e.submitter, false);
      }
    };
  }

  // ================= INBOX (WhatsApp) =================

  const inboxNew = () => state.inbox.filter((i) => i.status === "New").length;
  const inboxFileLink = (it) => (it?.file ? `<a class="btn ghost sm" href="${esc(it.file.url)}" target="_blank" rel="noopener">${icon("file")}Open the forwarded file</a>` : "");

  function waSetupHtml() {
    const hook = `${location.origin}/wa/webhook`;
    return `<div class="card"><h2>Connect WhatsApp (one time)</h2>
      <p class="muted" style="margin-top:-6px">Then you forward a supplier bill to the workshop's WhatsApp number and it appears here, already read by AI.</p>
      <ol class="steps">
        <li>Get a phone number for the DMS (a new SIM is easiest; it must not be on the normal WhatsApp app).</li>
        <li>On <b>developers.facebook.com</b>: Create app → type <b>Business</b> → add <b>WhatsApp</b>. In <b>API Setup</b>, add the number and verify it by SMS. Copy the <b>Phone number ID</b>.</li>
        <li>In <b>Meta Business settings → System users</b>: add an admin user → <b>Generate token</b> with <i>whatsapp_business_messaging</i> and <i>whatsapp_business_management</i>. Copy the token.</li>
        <li>In the app's <b>Settings → Basic</b>: copy the <b>App secret</b>.</li>
        <li>On <b>Render → merclab-dms → Environment</b>, add:<br><code>WA_TOKEN</code> (the token) · <code>WA_PHONE_ID</code> · <code>WA_APP_SECRET</code> · <code>WA_VERIFY_TOKEN</code> (make up a long word) · <code>WA_ALLOWED</code> (your own number, e.g. 60123456789).</li>
        <li>Back on Meta: <b>WhatsApp → Configuration → Webhook</b>. Callback URL: <code>${esc(hook)}</code> · Verify token: the same word. Then subscribe to <b>messages</b>.</li>
        <li>Save the DMS number in your phone and forward it a bill.</li></ol>
      <p class="hint">Receiving bills and the automatic reply are free on WhatsApp (customer-service messages). Only numbers in WA_ALLOWED are accepted; everything else is ignored.</p></div>`;
  }

  function saveFromInbox(it) {
    const s = it.suggestion || {};
    if (it.kind === "Expense") {
      return expenseDialog({ description: s.items?.[0]?.name ? (s.items.length > 1 ? `${s.items[0].name} and ${s.items.length - 1} more` : s.items[0].name) : s.supplier || "", paidTo: s.supplier || "", date: s.date || "", amount: s.total ?? "", method: "Bank transfer" }, null, !!it.suggestion, it);
    }
    location.hash = it.kind === "Payment slip" ? `#/money?inbox=${it.id}` : `#/parts?inbox=${it.id}`;
  }

  function pageInbox() {
    crumbs([["Inbox"]]);
    const wa = state.whatsapp || {};
    const items = state.inbox.filter((i) => i.status !== "Ignored");
    view.innerHTML = `${pageHead("Inbox", { sub: wa.enabled ? `Bills forwarded on WhatsApp from ${esc((wa.allowed || []).join(", "))}. Check each one, then save.` : "Bills forwarded on WhatsApp land here" })}
      ${wa.enabled ? "" : waSetupHtml()}
      <div class="vlist">${items.length ? items.map((it) => `<div class="card" style="margin:0"><div class="ibx">
          <div class="ibf">${it.file ? (/^image\//.test(it.file.type) && it.file.thumb ? `<a href="${esc(it.file.url)}" target="_blank" rel="noopener"><img src="${esc(it.file.thumb)}" alt="Forwarded bill" loading="lazy"></a>` : `<a href="${esc(it.file.url)}" target="_blank" rel="noopener" class="pdf">${icon("file")}PDF</a>`) : `<span class="pdf">${icon("file")}</span>`}</div>
          <div style="min-width:0"><div class="chips" style="margin-bottom:6px">${pill(it.status, it.status === "New" ? "info" : it.status === "Saved" ? "ok" : it.status === "Failed" ? "bad" : "")}
            <select data-kind="${it.id}" aria-label="What is it" ${it.status === "Saved" ? "disabled" : ""} style="width:auto;min-height:30px;padding:3px 8px;font-size:13px">${opt(["Supplier bill", "Expense", "Payment slip"], it.kind)}</select></div>
            <b>${esc(it.summary)}</b><div class="muted">${it.receivedAt ? new Date(it.receivedAt).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" }) : ""}${it.caption ? ` · "${esc(it.caption)}"` : ""}${it.savedAs ? ` · saved as ${esc(it.savedAs)}` : ""}${it.error ? ` · ${esc(it.error)}` : ""}</div></div>
          <div class="iba">${it.status === "New" ? `<button type="button" class="btn" data-save="${it.id}">${icon("check")}Check &amp; save</button><button type="button" class="btn ghost sm" data-ign="${it.id}">Ignore</button>` : ""}</div></div></div>`).join("")
        : `<div class="card">${emptyBox("receipt", wa.enabled ? "Nothing yet. Forward a supplier bill to the DMS WhatsApp number." : "Nothing yet.")}</div>`}</div>`;
    $$("[data-save]").forEach((b) => (b.onclick = () => saveFromInbox(state.inbox.find((i) => i.id === b.dataset.save))));
    $$("[data-ign]").forEach((b) => (b.onclick = async () => {
      try { await api(`/inbox/${b.dataset.ign}`, { method: "PATCH", body: { status: "Ignored" } }); await refresh("inbox"); route(); } catch (err) { toast(err.message, "err"); }
    }));
    $$("[data-kind]").forEach((s) => (s.onchange = async () => {
      try { await api(`/inbox/${s.dataset.kind}`, { method: "PATCH", body: { kind: s.value } }); await refresh("inbox"); toast("Changed"); } catch (err) { toast(err.message, "err"); }
    }));
  }

  // ================= VEHICLES =================

  const FUELS = ["Petrol", "Diesel", "Hybrid", "Plug-in hybrid", "Electric"];
  const GEARS = ["Automatic", "Manual", "DCT", "CVT"];
  const vphoto = (v) => `<div class="vphoto">${v.photo ? `<img src="${esc(v.photo)}" alt="Photo of ${esc(v.plate)}" loading="lazy">` : CarDiagram.silhouette()}</div>`;
  const specs = (v) => [v.year, v.mileageKm ? km(v.mileageKm) : "", v.fuel, v.transmission, v.engine].filter(Boolean).map((s) => `<span>${esc(s)}</span>`).join("");

  function pageVehicles(q) {
    crumbs([["Vehicles"]]);
    const today = todayKL();
    const FILTERS = {
      all: ["All", () => true],
      workshop: ["In workshop", (v) => ["In workshop", "Waiting parts", "Ready"].includes(v.stage)],
      due: ["Service due", (v) => v.nextServiceDate && daysBetween(today, v.nextServiceDate) <= 30],
      marks: ["Body marks", (v) => v.openMarks > 0],
    };
    let f = FILTERS[q.get("f")] ? q.get("f") : "all";
    let shown = 30;
    view.innerHTML = `
      ${pageHead("Vehicles", { sub: `${state.vehicles.length} car${state.vehicles.length === 1 ? "" : "s"}`, acts: `<button class="btn" id="addCar">${icon("plus")}Add vehicle</button>` })}
      <div class="toolbar"><div class="search">${icon("search")}<input id="vq" type="search" placeholder="Search plate, model, owner" aria-label="Search vehicles"></div>
        <div class="chips" id="vf">${Object.entries(FILTERS).map(([k, [l, fn]]) => `<button type="button" class="chip ${k === f ? "on" : ""}" data-f="${k}">${l} <span class="n">${state.vehicles.filter(fn).length}</span></button>`).join("")}</div></div>
      <div class="vlist" id="vl"></div>`;
    const draw = () => {
      const s = $("#vq").value.trim().toLowerCase();
      const pk = plateKey(s);
      const list = state.vehicles.filter(FILTERS[f][1]).filter((v) => !s || (pk && v.key.includes(pk)) || `${v.makeModel} ${v.ownerName} ${v.chassisNo}`.toLowerCase().includes(s));
      $("#vl").innerHTML = list.length
        ? list.slice(0, shown).map((v) => `<a class="vcard" href="#/vehicles/${v.key}">${vphoto(v)}
            <div style="min-width:0"><h3>${esc(v.makeModel || "Car")} ${plateTag(v.plate)} ${stagePill(v.stage)}</h3>
              <div class="specs">${specs(v) || '<span class="muted">No details yet</span>'}</div>
              <div class="meta">${v.lastVisit ? `Last visit ${ago(v.lastVisit)} · ${v.visits} visit${v.visits === 1 ? "" : "s"}` : "No visits yet"}${v.openMarks ? ` · ${v.openMarks} body mark${v.openMarks === 1 ? "" : "s"}` : ""}</div></div>
            <div class="side-r"><span class="who">${v.ownerName ? avatar(v.ownerName) + `<span>${esc(v.ownerName)}</span>` : '<span class="muted">No owner</span>'}</span>
              ${v.nextServiceDate ? `<span class="pill ${daysBetween(today, v.nextServiceDate) < 0 ? "bad" : daysBetween(today, v.nextServiceDate) <= 30 ? "warn" : ""}">${icon("calendar")}Service ${dmy(v.nextServiceDate)}</span>` : ""}</div></a>`).join("")
          + (list.length > shown ? `<button class="btn alt block" id="vmore">Show more (${list.length - shown})</button>` : "")
        : `<div class="card">${emptyBox("car", state.vehicles.length ? "No car matches." : "No cars yet. Cars appear here when you make a job, or press Add vehicle.")}</div>`;
      const m = $("#vmore");
      if (m) m.onclick = () => { shown += 30; draw(); };
    };
    $("#vq").oninput = () => { shown = 30; draw(); };
    $("#vf").onclick = (e) => {
      const b = e.target.closest("[data-f]");
      if (!b) return;
      f = b.dataset.f;
      $$("#vf .chip").forEach((c) => c.classList.toggle("on", c === b));
      history.replaceState(null, "", `#/vehicles?f=${f}`);
      draw();
    };
    $("#addCar").onclick = addVehicle;
    draw();
  }

  function carFields(v = {}) {
    const sel = (name, opts, cur) => `<select id="v_${name}" name="${name}"><option value="">—</option>${opts.map((o) => `<option ${o === cur ? "selected" : ""}>${o}</option>`).join("")}${cur && !opts.includes(cur) ? `<option selected>${esc(cur)}</option>` : ""}</select>`;
    const inp = (name, label, extra = "", val = v[name]) => `<div><label for="v_${name}">${label}</label><input id="v_${name}" name="${name}" ${extra} value="${esc(val ?? "")}"></div>`;
    return `
      <div class="full">${inp("makeModel", "Make &amp; model", 'placeholder="e.g. Mercedes-Benz E300 (W213)"').replace(/^<div>|<\/div>$/g, "")}</div>
      ${inp("year", "Year", 'type="number" inputmode="numeric" min="1950" max="2100"')}
      ${inp("colour", "Colour")}
      <div><label for="v_fuel">Fuel</label>${sel("fuel", FUELS, v.fuel)}</div>
      <div><label for="v_transmission">Gearbox</label>${sel("transmission", GEARS, v.transmission)}</div>
      ${inp("engine", "Engine", 'placeholder="e.g. 2.0 turbo, M264"')}
      ${inp("mileageKm", "Mileage (km)", 'type="number" inputmode="numeric" min="0"')}
      ${inp("chassisNo", "Chassis no (VIN)", 'style="text-transform:uppercase"')}
      ${inp("engineNo", "Engine no", 'style="text-transform:uppercase"')}
      ${inp("regDate", "Reg date", 'type="date"')}`;
  }
  const formObj = (form) => Object.fromEntries(new FormData(form).entries());

  function ownerSelect(cur) {
    return `<select id="v_customerId" name="customerId"><option value="">— not linked —</option>${state.customers.map((c) => `<option value="${c.id}" ${c.id === cur ? "selected" : ""}>${esc(c.name)}${c.phone ? " · " + esc(c.phone) : ""}</option>`).join("")}</select>`;
  }

  function addVehicle() {
    const m = modal("Add vehicle", `<form id="avf" novalidate><div class="fgrid">
        <div class="full"><label for="v_plate" class="req">Plate</label><input id="v_plate" name="plate" required style="text-transform:uppercase" placeholder="e.g. WXY 1234"></div>
        ${carFields()}
        <div class="full"><label for="v_customerId">Owner</label>${ownerSelect("")}<div class="hint">New customer? Add them in Customers first, or just make an estimate for this car.</div></div>
      </div><div class="btns"><button class="btn" type="submit">${icon("check")}Save vehicle</button></div></form>`);
    m.$("#avf").onsubmit = async (e) => {
      e.preventDefault();
      const b = formObj(e.target);
      const c = state.customers.find((x) => x.id === b.customerId);
      if (c) Object.assign(b, { ownerName: c.name, ownerPhone: c.phone });
      busy(e.submitter, true, "Saving…");
      try {
        const v = await api("/vehicles", { method: "POST", body: b });
        await refresh("vehicles");
        m.close();
        toast(`${v.plate} added`);
        location.hash = `#/vehicles/${v.key}`;
      } catch (err) {
        toast(err.message, "err");
        busy(e.submitter, false);
      }
    };
  }

  function updateVehicle(v) {
    const i = state.vehicles.findIndex((x) => x.key === v.key);
    if (i >= 0) state.vehicles[i] = v;
    else state.vehicles.unshift(v);
  }

  function pageVehicle(key, tab) {
    key = plateKey(key);
    const v = vehicleByKey(key);
    if (!v) {
      crumbs([["Vehicles", "#/vehicles"], ["Not found"]]);
      view.innerHTML = `${pageHead("Car not found", { back: "#/vehicles" })}<p class="muted">No car with plate ${esc(key)}.</p>`;
      return;
    }
    crumbs([["Vehicles", "#/vehicles"], [v.plate]]);
    const jobs = jobsOfVehicle(key);
    const live = jobs.filter((j) => j.status !== "Cancelled");
    const today = todayKL();
    const TABS = [["details", "Details", "file"], ["history", `Service history (${live.length})`, "jobs"], ["condition", `Body condition${v.openMarks ? ` (${v.openMarks})` : ""}`, "shield"]];
    if (!TABS.some((t) => t[0] === tab)) tab = "details";
    const msg = `Hi ${v.ownerName || ""}, this is ${brandName()} about your car ${v.plate}.`;
    view.innerHTML = `
      ${pageHead(`${esc(v.makeModel || "Car")} ${plateTag(v.plate)}`, { back: "#/vehicles", sub: v.ownerName ? `Owner: ${v.customerId ? `<a href="#/customers/${v.customerId}">${esc(v.ownerName)}</a>` : esc(v.ownerName)}` : "No owner yet",
        acts: `${v.ownerPhone ? `<a class="btn wa" href="${esc(waLink(v.ownerPhone, msg))}" target="_blank" rel="noopener">${icon("chat")}WhatsApp owner</a>` : ""}<a class="btn" href="#/jobs/new?plate=${v.key}">${icon("plus")}New estimate</a>` })}
      <div class="card"><div class="vhero">
        <div>${vphoto(v)}<div class="btns"><label class="btn alt sm upload">${icon("camera")}${v.photo ? "Change photo" : "Add photo"}<input type="file" id="vPhoto" accept="image/*"></label></div></div>
        <div><div class="facts">
          <div>Mileage<b>${km(v.mileageKm) || "—"}</b></div>
          <div>Year<b>${esc(v.year || "—")}</b></div>
          <div>Last visit<b>${v.lastVisit ? dmy(v.lastVisit) : "—"}</b></div>
          <div>Visits<b>${v.visits}</b></div>
          <div>Fuel<b>${esc(v.fuel || "—")}</b></div>
          <div>Gearbox<b>${esc(v.transmission || "—")}</b></div>
          <div>Colour<b>${esc(v.colour || "—")}</b></div>
          <div>Next service<b>${v.nextServiceDate ? `${dmy(v.nextServiceDate)}${daysBetween(today, v.nextServiceDate) < 0 ? ' <span class="pill bad">overdue</span>' : ""}` : v.nextServiceKm ? km(v.nextServiceKm) : "—"}</b></div>
        </div></div></div></div>
      <nav class="tabs" aria-label="Car sections">${TABS.map(([k, l, ic]) => `<a href="#/vehicles/${v.key}/${k}" class="${k === tab ? "on" : ""}" ${k === tab ? 'aria-current="page"' : ""}>${icon(ic)}${l}</a>`).join("")}</nav>
      <div id="vtab"></div>`;
    $("#vPhoto").onchange = async (e) => {
      const file = await shrink(e.target.files[0]);
      if (!file) return;
      const fd = new FormData();
      fd.append("file", file);
      toast("Uploading photo…");
      try {
        updateVehicle(await api(`/vehicles/${v.key}/photo`, { method: "POST", form: fd }));
        toast("Photo saved");
        pageVehicle(key, tab);
      } catch (err) {
        toast(err.message, "err");
      }
    };
    const box = $("#vtab");
    if (tab === "details") vehicleDetails(box, v);
    else if (tab === "history") vehicleHistory(box, v, jobs);
    else vehicleCondition(box, v, jobs);
  }

  function vehicleDetails(box, v) {
    box.innerHTML = `<form id="vdf" class="card" novalidate><h2>Technical data</h2><div class="fgrid3">
        ${carFields(v)}
        <div><label for="v_nextServiceDate">Next service date</label><input id="v_nextServiceDate" name="nextServiceDate" type="date" value="${esc(v.nextServiceDate)}"></div>
        <div><label for="v_nextServiceKm">Next service at (km)</label><input id="v_nextServiceKm" name="nextServiceKm" type="number" inputmode="numeric" min="0" value="${esc(v.nextServiceKm ?? "")}"></div>
        <div><label for="v_customerId">Owner</label>${ownerSelect(v.customerId)}</div>
        <div class="full"><label for="v_notes">Notes</label><textarea id="v_notes" name="notes" rows="3" placeholder="e.g. Customer prefers original parts. Spare key in office.">${esc(v.notes)}</textarea></div>
      </div><div class="btns"><button class="btn" type="submit">${icon("check")}Save details</button></div></form>`;
    $("#vdf").onsubmit = async (e) => {
      e.preventDefault();
      const b = formObj(e.target);
      const c = state.customers.find((x) => x.id === b.customerId);
      if (c) Object.assign(b, { ownerName: c.name, ownerPhone: c.phone });
      busy(e.submitter, true, "Saving…");
      try {
        updateVehicle(await api(`/vehicles/${v.key}`, { method: "PATCH", body: b }));
        toast("Car details saved");
        pageVehicle(v.key, "details");
      } catch (err) {
        toast(err.message, "err");
        busy(e.submitter, false);
      }
    };
  }

  function vehicleHistory(box, v, jobs) {
    const live = jobs.filter((j) => j.status !== "Cancelled" && j.invoiceNo);
    box.innerHTML = `<div class="grid g3" style="margin-bottom:16px">
        <div class="tile"><div class="lbl">${icon("receipt")}Spent at your workshop</div><div class="val">${rm(live.reduce((t, j) => t + j.total, 0))}</div><div class="foot">${live.length} invoice${live.length === 1 ? "" : "s"}</div></div>
        <div class="tile"><div class="lbl">${icon("gauge")}Highest mileage seen</div><div class="val">${km(v.mileageKm) || "—"}</div><div class="foot">from jobs and car details</div></div>
        <div class="tile"><div class="lbl">${icon("alert")}Still owing</div><div class="val">${rm(live.reduce((t, j) => t + j.balance, 0))}</div><div class="foot">on this car's invoices</div></div></div>
      <div class="card flush">${jobs.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>No.</th><th class="d">Mileage</th><th>Work</th><th>Status</th><th class="num">Total</th></tr></thead><tbody>
        ${jobs.map((j) => `<tr class="tap" data-href="#/jobs/${j.id}"><td class="nowrap">${dmy(jobDate(j))}</td><td class="nowrap"><a href="#/jobs/${j.id}" class="strong" style="color:inherit;text-decoration:none">${esc(docNo(j))}</a><div class="sm">${kindOf(j)}</div></td>
          <td class="d nowrap">${km(j.mileageKm)}</td><td>${esc(j.groups.map((g) => g.request).filter(Boolean).join("; ") || j.groups.flatMap((g) => g.lines.map((l) => l.description)).slice(0, 3).join(", "))}</td><td>${statusPill(j.status)}</td><td class="num">${rm(j.total)}</td></tr>`).join("")}
        </tbody></table></div>` : emptyBox("jobs", `No jobs for this car yet. <a href="#/jobs/new?plate=${v.key}">Make an estimate</a>.`)}</div>`;
  }

  function vehicleCondition(box, v, jobs) {
    const K = CarDiagram.KINDS;
    let showFixed = LS.get("showFixed") === true;
    const q = parseHash().q;
    const openJob = jobs.find((j) => j.status !== "Cancelled" && j.stage !== "Collected");
    const defaultJob = q.get("job") || (openJob ? docNo(openJob) : "");
    box.innerHTML = `
      <div class="card"><div class="card-h"><h2>Body condition</h2>
        <div class="r"><label class="muted" style="margin:0;display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="showFixed" ${showFixed ? "checked" : ""} style="width:18px;min-height:18px">Show fixed</label></div></div>
        <p class="muted" style="margin:-6px 0 12px">Tap the car where the damage is. Do this at check-in with the customer, so everyone agrees on the car's condition before work starts.</p>
        <div id="diagram"></div>
        <div class="legend">${Object.values(K).map((k) => `<span><i style="background:${k.color}"></i>${k.label}</span>`).join("")}<span><i style="background:var(--ok)"></i>Fixed</span></div>
      </div>
      <div class="card flush"><div class="card-h"><h2>Condition record</h2></div><div id="mtable"></div></div>`;
    const draw = () => {
      const marks = v.marks;
      const numbers = CarDiagram.render($("#diagram"), marks, { showFixed, onAdd: (view, x, y) => markDialog({ view, x, y }), onPick: (id) => markDialog(marks.find((m) => m.id === id)) });
      const list = marks.filter((m) => showFixed || !m.fixed);
      $("#mtable").innerHTML = list.length
        ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Position</th><th>Type</th><th class="d">Note</th><th class="d">Date / job</th><th>Photo</th><th></th></tr></thead><tbody>
          ${list.map((m) => {
            const k = K[m.kind] || K.other;
            return `<tr><td><span class="mnum" style="background:${m.fixed ? "var(--ok)" : k.color}">${numbers.get(m.id)}</span></td><td class="strong">${esc(m.area || CarDiagram.VIEWS[m.view].label)}</td>
              <td>${m.fixed ? pill("Fixed", "ok") : esc(k.label)}</td><td class="d">${esc(m.note) || '<span class="sm">—</span>'}</td><td class="d nowrap">${dmy(m.date)}${m.jobNo ? `<div class="sm">${esc(m.jobNo)}</div>` : ""}</td>
              <td>${m.thumb ? `<a href="${esc(m.photo)}" target="_blank" rel="noopener"><img class="thumb" src="${esc(m.thumb)}" alt="Photo of mark ${numbers.get(m.id)}" loading="lazy"></a>` : '<span class="sm">—</span>'}</td>
              <td class="num"><button class="btn ghost sm" data-edit="${esc(m.id)}" aria-label="Edit mark ${numbers.get(m.id)}">${icon("edit")}</button></td></tr>`;
          }).join("")}</tbody></table></div>`
        : emptyBox("shield", marks.length ? "All marks are fixed." : "No marks yet. Tap the car above to add one.");
      $$("#mtable [data-edit]").forEach((b) => (b.onclick = () => markDialog(marks.find((m) => m.id === b.dataset.edit))));
    };
    $("#showFixed").onchange = (e) => { showFixed = e.target.checked; LS.set("showFixed", showFixed); draw(); };

    function markDialog(m) {
      if (!m) return;
      const isNew = !m.id;
      let kind = m.kind || "scratch";
      const area = m.area || CarDiagram.areaName(m.view, m.x, m.y);
      const jobOpts = jobs.filter((j) => j.status !== "Cancelled").map(docNo);
      const curJob = isNew ? defaultJob : m.jobNo;
      const d = modal(isNew ? "Add body mark" : "Body mark", `
        <div id="mprev">${CarDiagram.preview(m.view, m.x, m.y, kind)}</div>
        <label>Type</label><div class="kinds" id="mkinds" role="group" aria-label="Type">${Object.entries(K).map(([k, x]) => `<button type="button" data-k="${k}" class="${k === kind ? "on" : ""}" aria-pressed="${k === kind}"><i style="background:${x.color}"></i>${x.label}</button>`).join("")}</div>
        <div class="fgrid"><div><label for="mArea">Position</label><input id="mArea" value="${esc(area)}"></div>
          <div><label for="mJob">Job</label><select id="mJob"><option value="">—</option>${jobOpts.map((n) => `<option ${n === curJob ? "selected" : ""}>${esc(n)}</option>`).join("")}${curJob && !jobOpts.includes(curJob) ? `<option selected>${esc(curJob)}</option>` : ""}</select></div></div>
        <label for="mNote">Note</label><textarea id="mNote" rows="2" placeholder="e.g. 10 cm scratch, customer aware">${esc(m.note || "")}</textarea>
        ${isNew ? `<label class="btn alt upload" style="margin-top:12px">${icon("camera")}<span id="mFileL">Add photo (optional)</span><input type="file" id="mFile" accept="image/*" capture="environment"></label>`
          : m.photo ? `<p style="margin:12px 0 0"><a href="${esc(m.photo)}" target="_blank" rel="noopener"><img src="${esc(m.thumb)}" alt="Mark photo" class="thumb" style="width:96px;height:96px"></a></p>` : ""}
        ${!isNew ? `<p class="muted" style="margin:10px 0 0">Added ${dmy(m.date)}${m.fixed ? ` · fixed ${dmy(m.fixedOn)}` : ""}</p>` : ""}
        <div class="btns">
          <button type="button" class="btn" id="mSave">${icon("check")}${isNew ? "Add mark" : "Save"}</button>
          ${isNew ? "" : `<button type="button" class="btn alt" id="mFix">${m.fixed ? "Not fixed" : `${icon("check")}Mark fixed`}</button><button type="button" class="btn danger" id="mDel">${icon("trash")}Remove</button>`}
        </div>`);
      let file = null;
      d.$("#mkinds").onclick = (e) => {
        const b = e.target.closest("[data-k]");
        if (!b) return;
        kind = b.dataset.k;
        $$("#mkinds button", d.el).forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
        d.$("#mprev").innerHTML = CarDiagram.preview(m.view, m.x, m.y, kind);
      };
      const fi = d.$("#mFile");
      if (fi) fi.onchange = async () => { file = await shrink(fi.files[0]); d.$("#mFileL").textContent = file ? "Photo added ✓" : "Add photo (optional)"; };
      const after = (nv) => { updateVehicle(nv); Object.assign(v, nv); d.close(); draw(); const t = $$(".tabs a")[2]; if (t) t.innerHTML = `${icon("shield")}Body condition${nv.openMarks ? ` (${nv.openMarks})` : ""}`; };
      d.$("#mSave").onclick = async (e) => {
        const body = { view: m.view, x: m.x, y: m.y, kind, area: d.$("#mArea").value, note: d.$("#mNote").value, jobNo: d.$("#mJob").value };
        busy(e.currentTarget, true, "Saving…");
        try {
          if (isNew) {
            const fd = new FormData();
            if (file) fd.append("file", file);
            fd.append("data", JSON.stringify(body));
            const out = await api(`/vehicles/${v.key}/marks`, { method: "POST", form: fd });
            after(out.vehicle);
            toast(out.photoSaved ? "Mark added" : "Mark added, but the photo did not upload.");
          } else {
            after(await api(`/vehicles/${v.key}/marks/${m.id}`, { method: "PATCH", body }));
            toast("Mark saved");
          }
        } catch (err) {
          toast(err.message, "err");
          busy(e.currentTarget, false);
        }
      };
      const fix = d.$("#mFix");
      if (fix) fix.onclick = async () => {
        try { after(await api(`/vehicles/${v.key}/marks/${m.id}`, { method: "PATCH", body: { fixed: !m.fixed } })); toast(m.fixed ? "Marked as not fixed" : "Marked as fixed"); } catch (err) { toast(err.message, "err"); }
      };
      const del = d.$("#mDel");
      if (del) del.onclick = async () => {
        if (!confirm("Remove this mark? Use this only for a mark added by mistake. For a repaired spot, use Mark fixed.")) return;
        try { after(await api(`/vehicles/${v.key}/marks/${m.id}`, { method: "DELETE" })); toast("Mark removed"); } catch (err) { toast(err.message, "err"); }
      };
    }
    draw();
  }

  // ================= CUSTOMERS =================

  function pageCustomers() {
    crumbs([["Customers"]]);
    const rows = state.customers.map((c) => ({ c, s: customerStats(c) }));
    let sort = "recent";
    let cfil = "all";
    view.innerHTML = `
      ${pageHead("Customers", { sub: `${state.customers.length} customer${state.customers.length === 1 ? "" : "s"}`, acts: `<button class="btn" id="addCust">${icon("plus")}Add customer</button>` })}
      <div class="toolbar"><div class="search">${icon("search")}<input id="cq" type="search" placeholder="Search name, phone, plate" aria-label="Search customers"></div>
        <div class="chips" id="cf">${[["all", "All"], ["Customer", "Customers"], ["Lead", "Leads"], ["Fleet", "Fleet"], ["owes", "Owes"]].map(([k, l]) => `<button type="button" class="chip ${k === "all" ? "on" : ""}" data-f="${k}">${l}</button>`).join("")}</div>
        <div class="seg" id="cs" role="group" aria-label="Sort"><button type="button" class="on" data-s="recent">Recent</button><button type="button" data-s="name">A–Z</button><button type="button" data-s="owes">Owes</button></div></div>
      <div class="card flush" id="ct"></div>`;
    const draw = () => {
      const s = $("#cq").value.trim().toLowerCase();
      const digits = s.replace(/\D/g, "");
      const pk = plateKey(s);
      const list = rows.filter(({ c, s: st }) => (cfil === "all" || (cfil === "owes" ? st.owes > 0.009 : c.type === cfil))).filter(({ c, s: st }) => !s || c.name.toLowerCase().includes(s) || (digits.length > 3 && c.phone.replace(/\D/g, "").includes(digits)) || (pk && st.plates.some((p) => p.includes(pk))) || c.email.toLowerCase().includes(s));
      list.sort((a, b) => (sort === "name" ? a.c.name.localeCompare(b.c.name) : sort === "owes" ? b.s.owes - a.s.owes : (b.s.last || b.c.createdTime || "").localeCompare(a.s.last || a.c.createdTime || "")));
      $("#ct").innerHTML = list.length
        ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Customer</th><th class="d">Phone</th><th class="d">Cars</th><th class="d">Last visit</th><th class="num d">Spent</th><th class="num">Owes</th></tr></thead><tbody>
          ${list.map(({ c, s: st }) => `<tr class="tap" data-href="#/customers/${c.id}"><td><div class="who">${avatar(c.name)}<div style="min-width:0"><a href="#/customers/${c.id}" class="strong" style="color:inherit;text-decoration:none">${esc(c.name)}</a><div class="sm">${esc([c.type !== "Customer" ? c.type : "", c.source].filter(Boolean).join(" · ") || c.email || c.phone)}</div>${c.tags ? `<div style="margin-top:3px">${tagChips(c.tags)}</div>` : ""}</div></div></td>
            <td class="d nowrap">${esc(c.phone) || "—"}</td><td class="d">${st.plates.map((p) => plateTag(vehicleByKey(p)?.plate || p)).join(" ") || "—"}</td><td class="d nowrap">${st.last ? dmy(st.last) : "—"}</td>
            <td class="num d">${rm(st.spent)}</td><td class="num">${st.owes > 0.009 ? `<span class="strong" style="color:var(--bad)">${rm(st.owes)}</span>` : "—"}</td></tr>`).join("")}
          </tbody></table></div>`
        : emptyBox("users", state.customers.length ? "No customer matches." : "No customers yet. They are added when you make an estimate, or press Add customer.");
    };
    $("#cq").oninput = draw;
    $("#cf").onclick = (e) => {
      const b = e.target.closest("[data-f]");
      if (!b) return;
      cfil = b.dataset.f;
      $$("#cf .chip").forEach((x) => x.classList.toggle("on", x === b));
      draw();
    };
    $("#cs").onclick = (e) => {
      const b = e.target.closest("[data-s]");
      if (!b) return;
      sort = b.dataset.s;
      $$("#cs button").forEach((x) => x.classList.toggle("on", x === b));
      draw();
    };
    $("#addCust").onclick = () => customerDialog(null);
    draw();
  }

  function customerDialog(c) {
    const m = modal(c ? "Edit customer" : "Add customer", `<form id="cf" novalidate>
      <label for="c_name" class="req">Name</label><input id="c_name" name="name" required value="${esc(c?.name)}">
      <div class="fgrid"><div><label for="c_phone">Phone (WhatsApp)</label><input id="c_phone" name="phone" type="tel" inputmode="tel" value="${esc(c?.phone)}"></div>
        <div><label for="c_email">Email</label><input id="c_email" name="email" type="email" inputmode="email" value="${esc(c?.email)}"></div></div>
      <div class="fgrid"><div><label for="c_type">Type</label><select id="c_type" name="type">${opt(CTYPES, c?.type || "Customer")}</select></div>
        <div><label for="c_source">How they found us</label><select id="c_source" name="source">${opt(SOURCES, c?.source || "", "—")}</select></div>
        <div class="full"><label for="c_tags">Tags</label><input id="c_tags" name="tags" value="${esc(c?.tags)}" placeholder="e.g. VIP, W213 owner, friend of Pong"></div>
        <div><label for="c_nf">Next follow-up</label><input id="c_nf" name="nextFollowUp" type="date" value="${esc(c?.nextFollowUp)}"></div>
        <div><label for="c_fn">Follow-up about</label><input id="c_fn" name="followUpNote" value="${esc(c?.followUpNote)}"></div></div>
      <label for="c_address">Address</label><textarea id="c_address" name="address" rows="2">${esc(c?.address)}</textarea>
      <label for="c_notes">Notes</label><textarea id="c_notes" name="notes" rows="2">${esc(c?.notes)}</textarea>
      <div class="btns"><button class="btn" type="submit">${icon("check")}Save</button></div></form>`);
    m.$("#cf").onsubmit = async (e) => {
      e.preventDefault();
      const b = formObj(e.target);
      if (!b.name.trim()) return toast("Customer name is needed.");
      busy(e.submitter, true, "Saving…");
      try {
        const out = c ? await api(`/customers/${c.id}`, { method: "PATCH", body: b }) : await api("/customers", { method: "POST", body: b });
        await refresh("customers");
        m.close();
        toast("Customer saved");
        if (c) route();
        else location.hash = `#/customers/${out.id}`;
      } catch (err) {
        toast(err.message, "err");
        busy(e.submitter, false);
      }
    };
  }

  function pageCustomer(id) {
    const c = state.customers.find((x) => x.id === id);
    if (!c) {
      crumbs([["Customers", "#/customers"], ["Not found"]]);
      view.innerHTML = `${pageHead("Customer not found", { back: "#/customers" })}`;
      return;
    }
    crumbs([["Customers", "#/customers"], [c.name]]);
    const st = customerStats(c);
    const cars = st.plates.map((k) => vehicleByKey(k)).filter(Boolean);
    const pays = state.payments.filter((p) => st.jobs.some((j) => j.id === p.jobId));
    view.innerHTML = `
      ${pageHead(`${esc(c.name)}`, { back: "#/customers", sub: st.last ? `Last visit ${ago(st.last)}` : "No visits yet", extra: "", acts: `${c.phone ? `<a class="btn wa" href="${esc(waLink(c.phone, `Hi ${c.name}, this is ${brandName()}.`))}" target="_blank" rel="noopener">${icon("chat")}WhatsApp</a>` : ""}<a class="btn" href="#/jobs/new?customer=${c.id}">${icon("plus")}New estimate</a>` })}
      <div class="split">
        <div>
          <div class="card"><div class="card-h"><h2>Cars</h2></div>
            ${cars.length ? `<div class="vlist">${cars.map((v) => `<a class="vcard" href="#/vehicles/${v.key}" style="box-shadow:none">${vphoto(v)}<div style="min-width:0"><h3>${esc(v.makeModel || "Car")} ${plateTag(v.plate)}</h3><div class="specs">${specs(v)}</div><div class="meta">${v.lastVisit ? `Last visit ${ago(v.lastVisit)}` : ""}</div></div><div></div></a>`).join("")}</div>` : `<p class="muted">No cars yet.</p>`}</div>
          <div class="card flush"><div class="card-h"><h2>Jobs</h2></div>${jobTable(jobsOfCustomer(c))}</div>
          ${customerActivity(c, st)}
        </div>
        <div>
          <div class="card"><div class="card-h"><h2>Follow-up</h2><div class="r"><button type="button" class="btn alt sm" id="logC2">Log contact</button></div></div>
            ${c.nextFollowUp ? `<p style="margin:0"><b>${dmy(c.nextFollowUp)}</b> ${c.nextFollowUp < todayKL() ? pill("overdue", "bad") : `<span class="muted">${ago(c.nextFollowUp)}</span>`}</p><p class="muted" style="margin:4px 0 0">${esc(c.followUpNote || "")}</p>` : `<p class="muted" style="margin:0">No follow-up set.</p>`}
            <div class="chips" style="margin-top:10px">${pill(c.type, c.type === "Lead" ? "warn" : "info")}${c.source ? pill(c.source) : ""}${tagChips(c.tags)}</div></div>
          <div class="card"><div class="card-h"><h2>Contact</h2><div class="r"><button class="btn ghost sm" id="editCust">${icon("edit")}Edit</button></div></div>
            <dl class="kv"><dt>Phone</dt><dd>${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : "—"}</dd><dt>Email</dt><dd>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : "—"}</dd>
            <dt>Address</dt><dd style="white-space:pre-line">${esc(c.address) || "—"}</dd>${c.notes ? `<dt>Notes</dt><dd style="white-space:pre-line">${esc(c.notes)}</dd>` : ""}</dl></div>
          <div class="card"><h2>Money</h2><div class="sum"><div><span class="muted">Spent (invoices)</span><span>${rm(st.spent)}</span></div><div><span class="muted">Visits</span><span>${st.jobs.length}</span></div>
            <div class="big"><span>Owes</span><span style="${st.owes > 0.009 ? "color:var(--bad)" : ""}">${rm(st.owes)}</span></div></div>
            ${pays.length ? `<div class="rows" style="margin-top:14px">${pays.slice(0, 6).map((p) => `<a href="#/money/receipt/${p.id}"><div class="grow"><b>${esc(p.receiptNo)}</b><span class="muted">${dmy(p.paidOn)}</span></div><div class="r">${rm(p.amount)}</div></a>`).join("")}</div>` : ""}</div>
        </div>
      </div>`;
    $("#editCust").onclick = () => customerDialog(c);
    $("#logC").onclick = () => logDialog(c);
    $("#logC2").onclick = () => logDialog(c);
  }

  // ================= PARTS =================

  function pageParts(q) {
    crumbs([["Parts & stock"]]);
    const s = state.settings;
    const inStock = state.parts.filter((p) => p.qtyLeft > 0);
    const value = inStock.reduce((t, p) => t + p.qtyLeft * p.unitCost, 0);
    const low = state.parts.filter((p) => p.qtyLeft <= 1).length;
    view.innerHTML = `
      ${pageHead("Parts & stock", { sub: `Selling price = cost + ${esc(s.markupPercent)}% markup`, acts: `<a class="btn alt" href="#/parts/count">${icon("clipboard")}Stock count</a><button class="btn alt" id="buyManual">${icon("edit")}Enter by hand</button><label class="btn upload">${icon("upload")}Upload supplier receipt<input type="file" id="buyFile" accept="image/*,application/pdf"></label>` })}
      <div class="grid g3" style="margin-bottom:16px">
        <div class="tile"><div class="lbl">${icon("parts")}Parts in stock</div><div class="val">${inStock.length}</div><div class="foot">${state.parts.length} part lines in total</div></div>
        <div class="tile"><div class="lbl">${icon("money")}Stock value (at cost)</div><div class="val">${rm0(value)}</div><div class="foot">money sitting on the shelf</div></div>
        <div class="tile"><div class="lbl">${icon("alert")}Low stock</div><div class="val">${low}</div><div class="foot">1 or fewer left</div></div>
      </div>
      <div class="card" id="buyCard" hidden><div class="card-h"><h2>Supplier receipt</h2><div class="r"><button class="btn ghost sm" id="buyClose" aria-label="Close">${icon("x")}</button></div></div><div id="buyForm"></div></div>
      <div class="toolbar"><div class="search">${icon("search")}<input id="partSearch" type="search" placeholder="Search part, part no, brand, supplier" aria-label="Search parts"></div></div>
      <div class="card flush" id="partList"></div>`;
    $("#buyFile").onchange = onReceiptFile;
    $("#buyManual").onclick = () => purchaseForm({ supplier: "", date: "", receiptNo: "", total: null, items: [{ name: "", qty: 1, unitCost: null }] }, null);
    $("#buyClose").onclick = () => ($("#buyCard").hidden = true);
    $("#partSearch").oninput = drawParts;
    drawParts();
    const fromInbox = q && q.get("inbox") && state.inbox.find((i) => i.id === q.get("inbox") && i.status === "New");
    if (fromInbox) purchaseForm(fromInbox.suggestion || { supplier: "", date: "", receiptNo: "", total: null, items: [{ name: "", qty: 1, unitCost: null }] }, null, !!fromInbox.suggestion, fromInbox);
  }

  function drawParts() {
    const q = ($("#partSearch")?.value || "").toLowerCase();
    const parts = state.parts.filter((p) => !q || `${p.name} ${p.partNo} ${p.brand} ${p.supplier}`.toLowerCase().includes(q));
    $("#partList").innerHTML = parts.length
      ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Part</th><th class="d">Supplier</th><th class="d">Bought</th><th class="num">Left</th><th class="num d">Cost</th><th class="num">Sell</th><th class="num d">Margin</th></tr></thead><tbody>
        ${parts.map((p) => `<tr class="tap" data-part="${p.id}" tabindex="0"><td><span class="strong">${esc(p.name)}</span><div class="sm">${esc([p.brand, p.partNo].filter(Boolean).join(" · "))}</div></td><td class="d">${esc(p.supplier)}</td><td class="d nowrap">${dmy(p.boughtOn)}</td>
          <td class="num">${p.qtyLeft <= 0 ? pill(String(p.qtyLeft), "bad") : p.qtyLeft <= 1 ? pill(String(p.qtyLeft), "warn") : p.qtyLeft}</td><td class="num d">${rm(p.unitCost)}</td><td class="num strong">${rm(p.sellingPrice)}</td>
          <td class="num d">${p.unitCost > 0 ? Math.round(((p.sellingPrice - p.unitCost) / p.unitCost) * 100) + "%" : "—"}</td></tr>`).join("")}</tbody></table></div>`
      : emptyBox("parts", state.parts.length ? "No part matches." : "No parts yet. Upload a supplier receipt to start.");
    $$("#partList [data-part]").forEach((el) => {
      el.onclick = () => editPart(el.dataset.part);
      el.onkeydown = (e) => e.key === "Enter" && editPart(el.dataset.part);
    });
  }

  function editPart(id) {
    const p = state.parts.find((x) => x.id === id);
    if (!p) return;
    const s = state.settings;
    const m = modal("Edit part", `<form id="pf" novalidate>
      <label for="p_name">Part name</label><input id="p_name" name="name" value="${esc(p.name)}">
      <div class="fgrid"><div><label for="p_cost">Cost each (RM)</label><input id="p_cost" name="unitCost" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(p.unitCost)}"></div>
        <div><label for="p_mk">Markup %</label><input id="p_mk" name="markupPercent" type="number" step="any" min="0" inputmode="decimal" value="${esc(p.markupPercent ?? s.markupPercent)}"></div>
        <div><label for="p_sell">Selling price (RM)</label><input id="p_sell" name="sellingPrice" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(p.sellingPrice)}"></div>
        <div><label for="p_left">In stock</label><input id="p_left" name="qtyLeft" type="number" step="any" inputmode="decimal" value="${esc(p.qtyLeft)}"></div></div>
      <p class="hint">${esc([p.brand, p.partNo, p.supplier].filter(Boolean).join(" · "))}${p.boughtOn ? ` · bought ${dmy(p.boughtOn)}` : ""}</p>
      ${(() => {
        const hist = state.parts.filter((x) => x.id !== p.id && ((p.partNo && x.partNo === p.partNo) || x.name.toLowerCase() === p.name.toLowerCase())).sort((a, b) => (b.boughtOn || "").localeCompare(a.boughtOn || ""));
        return hist.length ? `<label>Price history</label><div class="rows">${hist.slice(0, 8).map((x) => `<div><div class="grow"><b>${rm(x.unitCost)}</b><span class="muted">${esc(x.supplier || "—")}</span></div><span class="r muted">${dmy(x.boughtOn)}</span></div>`).join("")}</div>` : "";
      })()}
      <div class="btns"><button class="btn" type="submit">${icon("check")}Save part</button></div></form>`);
    const f = m.$("#pf");
    const re = () => (f.sellingPrice.value = sellPrice(f.unitCost.value, f.markupPercent.value, s.roundTo));
    f.unitCost.oninput = re;
    f.markupPercent.oninput = re;
    f.onsubmit = async (e) => {
      e.preventDefault();
      busy(e.submitter, true, "Saving…");
      try {
        const upd = await api(`/parts/${id}`, { method: "PATCH", body: { name: f.name.value, unitCost: Number(f.unitCost.value), markupPercent: Number(f.markupPercent.value), sellingPrice: Number(f.sellingPrice.value), qtyLeft: Number(f.qtyLeft.value) } });
        Object.assign(p, upd);
        m.close();
        drawParts();
        toast("Part updated");
      } catch (err) {
        toast(err.message, "err");
        busy(e.submitter, false);
      }
    };
  }

  async function onReceiptFile(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    $("#buyCard").hidden = false;
    const box = $("#buyForm");
    box.innerHTML = `<div class="notice"><span class="spin"></span><div>Reading the receipt… (about 10–20 seconds)</div></div>`;
    $("#buyCard").scrollIntoView({ behavior: "smooth", block: "start" });
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { suggestion } = await api("/purchases/extract", { method: "POST", form: fd });
      purchaseForm(suggestion, file, true);
    } catch (err) {
      purchaseForm({ supplier: "", date: "", receiptNo: "", total: null, items: [{ name: "", qty: 1, unitCost: null }] }, file);
      box.insertAdjacentHTML("afterbegin", `<div class="notice bad">${icon("alert")}<div>${esc(err.message)} You can type the parts below.</div></div>`);
    }
  }

  function itemRow(it, ai) {
    const s = state.settings;
    const markup = it.markupPercent ?? s.markupPercent;
    const sell = it.sellingPrice ?? (it.unitCost != null ? sellPrice(it.unitCost, markup, s.roundTo) : "");
    const c = (v) => (ai && v != null && v !== "" ? "ai" : "");
    return `<div class="item">
      <div class="row"><input class="${c(it.name)}" name="name" placeholder="Part name" aria-label="Part name" value="${esc(it.name)}"><button type="button" class="x" title="Remove" aria-label="Remove part">${icon("trash")}</button></div>
      <div class="item-grid">
        <div><label>Qty</label><input class="${c(it.qty)}" name="qty" type="number" inputmode="decimal" step="any" min="0" value="${esc(it.qty ?? 1)}"></div>
        <div><label>Cost each</label><input class="${c(it.unitCost)}" name="unitCost" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(it.unitCost ?? "")}"></div>
        <div><label>Markup %</label><input name="markupPercent" type="number" inputmode="decimal" step="any" min="0" value="${esc(markup)}"></div>
        <div><label>Sell each</label><input name="sellingPrice" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(sell)}"></div>
      </div>
      <div class="fgrid"><div><label>Part no</label><input class="${c(it.partNo)}" name="partNo" value="${esc(it.partNo || "")}"></div><div><label>Brand</label><input class="${c(it.brand)}" name="brand" value="${esc(it.brand || "")}"></div></div>
    </div>`;
  }

  function purchaseForm(sug, file, ai, inboxItem) {
    $("#buyCard").hidden = false;
    const box = $("#buyForm");
    const c = (v) => (ai && v != null && v !== "" ? "ai" : "");
    box.innerHTML = `
      ${ai ? `<div class="notice">${icon("alert")}<div>AI filled the <b>blue</b> boxes. Check them against the receipt, then save.</div></div>` : ""}
      ${inboxItem ? `<p style="margin:0 0 8px">${icon("chat")} From WhatsApp · ${inboxFileLink(inboxItem)}</p>` : ""}
      <form id="purForm" novalidate>
        <div class="fgrid3"><div><label for="pu_s">Supplier</label><input id="pu_s" class="${c(sug.supplier)}" name="supplier" value="${esc(sug.supplier || "")}"></div>
          <div><label for="pu_d">Date</label><input id="pu_d" class="${c(sug.date)}" name="date" type="date" value="${esc(sug.date || "")}"></div>
          <div><label for="pu_r">Receipt no</label><input id="pu_r" class="${c(sug.receiptNo)}" name="receiptNo" value="${esc(sug.receiptNo || "")}"></div></div>
        <div id="purItems">${sug.items.map((it) => itemRow(it, ai)).join("")}</div>
        <div class="addrow"><button type="button" class="btn alt sm" id="addItem">${icon("plus")}Add part</button></div>
        <div class="fgrid3"><div><label for="pu_t">Total on receipt (RM)</label><input id="pu_t" class="${c(sug.total)}" name="total" type="number" inputmode="decimal" step="0.01" value="${esc(sug.total ?? "")}"></div>
          <div><label for="pu_pay">Payment</label><select id="pu_pay" name="payst"><option value="paid">Paid now</option><option value="later">Pay later (owe supplier)</option></select></div>
          <div id="pu_dueW" hidden><label for="pu_due">Pay by</label><input id="pu_due" name="dueDate" type="date"></div></div>
        <p class="muted" id="purCheck"></p>
        <div class="btns"><button class="btn" type="submit">${icon("check")}Save parts</button></div>
      </form>`;
    const form = $("#purForm");
    const items = $("#purItems");
    const check = () => {
      const sum = r2($$(".item", items).reduce((t, el) => t + (Number($("[name=qty]", el).value) || 0) * (Number($("[name=unitCost]", el).value) || 0), 0));
      const total = Number(form.total.value);
      $("#purCheck").textContent = form.total.value && Math.abs(sum - total) > 0.05 ? `Parts add up to ${rm(sum)}, but the receipt total is ${rm(total)}. Check the prices.` : `Parts add up to ${rm(sum)}.`;
    };
    items.addEventListener("input", (e) => {
      const el = e.target.closest(".item");
      if (el && (e.target.name === "unitCost" || e.target.name === "markupPercent")) {
        $("[name=sellingPrice]", el).value = sellPrice($("[name=unitCost]", el).value, $("[name=markupPercent]", el).value, state.settings.roundTo);
      }
      e.target.classList.remove("ai");
      check();
    });
    items.addEventListener("click", (e) => {
      if (e.target.closest(".x")) {
        e.target.closest(".item").remove();
        check();
      }
    });
    $("#addItem").onclick = () => items.insertAdjacentHTML("beforeend", itemRow({ name: "", qty: 1, unitCost: null }, false));
    form.payst.onchange = () => {
      $("#pu_dueW").hidden = form.payst.value !== "later";
      const sp = state.suppliers.find((x) => x.name.toLowerCase() === form.supplier.value.trim().toLowerCase());
      if (form.payst.value === "later" && !form.dueDate.value) form.dueDate.value = addDaysISO(form.date.value || todayKL(), sp?.termsDays || 30);
    };
    check();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const data = {
        supplier: form.supplier.value, date: form.date.value, receiptNo: form.receiptNo.value, total: form.total.value,
        paid: form.payst.value !== "later", dueDate: form.dueDate.value, inboxId: inboxItem ? inboxItem.id : "",
        items: $$(".item", items).map((el) => ({
          name: $("[name=name]", el).value, qty: $("[name=qty]", el).value, unitCost: $("[name=unitCost]", el).value,
          markupPercent: $("[name=markupPercent]", el).value, sellingPrice: $("[name=sellingPrice]", el).value,
          partNo: $("[name=partNo]", el).value, brand: $("[name=brand]", el).value,
        })),
      };
      const fd = new FormData();
      if (file) fd.append("file", file);
      fd.append("data", JSON.stringify(data));
      busy(e.submitter, true, "Saving…");
      try {
        const out = await api("/purchases", { method: "POST", form: fd });
        await refresh("parts", "purchases", "inbox");
        toast(`Saved ${out.parts.length} part(s) — ${out.ref}`);
        if (!out.fileSaved) setTimeout(() => toast("Parts saved, but the receipt file did not upload."), 1800);
        pageParts();
      } catch (err) {
        toast(err.message, "err");
        busy(e.submitter, false);
      }
    };
  }

  // ================= MONEY =================

  function pageMoney(q) {
    crumbs([["Money"]]);
    let tab = q.get("tab") === "owed" ? "owed" : "receipts";
    const today = todayKL();
    const month = today.slice(0, 7);
    const owed = owedInvoices();
    view.innerHTML = `
      ${pageHead("Money", { sub: "Payments in, receipts, and who still owes you", acts: `<button class="btn alt" id="payCash">${icon("edit")}Cash / by hand</button><label class="btn upload">${icon("upload")}Upload payment slip<input type="file" id="payFile" accept="image/*,application/pdf"></label>` })}
      <div class="grid g3" style="margin-bottom:16px">
        <div class="tile"><div class="lbl">${icon("money")}Today</div><div class="val">${rm(state.payments.filter((p) => p.paidOn === today).reduce((t, p) => t + p.amount, 0))}</div><div class="foot">${state.payments.filter((p) => p.paidOn === today).length} payment(s)</div></div>
        <div class="tile"><div class="lbl">${icon("calendar")}This month</div><div class="val">${rm(state.payments.filter((p) => (p.paidOn || "").startsWith(month)).reduce((t, p) => t + p.amount, 0))}</div><div class="foot">all methods</div></div>
        <div class="tile"><div class="lbl">${icon("alert")}Owed to you</div><div class="val">${rm(owed.reduce((t, j) => t + j.balance, 0))}</div><div class="foot">${owed.length} unpaid invoice(s)</div></div>
      </div>
      <div class="card" id="payCard" hidden><div class="card-h"><h2>Record payment</h2><div class="r"><button class="btn ghost sm" id="payClose" aria-label="Close">${icon("x")}</button></div></div><div id="payForm"></div></div>
      <nav class="tabs" id="mtabs"><a href="#/money" data-t="receipts">${icon("receipt")}Receipts</a><a href="#/money?tab=owed" data-t="owed">${icon("alert")}Who owes you (${owed.length})</a></nav>
      <div class="card flush" id="mbody"></div>`;
    const draw = () => {
      $$("#mtabs a").forEach((a) => a.classList.toggle("on", a.dataset.t === tab));
      if (tab === "receipts") {
        $("#mbody").innerHTML = state.payments.length
          ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Receipt</th><th class="d">Date</th><th>Customer</th><th class="d">For</th><th class="d">Method</th><th class="num">Amount</th></tr></thead><tbody>
            ${state.payments.map((p) => `<tr class="tap" data-href="#/money/receipt/${p.id}"><td class="nowrap"><a class="strong" style="color:inherit;text-decoration:none" href="#/money/receipt/${p.id}">${esc(p.receiptNo)}</a><div class="sm">${dmy(p.paidOn)}</div></td><td class="d nowrap">${dmy(p.paidOn)}</td>
              <td>${esc(p.customerName)}</td><td class="d">${esc(p.docNo)}</td><td class="d">${esc(p.method)}</td><td class="num strong">${rm(p.amount)}</td></tr>`).join("")}</tbody></table></div>`
          : emptyBox("receipt", "No payments yet. Upload a payment slip to start.");
      } else {
        $("#mbody").innerHTML = owed.length
          ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Invoice</th><th>Customer</th><th class="d">Invoice date</th><th class="num">Balance</th><th></th></tr></thead><tbody>
            ${owed.map((j) => {
              const days = daysBetween(j.invoiceDate || todayKL(), todayKL());
              const msg = `Hi ${j.customerName}, a friendly reminder from ${brandName()}: invoice ${j.invoiceNo}${j.plate ? ` (${j.plate})` : ""} has a balance of ${rm(j.balance)}.${j.invoiceToken ? `\n${docLink(j.invoiceToken)}` : ""}\nThank you!`;
              return `<tr class="tap" data-href="#/jobs/${j.id}"><td class="nowrap"><a class="strong" style="color:inherit;text-decoration:none" href="#/jobs/${j.id}">${esc(j.invoiceNo)}</a><div class="sm">${days > 0 ? `${days} day${days === 1 ? "" : "s"}` : "today"}</div></td>
                <td>${esc(j.customerName)}<div class="sm">${plateTag(j.plate)}</div></td><td class="d nowrap">${dmy(j.invoiceDate)}</td><td class="num strong">${rm(j.balance)}</td>
                <td class="num">${j.phone ? `<a class="btn wa sm" data-doc="${j.id}" href="${esc(waLink(j.phone, msg))}" target="_blank" rel="noopener">${icon("chat")}Remind</a>` : ""}</td></tr>`;
            }).join("")}</tbody></table></div>`
          : emptyBox("check", "Nobody owes you money.");
      }
    };
    $("#mtabs").onclick = (e) => {
      const a = e.target.closest("[data-t]");
      if (!a) return;
      e.preventDefault();
      tab = a.dataset.t;
      history.replaceState(null, "", a.getAttribute("href"));
      draw();
    };
    $("#payFile").onchange = onPaymentFile;
    $("#payCash").onclick = () => paymentForm({ method: "Cash" }, null, null);
    $("#payClose").onclick = () => ($("#payCard").hidden = true);
    draw();
    const fromInbox = q.get("inbox") && state.inbox.find((i) => i.id === q.get("inbox") && i.status === "New");
    if (fromInbox) return paymentForm(fromInbox.suggestion || { method: "Bank transfer" }, null, null, !!fromInbox.suggestion, fromInbox);
    const forJob = q.get("pay") && state.jobs.find((j) => j.id === q.get("pay"));
    if (forJob) paymentForm({ amount: forJob.balance, method: "Bank transfer" }, null, [{ id: forJob.id, docNo: docNo(forJob), customerName: forJob.customerName, plate: forJob.plate, balance: forJob.balance, why: [] }]);
    else if (q.get("upload")) $("#payFile").click();
    else if (q.get("cash")) paymentForm({ method: "Cash" }, null, null);
  }

  async function onPaymentFile(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    $("#payCard").hidden = false;
    const box = $("#payForm");
    box.innerHTML = `<div class="notice"><span class="spin"></span><div>Reading the payment slip…</div></div>`;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { suggestion, matches } = await api("/payments/extract", { method: "POST", form: fd });
      paymentForm(suggestion, file, matches, true);
    } catch (err) {
      paymentForm({ method: "Bank transfer" }, file, null);
      box.insertAdjacentHTML("afterbegin", `<div class="notice bad">${icon("alert")}<div>${esc(err.message)} You can type it below.</div></div>`);
    }
  }

  function openJobs() {
    return state.jobs.filter((j) => ["Draft", "Sent", "Part paid"].includes(j.status) && j.balance > 0)
      .map((j) => ({ id: j.id, docNo: docNo(j), customerName: j.customerName, plate: j.plate, balance: j.balance, why: [] }));
  }

  function paymentForm(sug, file, matches, ai, inboxItem) {
    const card = $("#payCard");
    if (!card) return;
    card.hidden = false;
    const box = $("#payForm");
    const list = matches && matches.length ? matches : openJobs();
    const best = list[0] && (list[0].score === undefined || list[0].score >= 3) ? list[0].id : "";
    const c = (v) => (ai && v != null && v !== "" ? "ai" : "");
    const methods = ["Bank transfer", "DuitNow", "Cash", "Card", "Cheque", "E-wallet", "Other"];
    box.innerHTML = `
      ${ai ? `<div class="notice">${icon("alert")}<div>AI filled the <b>blue</b> boxes. Check them, and check the invoice / estimate is right.</div></div>` : ""}
      <form id="pForm" novalidate>
        <label for="pf_job" class="req">For invoice / estimate</label>
        <select id="pf_job" name="jobId" required><option value="">— choose —</option>${list.map((m) => `<option value="${m.id}" ${m.id === best ? "selected" : ""}>${esc(m.docNo)} · ${esc(m.customerName)}${m.plate ? " · " + esc(m.plate) : ""} · balance ${rm(m.balance)}</option>`).join("")}</select>
        ${best && matches && matches[0]?.why?.length ? `<p class="hint">Matched by: ${esc(matches[0].why.join(", "))}</p>` : ai ? `<div class="notice warn">${icon("alert")}<div>Could not match this payment for sure. Please choose the invoice or estimate.</div></div>` : ""}
        <div class="fgrid">
          <div><label for="pf_amt" class="req">Amount (RM)</label><input id="pf_amt" class="${c(sug.amount)}" name="amount" type="number" inputmode="decimal" step="0.01" min="0" required value="${esc(sug.amount ?? "")}"></div>
          <div><label for="pf_date">Date</label><input id="pf_date" class="${c(sug.date)}" name="paidOn" type="date" value="${esc(sug.date || todayKL())}"></div>
          <div><label for="pf_m">Method</label><select id="pf_m" name="method">${methods.map((m) => `<option ${m === (sug.method || "Bank transfer") ? "selected" : ""}>${m}</option>`).join("")}</select></div>
          <div><label for="pf_ref">Reference</label><input id="pf_ref" class="${c(sug.reference)}" name="reference" value="${esc(sug.reference || "")}"></div>
          <div class="full"><label for="pf_by">Paid by</label><input id="pf_by" class="${c(sug.payerName)}" name="payerName" value="${esc(sug.payerName || "")}"></div>
        </div>
        <div class="btns"><button class="btn" type="submit">${icon("check")}Record payment &amp; make receipt</button></div>
      </form>`;
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    const form = $("#pForm");
    form.addEventListener("input", (e) => e.target.classList.remove("ai"));
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (!form.jobId.value) return toast("Choose which estimate or invoice this payment is for.");
      const data = { jobId: form.jobId.value, amount: form.amount.value, paidOn: form.paidOn.value, method: form.method.value, reference: form.reference.value, payerName: form.payerName.value, inboxId: inboxItem ? inboxItem.id : "" };
      const fd = new FormData();
      if (file) fd.append("file", file);
      fd.append("data", JSON.stringify(data));
      busy(e.submitter, true, "Recording…");
      try {
        const out = await api("/payments", { method: "POST", form: fd });
        await refresh("payments", "jobs", "inbox");
        if (!out.fileSaved) toast("Payment saved, but the slip file did not upload.");
        location.hash = `#/money/receipt/${out.payment.id}`;
      } catch (err) {
        toast(err.message, "err");
        busy(e.submitter, false);
      }
    };
  }

  function pageReceipt(id) {
    const p = state.payments.find((x) => x.id === id);
    if (!p) return (location.hash = "#/money");
    crumbs([["Money", "#/money"], [p.receiptNo]]);
    const j = state.jobs.find((x) => x.id === p.jobId) || {};
    const link = docLink(p.token);
    const msg = `Hi ${p.customerName}, thank you. We received ${rm(p.amount)} for ${p.docNo}.${j.balance > 0 ? ` Balance: ${rm(j.balance)}.` : " Fully paid."}\nOfficial receipt ${p.receiptNo}: ${link}`;
    view.innerHTML = `
      ${pageHead(`Receipt ${esc(p.receiptNo)}`, { back: "#/money", sub: esc(p.customerName), extra: j.balance !== undefined ? `<div class="chips">${j.balance > 0.009 ? pill(`Balance ${rm(j.balance)}`, "warn") : pill("Fully paid", "ok")}</div>` : "" })}
      <div class="split"><div class="card"><div class="sum">
          <div class="big" style="border:0;padding:0;margin:0"><span>Amount received</span><span>${rm(p.amount)}</span></div>
          <div><span class="muted">Date</span><span>${dmy(p.paidOn)}</span></div><div><span class="muted">Method</span><span>${esc(p.method)}</span></div>
          ${p.reference ? `<div><span class="muted">Reference</span><span>${esc(p.reference)}</span></div>` : ""}${p.payerName ? `<div><span class="muted">Paid by</span><span>${esc(p.payerName)}</span></div>` : ""}
          <div><span class="muted">For</span><span>${j.id ? `<a href="#/jobs/${j.id}">${esc(p.docNo)}</a>` : esc(p.docNo)}</span></div></div></div>
        <div class="card"><h2>Send to customer</h2><div class="stack">
          <a class="btn wa block" data-doc="${esc(j.id || "")}" href="${esc(waLink(j.phone, msg))}" target="_blank" rel="noopener">${icon("chat")}Send receipt by WhatsApp</a>
          <a class="btn alt block" data-doc="${esc(j.id || "")}" href="${esc(link)}" target="_blank" rel="noopener">${icon("open")}Open / save as PDF</a></div></div></div>`;
  }

  // ================= SETTINGS =================

  function pageSettings() {
    crumbs([["Settings"]]);
    const s = state.settings;
    const f = (k, label, type = "text", extra = "") => `<div><label for="s_${k}">${label}</label><input id="s_${k}" name="${k}" type="${type}" ${extra} value="${esc(s[k] ?? "")}"></div>`;
    view.innerHTML = `
      ${pageHead("Settings", { sub: "Pricing and the details printed on your documents" })}
      <form id="sForm" novalidate><div class="split"><div>
        <div class="card"><h2>On estimates, invoices &amp; receipts</h2><div class="fgrid">
          <div class="full">${f("legalName", "Registered name (exactly as on SSM certificate)").replace(/^<div>|<\/div>$/g, "")}</div>
          ${f("registrationNo", "SSM registration no")}${f("hotline", "Hotline", "tel")}
          <div class="full"><label for="s_address">Workshop address</label><textarea id="s_address" name="address" rows="2">${esc(s.address || "")}</textarea></div>
          ${f("tel", "Tel", "tel")}${f("email", "Email", "email")}
          ${f("whatsapp", "WhatsApp for payment proof", "tel")}<div></div>
          ${f("bankName", "Bank")}${f("bankAccountName", "Account name")}
          ${f("bankAccountNo", "Account no", "text", 'inputmode="numeric"')}<div></div>
          ${f("partsWarrantyMonths", "Parts warranty (months)", "number", 'inputmode="numeric" min="0"')}${f("estimateValidityDays", "Estimate valid (days)", "number", 'inputmode="numeric" min="1"')}
        </div><p class="hint">Empty boxes print as [PLACEHOLDER] on documents, so you can see what is missing.</p></div>
      </div><div>
        <div class="card"><h2>Parts pricing</h2>
          ${f("markupPercent", "Markup on parts (%)", "number", 'inputmode="decimal" step="any" min="0"')}${f("labourRate", "Labour rate per hour (RM)", "number", 'inputmode="decimal" step="any" min="0" placeholder="100"')}
          <label for="s_roundTo">Round selling price up to</label>
          <select id="s_roundTo" name="roundTo">${[[0, "No rounding"], [0.1, "Nearest 10 sen"], [0.5, "Nearest 50 sen"], [1, "Nearest RM1"], [5, "Nearest RM5"], [10, "Nearest RM10"]].map(([val, l]) => `<option value="${val}" ${Number(s.roundTo) === val ? "selected" : ""}>${l}</option>`).join("")}</select>
          <p class="hint" id="mkEx"></p></div>
        <div class="card"><h2>Import old records</h2><p class="muted" style="margin-top:-6px">Upload the import file (.json) made from your Excel. Anything already in the DMS is skipped, so it is safe to run again.</p>
          <div class="btns"><label class="btn alt upload">${icon("upload")}Choose import file<input type="file" id="impFile" accept=".json,application/json"></label></div><div id="impOut"></div></div>
        <div class="card"><h2>WhatsApp inbox</h2>${state.whatsapp?.enabled ? `<p style="margin:0">${pill("Connected", "ok")} Accepting bills from ${esc((state.whatsapp.allowed || []).join(", "))}.</p>` : `<p class="muted" style="margin:0">Not connected. <a href="#/inbox">See how to connect</a>.</p>`}</div>
        <div class="card"><h2>Opening balances</h2><div class="fgrid">
          ${f("openingCash", "Cash + bank on the opening date (RM)", "number", 'step="0.01" inputmode="decimal"')}${f("openingDate", "Opening date", "date")}
          <div class="full">${f("ownerCapital", "Owner capital put in (RM)", "number", 'step="0.01" inputmode="decimal"').replace(/^<div>|<\/div>$/g, "")}</div></div>
          <p class="hint">Used by the Balance sheet. Pick a start date (e.g. the 1st of this month) and enter your cash and bank total on that day.</p></div>
        <div class="card"><h2>Service reminders</h2><div class="fgrid">
          ${f("serviceIntervalKm", "Service every (km)", "number", 'inputmode="numeric" min="1000" step="500"')}${f("serviceIntervalMonths", "or every (months)", "number", 'inputmode="numeric" min="1"')}</div>
          <p class="hint">Used when you tick "Set next service reminder" on an invoice.</p></div>
        <div class="card"><h2>DuitNow QR</h2>
          ${s.duitNowQr ? `<img src="${esc(s.duitNowQr)}" alt="DuitNow QR" style="width:140px;height:140px;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:8px">` : `<p class="muted">Not uploaded yet. A dashed box shows on documents until you add it.</p>`}
          <div class="btns"><label class="btn alt upload">${icon("upload")}Upload QR picture<input type="file" id="qrFile" accept="image/*"></label></div></div>
        <button class="btn block" type="submit">${icon("check")}Save settings</button>
      </div></div></form>`;
    const form = $("#sForm");
    const ex = () => ($("#mkEx").textContent = `Example: part cost RM100 → sell ${rm(sellPrice(100, form.markupPercent.value, form.roundTo.value))}`);
    form.addEventListener("input", ex);
    ex();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(form).entries());
      busy(e.submitter, true, "Saving…");
      try {
        state.settings = await api("/settings", { method: "PUT", body });
        toast("Settings saved");
      } catch (err) {
        toast(err.message, "err");
      } finally {
        busy(e.submitter, false);
      }
    };
    $("#impFile").onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      if (!confirm(`Import ${file.name} into the DMS now?`)) return;
      const box = $("#impOut");
      box.innerHTML = `<div class="notice"><span class="spin"></span><div>Importing… this can take a minute. Keep this page open.</div></div>`;
      const fd = new FormData();
      fd.append("file", file);
      try {
        const r = await api("/import", { method: "POST", form: fd });
        const line = (o) => Object.entries(o).map(([k, v]) => `${v} ${k}`).join(", ") || "nothing";
        box.innerHTML = `<div class="notice ok">${icon("check")}<div><b>Done.</b> Added: ${esc(line(r.created))}.<br>Already there (skipped): ${esc(line(r.skipped))}.</div></div>
          ${r.problems.length ? `<div class="notice warn">${icon("alert")}<div>Please check:<br>${r.problems.map(esc).join("<br>")}</div></div>` : ""}`;
        await loadAll();
      } catch (err) {
        box.innerHTML = `<div class="notice bad">${icon("alert")}<div>${esc(err.message)}</div></div>`;
      }
    };
    $("#qrFile").onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append("file", file);
      try {
        state.settings = await api("/settings/qr", { method: "POST", form: fd });
        toast("QR saved");
        pageSettings();
      } catch (err) {
        toast(err.message, "err");
      }
    };
  }

  // ================= LOGIN & START =================

  function showLogin() {
    $("#shell").hidden = true;
    const box = $("#login");
    box.hidden = false;
    const go = $("#login-go");
    go.classList.remove("is-loading");
    go.textContent = "Sign in";
    $("#login-pw").value = "";
    window.MLSplash && window.MLSplash.ready();
  }
  // login.js calls this. true = signed in (the app opens), false = wrong password.
  window.signIn = async (password) => {
    try {
      await api("/login", { method: "POST", body: { password } });
    } catch {
      return false;
    }
    await start();
    return true;
  };

  let shellBuilt = false;
  async function start() {
    const me = await fetch("/api/me", { credentials: "same-origin" }).then((r) => r.json()).catch(() => ({}));
    if (!me.loggedIn) return showLogin();
    $("#login").hidden = true;
    $("#shell").hidden = false;
    if (!shellBuilt) { buildShell(); shellBuilt = true; }
    view.innerHTML = `<div class="loading"><span class="spin"></span>Loading…</div>`;
    try {
      await loadAll();
    } catch (err) {
      view.innerHTML = `<div class="notice bad">${icon("alert")}<div>${esc(err.message)}</div></div>`;
      window.MLSplash && window.MLSplash.ready();
      return;
    }
    route();
    window.MLSplash && window.MLSplash.ready();   // the start animation hands over to the dashboard
  }

  start();
})();
