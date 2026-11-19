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

  const state = { settings: null, parts: [], jobs: [], payments: [], customers: [], vehicles: [], route: "" };

  // ---------- icons (simple line icons, 24px grid) ----------
  const ICONS = {
    dashboard: '<path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"/>',
    jobs: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3.6 17.2a1.6 1.6 0 0 0 2.3 2.3l5.7-5.7a4 4 0 0 0 5.2-5.4l-2.5 2.5-2.3-.4-.4-2.3z"/>',
    car: '<path d="M3 13l2-5.2A2 2 0 0 1 6.9 6.5h10.2a2 2 0 0 1 1.9 1.3L21 13v4a1 1 0 0 1-1 1h-1M5 18H4a1 1 0 0 1-1-1v-4h18M9 18h6"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    users: '<path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3M15.5 4.2a3.5 3.5 0 0 1 0 6.6"/><circle cx="10" cy="7.5" r="3.5"/>',
    parts: '<path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>',
    money: '<path d="M3 7a2 2 0 0 1 2-2h12v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16" cy="14" r="1"/>',
    settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
    chat: '<path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H4"/>',
    file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h6"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    alert: '<path d="M12 9v4M12 17h.01M10.3 4.2L2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/>',
    calendar: '<path d="M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 10h16M8 3v4M16 3v4"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3"/>',
    gauge: '<path d="M12 14l4-4M3.5 17a9 9 0 1 1 17 0"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  };
  const icon = (n, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ""}</svg>`;

  const AV = [["#e0ecff", "#1d4ed8"], ["#e6f6ec", "#15803d"], ["#fdf3e2", "#b45309"], ["#f3e8ff", "#7e22ce"], ["#ffe4e6", "#be123c"], ["#e0f2fe", "#0369a1"]];
  function avatar(name) {
    const words = String(name || "?").trim().split(/\s+/);
    const ini = ((words[0] || "?")[0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
    let h = 0;
    for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const [bg, ink] = AV[h % AV.length];
    return `<span class="avatar" style="background:${bg};color:${ink}" aria-hidden="true">${esc(ini)}</span>`;
  }

  const STAGES = ["Booked", "In workshop", "Waiting parts", "Ready", "Collected"];
  const STAGE_CLS = { Booked: "", "In workshop": "info", "Waiting parts": "warn", Ready: "ok", Collected: "" };
  const STATUS_CLS = { Draft: "", Sent: "info", "Part paid": "warn", Paid: "ok", Cancelled: "bad" };
  const pill = (txt, cls = "") => `<span class="pill ${cls}">${cls ? '<span class="dot"></span>' : ""}${esc(txt)}</span>`;
  const statusPill = (s) => pill(s, STATUS_CLS[s] ?? "");
  const stagePill = (s) => (s ? pill(s, STAGE_CLS[s] ?? "") : "");
  const plateTag = (p) => (p ? `<span class="plate">${esc(p)}</span>` : "");
  const shortCar = (c) => String(c || "").replace(/^Mercedes-Benz\s+/i, "");
  const kindOf = (j) => (j.invoiceNo ? "Invoice" : "Estimate");
  const isWorkshop = (j) => j.status !== "Cancelled" && ["In workshop", "Waiting parts", "Ready"].includes(j.stage);

  // ---------- helpers ----------

  function toast(msg) {
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

  const emptyBox = (ic, msg) => `<div class="empty">${icon(ic)}${msg}</div>`;

  // ---------- data ----------

  async function loadAll() {
    const [s, p, q, pay, c, v] = await Promise.all([api("/settings"), api("/parts"), api("/jobs"), api("/payments"), api("/customers"), api("/vehicles")]);
    state.settings = s;
    state.parts = p.parts;
    state.jobs = q.jobs;
    state.payments = pay.payments;
    state.customers = c.customers;
    state.vehicles = v.vehicles;
  }
  async function refresh(...what) {
    const map = { jobs: "/jobs", payments: "/payments", customers: "/customers", parts: "/parts", vehicles: "/vehicles" };
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

  const NAV = [
    ["Overview", [["dashboard", "Dashboard", "dashboard"]]],
    ["Workshop", [["jobs", "Jobs", "jobs"], ["vehicles", "Vehicles", "car"], ["customers", "Customers", "users"]]],
    ["Business", [["parts", "Parts & stock", "parts"], ["money", "Money", "money"]]],
  ];

  function buildShell() {
    $("#side").innerHTML = `
      <div class="brand"><svg width="30" height="30" viewBox="0 0 120 120" aria-hidden="true"><polygon points="60,10 104,35 104,85 60,110 16,85 16,35" fill="#5b9bf5"/><polygon points="60,10 104,35 60,60 16,35" fill="#3f77d1"/></svg>
        <div>The Merc Lab<small>Workshop DMS</small></div></div>
      <nav class="nav">${NAV.map(([h, items]) => `<div class="nav-h">${h}</div>${items.map(([k, l, ic]) => `<a href="#/${k}" data-nav="${k}">${icon(ic)}<span>${l}</span>${k === "jobs" ? '<span class="count" id="navWs" hidden></span>' : ""}</a>`).join("")}`).join("")}</nav>
      <div class="side-foot"><a href="#/settings" data-nav="settings">${icon("settings")}<span>Settings</span></a>
        <button type="button" id="logoutBtn">${icon("logout")}<span>Log out</span></button></div>`;
    $("#bottom").innerHTML = [["dashboard", "Home", "dashboard"], ["jobs", "Jobs", "jobs"], ["vehicles", "Cars", "car"], ["money", "Money", "money"]]
      .map(([k, l, ic]) => `<a href="#/${k}" data-nav="${k}">${icon(ic)}${l}</a>`).join("") + `<button type="button" id="moreBtn">${icon("menu")}Menu</button>`;
    $("#menuBtn").innerHTML = icon("menu");
    $("#gIcon").outerHTML = icon("search");
    const open = (on) => document.body.classList.toggle("nav-open", on);
    $("#menuBtn").onclick = () => open(true);
    $("#moreBtn").onclick = () => open(true);
    $("#scrim").onclick = () => open(false);
    $("#side").addEventListener("click", (e) => e.target.closest("a") && open(false));
    $("#logoutBtn").onclick = async () => {
      await api("/logout", { method: "POST" }).catch(() => {});
      showLogin();
    };
    setupSearch();
  }

  function setActive(section) {
    $$("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === section));
    const ws = state.jobs.filter(isWorkshop).length;
    const b = $("#navWs");
    if (b) {
      b.hidden = !ws;
      b.textContent = ws;
      b.title = `${ws} car(s) in the workshop`;
    }
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
    const { parts, q } = parseHash();
    const [sec = "dashboard", a, b] = parts;
    setActive(sec);
    window.scrollTo(0, 0);
    try {
      if (sec === "dashboard") return pageDashboard();
      if (sec === "jobs") {
        if (a === "new") return jobForm("new", null, q);
        if (a && b === "invoice") return jobForm("invoice", state.jobs.find((j) => j.id === a));
        if (a) return pageJob(a);
        return pageJobs(q);
      }
      if (sec === "vehicles") return a ? pageVehicle(a, b || "details") : pageVehicles(q);
      if (sec === "customers") return a ? pageCustomer(a) : pageCustomers();
      if (sec === "parts") return pageParts();
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
    const owed = owedInvoices();
    const ws = state.jobs.filter(isWorkshop);
    const ready = ws.filter((j) => j.stage === "Ready").length;
    const lanes = ["Booked", "In workshop", "Waiting parts", "Ready"];
    const laneJobs = (st) => state.jobs.filter((j) => j.status !== "Cancelled" && j.stage === st && (st !== "Booked" || daysBetween(jobDate(j) || today, today) <= 30));
    const low = state.parts.filter((p) => p.qtyLeft <= 1).slice(0, 6);
    const soon = state.vehicles.filter((v) => v.nextServiceDate && daysBetween(today, v.nextServiceDate) <= 30).sort((a, b) => a.nextServiceDate.localeCompare(b.nextServiceDate)).slice(0, 6);
    const monthName = new Date(today + "T00:00:00Z").toLocaleString("en-MY", { month: "long", timeZone: "UTC" });
    const tile = (href, ic, lbl, val, foot) => `<a class="tile" href="${href}"><div class="lbl">${icon(ic)}${lbl}</div><div class="val">${val}</div><div class="foot">${foot}</div></a>`;

    view.innerHTML = `
      ${pageHead("Dashboard", { sub: new Date(today + "T00:00:00Z").toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }), acts: `<a class="btn alt" href="#/money?upload=1">${icon("upload")}Payment slip</a><a class="btn" href="#/jobs/new">${icon("plus")}New estimate</a>` })}
      <div class="grid g4" style="margin-bottom:16px">
        ${tile("#/money", "money", "Money in today", rm(inToday), `${monthName}: ${rm(inMonth)}`)}
        ${tile("#/jobs?f=invoices", "receipt", `Invoiced in ${monthName}`, rm(invMonth.reduce((t, j) => t + j.total, 0)), `${invMonth.length} invoice${invMonth.length === 1 ? "" : "s"}`)}
        ${tile("#/money?tab=owed", "alert", "Owed to you", rm(owed.reduce((t, j) => t + j.balance, 0)), `${owed.length} unpaid invoice${owed.length === 1 ? "" : "s"}`)}
        ${tile("#/jobs?f=workshop", "car", "Cars in workshop", ws.length, `${ready} ready for pickup`)}
      </div>
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
      ${pageHead(`${esc(docNo(j))}`, { back: "#/jobs", sub: `${esc(j.customerName)}${j.car ? " · " + esc(j.car) : ""}`, extra: `<div class="chips">${pill(kindOf(j), "info")}${statusPill(j.status)}</div>`, acts: `${docs[0] ? `<a class="btn wa" data-sent href="${esc(docs[0].wa)}" target="_blank" rel="noopener">${icon("chat")}Send ${docs[0].kind.toLowerCase()}</a>` : ""}${primary}` })}
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
            <div><span class="muted">Paid</span><span>${rm(j.paid)}</span></div>
            <div><span class="strong">Balance</span><span class="strong">${rm(j.balance)}</span></div></div>
            ${!cancelled && !j.invoiceNo && j.balance > 0.009 ? `<div class="btns"><a class="btn alt block" href="#/money?pay=${j.id}">${icon("money")}Record deposit</a></div>` : ""}
          </div>
          ${docs.length ? `<div class="card"><h2>Documents</h2><div class="rows">${docs.map((d) => `<div class="docrow"><div class="grow"><b>${d.kind}</b><span class="muted">${esc(d.no)}</span></div>
            <div class="da"><a class="btn alt sm" href="${esc(d.link)}" target="_blank" rel="noopener">${icon("open")}PDF</a><a class="btn wa sm" data-sent href="${esc(d.wa)}" target="_blank" rel="noopener">${icon("chat")}Send</a></div></div>`).join("")}</div></div>` : ""}
          <div class="card"><h2>Customer &amp; car</h2><dl class="kv">
            <dt>Customer</dt><dd>${cust ? `<a href="#/customers/${cust.id}">${esc(j.customerName)}</a>` : esc(j.customerName)}</dd>
            <dt>Phone</dt><dd>${j.phone ? `<a href="tel:${esc(j.phone)}">${esc(j.phone)}</a>` : "—"}</dd>
            <dt>Car</dt><dd>${vk ? `<a href="#/vehicles/${vk}">${plateTag(j.plate)} ${esc(j.car)}</a>` : esc(j.car || "—")}</dd>
            ${vk ? `<dt>Body condition</dt><dd><a href="#/vehicles/${vk}/condition?job=${encodeURIComponent(docNo(j))}">${v && v.openMarks ? `${v.openMarks} mark(s)` : "Check-in"} →</a></dd>` : ""}
          </dl></div>
          ${!j.paid && !j.invoiceNo && !cancelled ? `<button class="btn danger block" id="jCancel">${icon("x")}Cancel estimate</button>` : ""}
        </div>
      </div>`;
    $$("[data-sent]").forEach((a) => a.addEventListener("click", async () => {
      if (j.status !== "Draft") return;
      try { Object.assign(j, await api(`/jobs/${j.id}/status`, { method: "POST", body: { status: "Sent" } })); } catch { /* ignore */ }
    }));
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
        toast(err.message);
      }
    };
    const c = $("#jCancel");
    if (c) c.onclick = async () => {
      if (!confirm(`Cancel ${j.estimateNo}? The number stays in the records.`)) return;
      try { Object.assign(j, await api(`/jobs/${j.id}/status`, { method: "POST", body: { status: "Cancelled" } })); toast("Estimate cancelled"); pageJob(j.id); } catch (err) { toast(err.message); }
    };
  }

  // ---------- job form (new estimate, or estimate → invoice) ----------

  const LINE_LABEL = { part: "Part", labour: "Labour", sundry: "Sundry", sublet: "Sublet" };

  function lineHtml(l) {
    const t = l.type;
    const amountField = t === "part"
      ? `<div class="item-grid"><div><label>Qty</label><input name="qty" type="number" inputmode="decimal" step="any" min="0" value="${esc(l.qty ?? 1)}"></div>
         <div><label>Unit price (RM)</label><input name="unitPrice" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(l.unitPrice ?? "")}"></div></div>`
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
      <div class="gh"><b>C${i + 1}</b><input name="request" placeholder="Customer request, e.g. TO PERFORM SERVICE B" aria-label="Customer request" value="${esc(g.request || "")}" style="text-transform:uppercase"><button type="button" class="x gx" title="Remove this request" aria-label="Remove this request">${icon("x")}</button></div>
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
        <div class="grid g2">
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
              <div><label for="chassisNo">Chassis no</label><input id="chassisNo" name="chassisNo" style="text-transform:uppercase" value="${v(d.vehicle?.chassisNo)}"></div>
              <div><label for="engineNo">Engine no</label><input id="engineNo" name="engineNo" style="text-transform:uppercase" value="${v(d.vehicle?.engineNo)}"></div>
              <div><label for="regDate">Reg date</label><input id="regDate" name="regDate" type="date" value="${v(d.vehicle?.regDate)}"></div>
            </div>
            <datalist id="plateList">${state.vehicles.map((x) => `<option value="${esc(x.plate)}">${esc(x.makeModel)} · ${esc(x.ownerName)}</option>`).join("")}</datalist>
          </div>
        </div>
        <datalist id="partOptions">${parts.map((p) => `<option value="${esc(p.name)}${p.partNo ? " · " + esc(p.partNo) : ""}">${rm(p.sellingPrice)} · ${p.qtyLeft} left</option>`).join("")}</datalist>
        <div class="card" style="margin-top:16px"><div class="card-h"><h2>Work</h2><div class="r"><button type="button" class="btn alt sm" id="addGroup">${icon("plus")}Customer request</button></div></div>
          <div id="groups">${groups.map(groupHtml).join("")}</div>
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
            <div class="t">Parts<b id="tParts">RM 0.00</b></div><div class="t">Labour &amp; sundries<b id="tLabour">RM 0.00</b></div><div class="t grand">Grand total<b id="tGrand">RM 0.00</b></div>
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
      $("#tParts").textContent = rm(p);
      $("#tLabour").textContent = rm(l);
      $("#tGrand").textContent = rm(r2(p + l + extra));
    };
    const renumber = () => $$(".group", box).forEach((g, i) => ($("b", g).textContent = `C${i + 1}`));

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
      totals();
    });
    box.addEventListener("change", (e) => {
      if (!e.target.classList.contains("pick")) return;
      const val = e.target.value;
      const p = parts.find((x) => `${x.name}${x.partNo ? " · " + x.partNo : ""}` === val) || parts.find((x) => x.name === val);
      if (!p) return;
      $(".lines", e.target.closest(".group")).insertAdjacentHTML("beforeend", lineHtml({ type: "part", partId: p.id, partNo: p.partNo, description: [p.brand, p.name].filter(Boolean).join(" ").toUpperCase(), qty: 1, unitPrice: p.sellingPrice }));
      if (p.qtyLeft <= 0) toast(`${p.name}: none left in stock`);
      e.target.value = "";
      totals();
    });
    box.addEventListener("input", totals);
    form.surcharge.oninput = totals;
    form.menus.oninput = totals;
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
        customerId: job?.customerId || pre?.customerId || (cust ? cust.id : ""),
        customer: { name, phone: form.cPhone.value, address: form.cAddress.value },
        vehicle: { makeModel: form.makeModel.value, regNo: form.regNo.value, mileageKm: form.mileageKm.value, chassisNo: form.chassisNo.value, engineNo: form.engineNo.value, regDate: form.regDate.value },
        invoiceTo: { name: form.itName.value, address: form.itAddress.value },
        advisor,
        accountNo: form.accountNo.value, orderNo: form.orderNo.value, referenceNo: form.referenceNo.value, wipNo: form.wipNo.value, jobNo: form.jobNo.value,
        surcharge: form.surcharge.value, menus: form.menus.value,
        plannedDate: form.plannedDate?.value || "",
        repairDate: form.repairDate?.value || "",
        dueDate: form.dueDate?.value || "",
        groups: $$(".group", box).map((g) => ({
          request: $("[name=request]", g).value,
          lines: $$(".item", g).map((el) => ({
            type: el.dataset.type,
            partId: el.dataset.part,
            category: el.dataset.cat,
            taxable: el.dataset.tax === "1",
            partNo: $("[name=partNo]", el)?.value,
            opCode: $("[name=opCode]", el)?.value,
            description: $("[name=description]", el).value,
            qty: $("[name=qty]", el)?.value,
            unitPrice: $("[name=unitPrice]", el)?.value,
            amount: $("[name=amount]", el)?.value,
          })),
        })),
      };
      const btn = e.submitter;
      busy(btn, true, "Saving…");
      try {
        const out = mode === "invoice"
          ? await api(`/jobs/${job.id}/invoice`, { method: "POST", body })
          : await api("/jobs", { method: "POST", body });
        await refresh("jobs", "customers", "parts", "vehicles");
        toast(`${docNo(out.job)} saved`);
        if (out.lowStock?.length) setTimeout(() => toast(`Stock went below 0 for: ${out.lowStock.join(", ")}`), 1800);
        location.hash = `#/jobs/${out.job.id}`;
      } catch (err) {
        toast(err.message);
        busy(btn, false);
      }
    };
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
        toast(err.message);
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
        toast(err.message);
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
        toast(err.message);
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
          toast(err.message);
          busy(e.currentTarget, false);
        }
      };
      const fix = d.$("#mFix");
      if (fix) fix.onclick = async () => {
        try { after(await api(`/vehicles/${v.key}/marks/${m.id}`, { method: "PATCH", body: { fixed: !m.fixed } })); toast(m.fixed ? "Marked as not fixed" : "Marked as fixed"); } catch (err) { toast(err.message); }
      };
      const del = d.$("#mDel");
      if (del) del.onclick = async () => {
        if (!confirm("Remove this mark? Use this only for a mark added by mistake. For a repaired spot, use Mark fixed.")) return;
        try { after(await api(`/vehicles/${v.key}/marks/${m.id}`, { method: "DELETE" })); toast("Mark removed"); } catch (err) { toast(err.message); }
      };
    }
    draw();
  }

  // ================= CUSTOMERS =================

  function pageCustomers() {
    crumbs([["Customers"]]);
    const rows = state.customers.map((c) => ({ c, s: customerStats(c) }));
    let sort = "recent";
    view.innerHTML = `
      ${pageHead("Customers", { sub: `${state.customers.length} customer${state.customers.length === 1 ? "" : "s"}`, acts: `<button class="btn" id="addCust">${icon("plus")}Add customer</button>` })}
      <div class="toolbar"><div class="search">${icon("search")}<input id="cq" type="search" placeholder="Search name, phone, plate" aria-label="Search customers"></div>
        <div class="seg" id="cs" role="group" aria-label="Sort"><button type="button" class="on" data-s="recent">Recent</button><button type="button" data-s="name">A–Z</button><button type="button" data-s="owes">Owes</button></div></div>
      <div class="card flush" id="ct"></div>`;
    const draw = () => {
      const s = $("#cq").value.trim().toLowerCase();
      const digits = s.replace(/\D/g, "");
      const pk = plateKey(s);
      const list = rows.filter(({ c, s: st }) => !s || c.name.toLowerCase().includes(s) || (digits.length > 3 && c.phone.replace(/\D/g, "").includes(digits)) || (pk && st.plates.some((p) => p.includes(pk))) || c.email.toLowerCase().includes(s));
      list.sort((a, b) => (sort === "name" ? a.c.name.localeCompare(b.c.name) : sort === "owes" ? b.s.owes - a.s.owes : (b.s.last || b.c.createdTime || "").localeCompare(a.s.last || a.c.createdTime || "")));
      $("#ct").innerHTML = list.length
        ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Customer</th><th class="d">Phone</th><th class="d">Cars</th><th class="d">Last visit</th><th class="num d">Spent</th><th class="num">Owes</th></tr></thead><tbody>
          ${list.map(({ c, s: st }) => `<tr class="tap" data-href="#/customers/${c.id}"><td><div class="who">${avatar(c.name)}<div style="min-width:0"><a href="#/customers/${c.id}" class="strong" style="color:inherit;text-decoration:none">${esc(c.name)}</a><div class="sm">${esc(c.email || c.phone)}</div></div></div></td>
            <td class="d nowrap">${esc(c.phone) || "—"}</td><td class="d">${st.plates.map((p) => plateTag(vehicleByKey(p)?.plate || p)).join(" ") || "—"}</td><td class="d nowrap">${st.last ? dmy(st.last) : "—"}</td>
            <td class="num d">${rm(st.spent)}</td><td class="num">${st.owes > 0.009 ? `<span class="strong" style="color:var(--bad)">${rm(st.owes)}</span>` : "—"}</td></tr>`).join("")}
          </tbody></table></div>`
        : emptyBox("users", state.customers.length ? "No customer matches." : "No customers yet. They are added when you make an estimate, or press Add customer.");
    };
    $("#cq").oninput = draw;
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
        toast(err.message);
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
        </div>
        <div>
          <div class="card"><div class="card-h"><h2>Contact</h2><div class="r"><button class="btn ghost sm" id="editCust">${icon("edit")}Edit</button></div></div>
            <dl class="kv"><dt>Phone</dt><dd>${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : "—"}</dd><dt>Email</dt><dd>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : "—"}</dd>
            <dt>Address</dt><dd style="white-space:pre-line">${esc(c.address) || "—"}</dd>${c.notes ? `<dt>Notes</dt><dd style="white-space:pre-line">${esc(c.notes)}</dd>` : ""}</dl></div>
          <div class="card"><h2>Money</h2><div class="sum"><div><span class="muted">Spent (invoices)</span><span>${rm(st.spent)}</span></div><div><span class="muted">Visits</span><span>${st.jobs.length}</span></div>
            <div class="big"><span>Owes</span><span style="${st.owes > 0.009 ? "color:var(--bad)" : ""}">${rm(st.owes)}</span></div></div>
            ${pays.length ? `<div class="rows" style="margin-top:14px">${pays.slice(0, 6).map((p) => `<a href="#/money/receipt/${p.id}"><div class="grow"><b>${esc(p.receiptNo)}</b><span class="muted">${dmy(p.paidOn)}</span></div><div class="r">${rm(p.amount)}</div></a>`).join("")}</div>` : ""}</div>
        </div>
      </div>`;
    $("#editCust").onclick = () => customerDialog(c);
  }

  // ================= PARTS =================

  function pageParts() {
    crumbs([["Parts & stock"]]);
    const s = state.settings;
    const inStock = state.parts.filter((p) => p.qtyLeft > 0);
    const value = inStock.reduce((t, p) => t + p.qtyLeft * p.unitCost, 0);
    const low = state.parts.filter((p) => p.qtyLeft <= 1).length;
    view.innerHTML = `
      ${pageHead("Parts & stock", { sub: `Selling price = cost + ${esc(s.markupPercent)}% markup`, acts: `<button class="btn alt" id="buyManual">${icon("edit")}Enter by hand</button><label class="btn upload">${icon("upload")}Upload supplier receipt<input type="file" id="buyFile" accept="image/*,application/pdf"></label>` })}
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
        toast(err.message);
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

  function purchaseForm(sug, file, ai) {
    $("#buyCard").hidden = false;
    const box = $("#buyForm");
    const c = (v) => (ai && v != null && v !== "" ? "ai" : "");
    box.innerHTML = `
      ${ai ? `<div class="notice">${icon("alert")}<div>AI filled the <b>blue</b> boxes. Check them against the receipt, then save.</div></div>` : ""}
      <form id="purForm" novalidate>
        <div class="fgrid3"><div><label for="pu_s">Supplier</label><input id="pu_s" class="${c(sug.supplier)}" name="supplier" value="${esc(sug.supplier || "")}"></div>
          <div><label for="pu_d">Date</label><input id="pu_d" class="${c(sug.date)}" name="date" type="date" value="${esc(sug.date || "")}"></div>
          <div><label for="pu_r">Receipt no</label><input id="pu_r" class="${c(sug.receiptNo)}" name="receiptNo" value="${esc(sug.receiptNo || "")}"></div></div>
        <div id="purItems">${sug.items.map((it) => itemRow(it, ai)).join("")}</div>
        <div class="addrow"><button type="button" class="btn alt sm" id="addItem">${icon("plus")}Add part</button></div>
        <div class="fgrid"><div><label for="pu_t">Total on receipt (RM)</label><input id="pu_t" class="${c(sug.total)}" name="total" type="number" inputmode="decimal" step="0.01" value="${esc(sug.total ?? "")}"></div></div>
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
    check();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const data = {
        supplier: form.supplier.value, date: form.date.value, receiptNo: form.receiptNo.value, total: form.total.value,
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
        await refresh("parts");
        toast(`Saved ${out.parts.length} part(s) — ${out.ref}`);
        if (!out.fileSaved) setTimeout(() => toast("Parts saved, but the receipt file did not upload."), 1800);
        pageParts();
      } catch (err) {
        toast(err.message);
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
                <td class="num">${j.phone ? `<a class="btn wa sm" href="${esc(waLink(j.phone, msg))}" target="_blank" rel="noopener">${icon("chat")}Remind</a>` : ""}</td></tr>`;
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
    const forJob = q.get("pay") && state.jobs.find((j) => j.id === q.get("pay"));
    if (forJob) paymentForm({ amount: forJob.balance, method: "Bank transfer" }, null, [{ id: forJob.id, docNo: docNo(forJob), customerName: forJob.customerName, plate: forJob.plate, balance: forJob.balance, why: [] }]);
    else if (q.get("upload")) $("#payFile").click();
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

  function paymentForm(sug, file, matches, ai) {
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
      const data = { jobId: form.jobId.value, amount: form.amount.value, paidOn: form.paidOn.value, method: form.method.value, reference: form.reference.value, payerName: form.payerName.value };
      const fd = new FormData();
      if (file) fd.append("file", file);
      fd.append("data", JSON.stringify(data));
      busy(e.submitter, true, "Recording…");
      try {
        const out = await api("/payments", { method: "POST", form: fd });
        await refresh("payments", "jobs");
        if (!out.fileSaved) toast("Payment saved, but the slip file did not upload.");
        location.hash = `#/money/receipt/${out.payment.id}`;
      } catch (err) {
        toast(err.message);
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
          <a class="btn wa block" href="${esc(waLink(j.phone, msg))}" target="_blank" rel="noopener">${icon("chat")}Send receipt by WhatsApp</a>
          <a class="btn alt block" href="${esc(link)}" target="_blank" rel="noopener">${icon("open")}Open / save as PDF</a></div></div></div>`;
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
          ${f("markupPercent", "Markup on parts (%)", "number", 'inputmode="decimal" step="any" min="0"')}
          <label for="s_roundTo">Round selling price up to</label>
          <select id="s_roundTo" name="roundTo">${[[0, "No rounding"], [0.1, "Nearest 10 sen"], [0.5, "Nearest 50 sen"], [1, "Nearest RM1"], [5, "Nearest RM5"], [10, "Nearest RM10"]].map(([val, l]) => `<option value="${val}" ${Number(s.roundTo) === val ? "selected" : ""}>${l}</option>`).join("")}</select>
          <p class="hint" id="mkEx"></p></div>
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
        toast(err.message);
      } finally {
        busy(e.submitter, false);
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
        toast(err.message);
      }
    };
  }

  // ================= LOGIN & START =================

  function showLogin() {
    $("#shell").hidden = true;
    const box = $("#login");
    box.hidden = false;
    box.innerHTML = `<div class="login"><div class="box">
      <svg width="40" height="40" viewBox="0 0 120 120" aria-hidden="true"><polygon points="60,10 104,35 104,85 60,110 16,85 16,35" fill="#5b9bf5"/><polygon points="60,10 104,35 60,60 16,35" fill="#3f77d1"/></svg>
      <h1>The Merc Lab DMS</h1><p class="muted" style="margin:0 0 16px">Log in to continue.</p>
      <form id="loginForm"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required>
      <div class="btns"><button class="btn block" type="submit">Log in</button></div></form></div></div>`;
    $("#pw").focus();
    $("#loginForm").onsubmit = async (e) => {
      e.preventDefault();
      busy(e.submitter, true);
      try {
        await api("/login", { method: "POST", body: { password: $("#pw").value } });
        await start();
      } catch (err) {
        toast(err.message);
        busy(e.submitter, false);
      }
    };
  }

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
      return;
    }
    route();
  }

  start();
})();
