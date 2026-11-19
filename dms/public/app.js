// Merc Lab DMS — phone app. Plain JavaScript, no build step.
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const view = $("#view");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rm = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const dmy = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
  const num = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));

  const state = { tab: "buy", settings: null, parts: [], jobs: [], payments: [], customers: [] };

  // ---------- helpers ----------

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 3200);
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

  async function loadAll() {
    const [s, p, q, pay, c] = await Promise.all([api("/settings"), api("/parts"), api("/jobs"), api("/payments"), api("/customers")]);
    state.settings = s;
    state.parts = p.parts;
    state.jobs = q.jobs;
    state.payments = pay.payments;
    state.customers = c.customers;
  }

  // ---------- login ----------

  function showLogin() {
    $("#tabs").hidden = true;
    view.innerHTML = `<div class="card" style="margin-top:30px">
      <h2>Log in</h2>
      <form id="loginForm"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required>
      <div class="btns"><button class="btn" type="submit">Log in</button></div></form></div>`;
    $("#loginForm").onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.submitter;
      busy(btn, true);
      try {
        await api("/login", { method: "POST", body: { password: $("#pw").value } });
        await start();
      } catch (err) {
        toast(err.message);
      } finally {
        busy(btn, false);
      }
    };
  }

  // ---------- tabs ----------

  function setTab(tab) {
    state.tab = tab;
    $$("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    window.scrollTo(0, 0);
    ({ buy: renderBuy, jobs: renderJobs, money: renderMoney, settings: renderSettings })[tab]();
  }

  $("#tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (b) setTab(b.dataset.tab);
  });

  // ================= PARTS (supplier receipts) =================

  function renderBuy() {
    const s = state.settings;
    view.innerHTML = `
      <h2>Parts</h2>
      <div class="card">
        <label class="upload" id="buyUpload">📷 Upload supplier receipt
          <small>Photo or PDF. AI reads it and sets your selling price (+${esc(s.markupPercent)}%).</small>
          <input type="file" id="buyFile" accept="image/*,application/pdf">
        </label>
        <div class="btns"><button class="btn alt" id="buyManual">Enter parts by hand</button></div>
        <div id="buyForm"></div>
      </div>
      <div class="card">
        <div class="row"><h3>In stock</h3><input id="partSearch" placeholder="Search parts" style="max-width:200px"></div>
        <div class="list" id="partList"></div>
      </div>`;
    $("#buyFile").onchange = onReceiptFile;
    $("#buyManual").onclick = () => purchaseForm({ supplier: "", date: "", receiptNo: "", total: null, items: [{ name: "", qty: 1, unitCost: null }] }, null);
    $("#partSearch").oninput = drawParts;
    drawParts();
  }

  function drawParts() {
    const q = ($("#partSearch")?.value || "").toLowerCase();
    const parts = state.parts.filter((p) => !q || `${p.name} ${p.partNo} ${p.brand} ${p.supplier}`.toLowerCase().includes(q));
    $("#partList").innerHTML = parts.length
      ? parts.map((p) => `<div class="li tap" data-part="${p.id}"><div><b>${esc(p.name)}</b><span class="muted">${esc([p.brand, p.partNo].filter(Boolean).join(" · "))}${p.supplier ? ` · ${esc(p.supplier)}` : ""}</span></div>
          <div class="r"><b>${rm(p.sellingPrice)}</b><span class="muted">cost ${rm(p.unitCost)} · ${p.qtyLeft} left</span></div></div>`).join("")
      : `<p class="muted">No parts yet. Upload a supplier receipt to start.</p>`;
    $$("#partList [data-part]").forEach((el) => (el.onclick = () => editPart(el.dataset.part)));
  }

  async function editPart(id) {
    const p = state.parts.find((x) => x.id === id);
    if (!p) return;
    const price = prompt(`${p.name}\nCost ${rm(p.unitCost)}. Selling price (RM):`, p.sellingPrice);
    if (price === null) return;
    const left = prompt(`How many left in stock?`, p.qtyLeft);
    if (left === null) return;
    try {
      const upd = await api(`/parts/${id}`, { method: "PATCH", body: { sellingPrice: Number(price), qtyLeft: Number(left) } });
      Object.assign(p, upd);
      drawParts();
      toast("Part updated");
    } catch (err) {
      toast(err.message);
    }
  }

  async function onReceiptFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const box = $("#buyForm");
    box.innerHTML = `<p class="notice"><span class="spin"></span>Reading the receipt… (about 10–20 seconds)</p>`;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { suggestion } = await api("/purchases/extract", { method: "POST", form: fd });
      purchaseForm(suggestion, file, true);
    } catch (err) {
      box.innerHTML = `<p class="notice bad">${esc(err.message)}</p>`;
      purchaseForm({ supplier: "", date: "", receiptNo: "", total: null, items: [{ name: "", qty: 1, unitCost: null }] }, file);
      box.insertAdjacentHTML("afterbegin", `<p class="notice bad">${esc(err.message)}</p>`);
    }
  }

  function itemRow(it, ai) {
    const s = state.settings;
    const markup = it.markupPercent ?? s.markupPercent;
    const sell = it.sellingPrice ?? (it.unitCost != null ? sellPrice(it.unitCost, markup, s.roundTo) : "");
    const c = (v) => (ai && v != null && v !== "" ? "ai" : "");
    return `<div class="item">
      <div class="row"><input class="${c(it.name)}" name="name" placeholder="Part name" value="${esc(it.name)}"><button type="button" class="x" title="Remove">✕</button></div>
      <div class="item-grid">
        <div><label>Qty</label><input class="${c(it.qty)}" name="qty" type="number" inputmode="decimal" step="any" min="0" value="${esc(it.qty ?? 1)}"></div>
        <div><label>Cost each</label><input class="${c(it.unitCost)}" name="unitCost" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(it.unitCost ?? "")}"></div>
        <div><label>Markup %</label><input name="markupPercent" type="number" inputmode="decimal" step="any" min="0" value="${esc(markup)}"></div>
        <div><label>Sell each</label><input name="sellingPrice" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(sell)}"></div>
      </div>
      <div class="grid2"><input class="${c(it.partNo)}" name="partNo" placeholder="Part no (optional)" value="${esc(it.partNo || "")}"><input class="${c(it.brand)}" name="brand" placeholder="Brand (optional)" value="${esc(it.brand || "")}"></div>
    </div>`;
  }

  function purchaseForm(sug, file, ai) {
    const box = $("#buyForm");
    const c = (v) => (ai && v != null && v !== "" ? "ai" : "");
    box.innerHTML = `
      ${ai ? `<p class="notice">AI filled the <b>blue</b> boxes. Please check them against the receipt, then Save.</p>` : ""}
      <form id="purForm">
        <label>Supplier</label><input class="${c(sug.supplier)}" name="supplier" value="${esc(sug.supplier || "")}">
        <div class="grid2">
          <div><label>Date</label><input class="${c(sug.date)}" name="date" type="date" value="${esc(sug.date || "")}"></div>
          <div><label>Receipt no</label><input class="${c(sug.receiptNo)}" name="receiptNo" value="${esc(sug.receiptNo || "")}"></div>
        </div>
        <h3 style="margin-top:14px">Parts</h3>
        <div id="purItems">${sug.items.map((it) => itemRow(it, ai)).join("")}</div>
        <button type="button" class="btn alt small" id="addItem">+ Add part</button>
        <label>Total on receipt (RM)</label><input class="${c(sug.total)}" name="total" type="number" inputmode="decimal" step="0.01" value="${esc(sug.total ?? "")}">
        <p class="muted" id="purCheck"></p>
        <div class="btns"><button class="btn" type="submit">Save parts</button></div>
      </form>`;
    const form = $("#purForm");
    const items = $("#purItems");
    const check = () => {
      const sum = r2($$(".item", items).reduce((t, el) => t + (Number($("[name=qty]", el).value) || 0) * (Number($("[name=unitCost]", el).value) || 0), 0));
      const total = Number(form.total.value);
      $("#purCheck").textContent = form.total.value && Math.abs(sum - total) > 0.05 ? `⚠️ Parts add up to ${rm(sum)}, receipt total is ${rm(total)}. Check the prices.` : `Parts add up to ${rm(sum)}.`;
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
      if (e.target.classList.contains("x")) {
        e.target.closest(".item").remove();
        check();
      }
    });
    $("#addItem").onclick = () => items.insertAdjacentHTML("beforeend", itemRow({ name: "", qty: 1, unitCost: null }, false));
    check();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const data = {
        supplier: form.supplier.value,
        date: form.date.value,
        receiptNo: form.receiptNo.value,
        total: form.total.value,
        items: $$(".item", items).map((el) => ({
          name: $("[name=name]", el).value,
          qty: $("[name=qty]", el).value,
          unitCost: $("[name=unitCost]", el).value,
          markupPercent: $("[name=markupPercent]", el).value,
          sellingPrice: $("[name=sellingPrice]", el).value,
          partNo: $("[name=partNo]", el).value,
          brand: $("[name=brand]", el).value,
        })),
      };
      const fd = new FormData();
      if (file) fd.append("file", file);
      fd.append("data", JSON.stringify(data));
      const btn = e.submitter;
      busy(btn, true, "Saving…");
      try {
        const out = await api("/purchases", { method: "POST", form: fd });
        state.parts = (await api("/parts")).parts;
        toast(`Saved ${out.parts.length} part(s) — ${out.ref}`);
        if (!out.fileSaved) toast("Parts saved, but the receipt file did not upload.");
        renderBuy();
      } catch (err) {
        toast(err.message);
        busy(btn, false);
      }
    };
  }

  // ================= JOBS (estimate → invoice) =================

  const LS = {
    get(k) { try { return JSON.parse(localStorage.getItem("mldms." + k) || "null"); } catch { return null; } },
    set(k, v) { try { localStorage.setItem("mldms." + k, JSON.stringify(v)); } catch {} },
  };
  const todayKL = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const docNo = (j) => j.invoiceNo || j.estimateNo;

  function statusPill(st) {
    return `<span class="pill ${esc(String(st).split(" ")[0])}">${esc(st)}</span>`;
  }

  function renderJobs() {
    view.innerHTML = `
      <h2>Jobs</h2>
      <div class="btns" style="margin-bottom:12px"><button class="btn" id="newJob">+ New estimate</button></div>
      <div class="card"><div class="list" id="jobList"></div></div>`;
    $("#newJob").onclick = () => jobForm("new", null);
    $("#jobList").innerHTML = state.jobs.length
      ? state.jobs.map((j) => `<div class="li tap" data-j="${j.id}"><div><b>${esc(j.customerName)}</b><span class="muted">${esc(docNo(j))} · ${esc([j.car, j.plate].filter(Boolean).join(" "))}</span></div>
          <div class="r"><b>${rm(j.total)}</b><span class="pill">${j.invoiceNo ? "Invoice" : "Estimate"}</span> ${statusPill(j.status)}</div></div>`).join("")
      : `<p class="muted">No jobs yet.</p>`;
    $$("#jobList [data-j]").forEach((el) => (el.onclick = () => jobDetail(el.dataset.j)));
  }

  const LINE_LABEL = { part: "Part", labour: "Labour", sundry: "Sundry", sublet: "Sublet" };

  function lineHtml(l) {
    const t = l.type;
    const amountField = t === "part"
      ? `<div class="grid2"><div><label>Qty</label><input name="qty" type="number" inputmode="decimal" step="any" min="0" value="${esc(l.qty ?? 1)}"></div>
         <div><label>Unit price (RM)</label><input name="unitPrice" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(l.unitPrice ?? "")}"></div></div>`
      : `<label>Amount (RM)</label><input name="amount" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(l.amount ?? "")}">`;
    return `<div class="item" data-type="${t}" data-part="${esc(l.partId || "")}" data-cat="${esc(l.category || "")}" data-tax="${l.taxable ? 1 : 0}">
      <div class="row"><span class="pill" style="flex:none">${LINE_LABEL[t]}</span>
        ${t === "labour" ? `<input name="opCode" placeholder="Op code" value="${esc(l.opCode || "")}" style="max-width:120px">` : ""}
        ${t === "part" ? `<input name="partNo" placeholder="Part no" value="${esc(l.partNo || "")}" style="max-width:140px">` : ""}
        <button type="button" class="x" title="Remove">✕</button></div>
      <input name="description" placeholder="${t === "labour" ? "e.g. Perform Service B" : "Description"}" value="${esc(l.description || "")}" style="margin-top:6px">
      ${amountField}
    </div>`;
  }

  function groupHtml(g, i) {
    return `<div class="card group" style="background:var(--card2)">
      <div class="row"><b style="flex:none">C${i + 1}</b><input name="request" placeholder="Customer request, e.g. TO PERFORM SERVICE B" value="${esc(g.request || "")}" style="text-transform:uppercase"><button type="button" class="x gx" title="Remove job">✕</button></div>
      <div class="lines">${(g.lines || []).map(lineHtml).join("")}</div>
      <label>Add a part from stock</label>
      <input class="pick" list="partOptions" placeholder="Type part name…" autocomplete="off">
      <div class="grid2" style="margin-top:8px">
        <button type="button" class="btn alt small" data-add="part">+ Part</button>
        <button type="button" class="btn alt small" data-add="labour">+ Labour</button>
        <button type="button" class="btn alt small" data-add="sundry">+ Sundry</button>
        <button type="button" class="btn alt small" data-add="sublet">+ Sublet</button>
      </div>
    </div>`;
  }

  // mode "new": new estimate (or straight invoice). mode "invoice": estimate → invoice.
  function jobForm(mode, job) {
    const d = job?.details || {};
    const adv = d.advisor || LS.get("advisor") || {};
    const groups = job?.groups?.length ? job.groups : [{ request: "", lines: [] }];
    const parts = state.parts;
    const v = (x) => esc(x ?? "");
    view.innerHTML = `
      <h2>${mode === "invoice" ? `Make invoice — ${esc(job.estimateNo)}` : "New estimate"}</h2>
      <form id="jForm" autocomplete="off">
        <div class="card"><h3>Customer</h3>
          <label>Name</label><input name="cName" list="custList" required value="${v(job?.customerName)}">
          <datalist id="custList">${state.customers.map((c) => `<option value="${esc(c.name)}">${esc([c.car, c.plate].filter(Boolean).join(" "))}</option>`).join("")}</datalist>
          <label>Phone (WhatsApp)</label><input name="cPhone" type="tel" inputmode="tel" placeholder="012-345 6789" value="${v(job?.phone)}">
          <label>Address (up to 2 lines)</label><textarea name="cAddress" rows="2">${v((d.customerAddress || []).join("\n"))}</textarea>
        </div>
        <div class="card"><h3>Vehicle</h3>
          <label>Make &amp; model</label><input name="makeModel" placeholder="e.g. Mercedes-AMG A45 S 4MATIC+" value="${v(job?.car)}">
          <div class="grid2">
            <div><label>Reg no</label><input name="regNo" style="text-transform:uppercase" value="${v(job?.plate)}"></div>
            <div><label>Mileage (Km) *</label><input name="mileageKm" type="number" inputmode="numeric" min="1" required value="${v(job?.mileageKm)}"></div>
          </div>
          <div class="grid2">
            <div><label>Chassis no</label><input name="chassisNo" style="text-transform:uppercase" value="${v(d.vehicle?.chassisNo)}"></div>
            <div><label>Engine no</label><input name="engineNo" style="text-transform:uppercase" value="${v(d.vehicle?.engineNo)}"></div>
          </div>
          <label>Reg date</label><input name="regDate" type="date" value="${v(d.vehicle?.regDate)}">
        </div>
        <datalist id="partOptions">${parts.map((p) => `<option value="${esc(p.name)}${p.partNo ? " · " + esc(p.partNo) : ""}">${rm(p.sellingPrice)} · ${p.qtyLeft} left</option>`).join("")}</datalist>
        <h3>Work</h3>
        <div id="groups">${groups.map(groupHtml).join("")}</div>
        <button type="button" class="btn alt small" id="addGroup">+ Another customer request (C${groups.length + 1})</button>
        <div class="card" style="margin-top:12px">
          <div class="row muted"><span>Parts</span><span class="r" id="tParts">RM 0.00</span></div>
          <div class="row muted"><span>Labour &amp; sundries</span><span class="r" id="tLabour">RM 0.00</span></div>
          <div class="total"><span>Grand total</span><span id="tGrand">RM 0.00</span></div>
        </div>
        <div class="card">
          ${mode === "invoice"
            ? `<div class="grid2"><div><label>Repair date</label><input name="repairDate" type="date" required value="${todayKL()}"></div><div><label>Payment due</label><input name="dueDate" type="date" value="${todayKL()}"></div></div>`
            : `<label>Planned repair date (optional)</label><input name="plannedDate" type="date" value="${v(d.plannedDate)}">`}
          <details style="margin-top:10px"><summary class="muted">More details (invoice to, served by, reference numbers)</summary>
            <label>Invoice to</label><input name="itName" value="${v(d.invoiceTo?.name || "Service Retail Cash Sales")}">
            <label>Invoice to address</label><textarea name="itAddress" rows="2">${v((d.invoiceTo?.address || []).join("\n"))}</textarea>
            <div class="grid2"><div><label>Served by</label><input name="advName" value="${v(adv.name)}"></div><div><label>Operator ID</label><input name="advId" value="${v(adv.operatorId)}"></div></div>
            <div class="grid2"><div><label>Account no</label><input name="accountNo" value="${v(d.accountNo)}"></div><div><label>Order no</label><input name="orderNo" value="${v(d.orderNo)}"></div></div>
            <div class="grid2"><div><label>Reference no</label><input name="referenceNo" value="${v(d.referenceNo)}"></div><div><label>WIP no</label><input name="wipNo" value="${v(d.wipNo)}"></div></div>
            <label>Job no</label><input name="jobNo" value="${v(d.jobNo)}">
            <div class="grid2"><div><label>Surcharge (RM)</label><input name="surcharge" type="number" step="0.01" min="0" value="${v(d.surcharge || "")}"></div><div><label>Menus (RM)</label><input name="menus" type="number" step="0.01" min="0" value="${v(d.menus || "")}"></div></div>
          </details>
        </div>
        <div class="btns">
          ${mode === "invoice"
            ? `<button class="btn" type="submit" data-as="invoice">Make invoice</button>`
            : `<button class="btn" type="submit" data-as="estimate">Save estimate</button><button class="btn alt" type="submit" data-as="invoice">Save as invoice (work already done)</button>`}
          <button type="button" class="btn alt" id="jBack">Back</button>
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
    const renumber = () => {
      $$(".group", box).forEach((g, i) => ($("b", g).textContent = `C${i + 1}`));
      $("#addGroup").textContent = `+ Another customer request (C${$$(".group", box).length + 1})`;
    };

    form.cName.addEventListener("change", () => {
      const c = state.customers.find((x) => x.name.toLowerCase() === form.cName.value.trim().toLowerCase());
      if (!c) return;
      form.cPhone.value = c.phone;
      form.cAddress.value = c.address;
      if (!form.makeModel.value) form.makeModel.value = c.car;
      if (!form.regNo.value) form.regNo.value = c.plate;
    });
    box.addEventListener("click", (e) => {
      const add = e.target.closest("[data-add]");
      if (add) {
        const lines = $(".lines", add.closest(".group"));
        lines.insertAdjacentHTML("beforeend", lineHtml({ type: add.dataset.add, qty: 1, description: add.dataset.add === "sundry" ? "" : "" }));
        $(".item:last-child [name=description]", lines).focus();
      } else if (e.target.classList.contains("gx")) {
        if ($$(".group", box).length > 1) e.target.closest(".group").remove();
        renumber();
      } else if (e.target.classList.contains("x")) {
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
    $("#jBack").onclick = () => (job ? jobDetail(job.id) : renderJobs());
    totals();

    form.onsubmit = async (e) => {
      e.preventDefault();
      const as = e.submitter?.dataset.as || "estimate";
      const name = form.cName.value.trim();
      const cust = state.customers.find((x) => x.name.toLowerCase() === name.toLowerCase());
      const advisor = { name: form.advName.value.trim(), operatorId: form.advId.value.trim() };
      LS.set("advisor", advisor);
      const body = {
        asInvoice: as === "invoice" && mode === "new",
        customerId: job?.customerId || (cust ? cust.id : ""),
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
        const [js, cs, ps] = await Promise.all([api("/jobs"), api("/customers"), api("/parts")]);
        state.jobs = js.jobs;
        state.customers = cs.customers;
        state.parts = ps.parts;
        toast(`${docNo(out.job)} saved`);
        if (out.lowStock?.length) toast(`Stock went below 0 for: ${out.lowStock.join(", ")}`);
        jobDetail(out.job.id);
      } catch (err) {
        toast(err.message);
        busy(btn, false);
      }
    };
  }

  function docButtons(kind, no, token, phone, msg) {
    const link = docLink(token);
    return `<div class="card"><div class="row"><b>${kind} ${esc(no)}</b></div>
      <div class="btns">
        <a class="btn wa" data-sent="1" href="${esc(waLink(phone, msg(link)))}" target="_blank" rel="noopener">Send ${kind.toLowerCase()} by WhatsApp</a>
        <a class="btn alt" href="${esc(link)}" target="_blank" rel="noopener">Open / save as PDF</a>
      </div></div>`;
  }

  function jobDetail(id) {
    const j = state.jobs.find((x) => x.id === id);
    if (!j) return renderJobs();
    const brand = "The Merc Lab";
    const pays = state.payments.filter((p) => p.jobId === j.id);
    const plate = j.plate ? ` (${j.plate})` : "";
    view.innerHTML = `
      <h2>${esc(j.customerName)} ${statusPill(j.status)}</h2>
      <div class="card">
        <div class="muted">${esc([j.car, j.plate, j.mileageKm ? Number(j.mileageKm).toLocaleString("en-MY") + " km" : ""].filter(Boolean).join(" · "))}</div>
        ${j.groups.map((g) => `<div style="margin-top:8px"><b>${esc(g.code)} ${esc(g.request)}</b><div class="list">${g.lines.map((l) => `<div class="li"><div>${esc(l.description)}${l.type === "part" ? `<span class="muted"> ${l.qty} × ${rm(l.unitPrice)}</span>` : ""}</div><div class="r">${rm(l.amount)}</div></div>`).join("")}</div></div>`).join("")}
        <div class="total"><span>Grand total</span><span>${rm(j.total)}</span></div>
        ${j.paid ? `<div class="row muted"><span>Paid ${rm(j.paid)}</span><span style="text-align:right">Balance <b>${rm(j.balance)}</b></span></div>` : ""}
      </div>
      ${j.invoiceNo ? docButtons("Invoice", j.invoiceNo, j.invoiceToken, j.phone, (link) => `Hi ${j.customerName}, your car${plate} is ready. Here is your invoice ${j.invoiceNo} from ${brand}.\nAmount due: ${rm(j.balance)}\n${link}`) : ""}
      ${j.estimateNo && j.token ? docButtons("Estimate", j.estimateNo, j.token, j.phone, (link) => `Hi ${j.customerName}, here is your estimate ${j.estimateNo}${plate} from ${brand}.\nTotal: ${rm(j.total)}\n${link}`) : ""}
      <div class="btns">
        ${!j.invoiceNo && j.status !== "Cancelled" ? `<button class="btn" id="jInvoice">Work done → make invoice</button>` : ""}
        ${j.balance > 0 && j.status !== "Cancelled" ? `<button class="btn alt" id="jPay">Record payment</button>` : ""}
        ${!j.paid && !j.invoiceNo && j.status !== "Cancelled" ? `<button class="btn danger" id="jCancel">Cancel estimate</button>` : ""}
        <button class="btn alt" id="jBack">Back to list</button>
      </div>
      ${pays.length ? `<div class="card" style="margin-top:12px"><h3>Receipts</h3><div class="list">${pays.map((p) => `<div class="li tap" data-p="${p.id}"><div><b>${esc(p.receiptNo)}</b><span class="muted">${dmy(p.paidOn)} · ${esc(p.method)}</span></div><div class="r">${rm(p.amount)}</div></div>`).join("")}</div></div>` : ""}`;
    $$("[data-sent]").forEach((a) => a.addEventListener("click", async () => {
      if (j.status !== "Draft") return;
      try { Object.assign(j, await api(`/jobs/${j.id}/status`, { method: "POST", body: { status: "Sent" } })); } catch {}
    }));
    $("#jInvoice")?.addEventListener("click", () => jobForm("invoice", j));
    $("#jPay")?.addEventListener("click", () => { setTab("money"); paymentForm({ amount: j.balance, method: "Bank transfer" }, null, [{ id: j.id, docNo: docNo(j), customerName: j.customerName, plate: j.plate, balance: j.balance, why: [] }]); });
    $("#jCancel")?.addEventListener("click", async () => {
      if (!confirm(`Cancel ${j.estimateNo}?`)) return;
      try { Object.assign(j, await api(`/jobs/${j.id}/status`, { method: "POST", body: { status: "Cancelled" } })); toast("Cancelled"); jobDetail(j.id); } catch (err) { toast(err.message); }
    });
    $$("[data-p]").forEach((el) => (el.onclick = () => receiptDone(state.payments.find((p) => p.id === el.dataset.p))));
    $("#jBack").onclick = renderJobs;
  }

  // ================= MONEY (payments & receipts) =================

  function renderMoney() {
    view.innerHTML = `
      <h2>Money in</h2>
      <div class="card">
        <label class="upload">📷 Upload payment slip
          <small>Bank transfer / DuitNow screenshot or PDF. AI reads it and finds the estimate or invoice.</small>
          <input type="file" id="payFile" accept="image/*,application/pdf">
        </label>
        <div class="btns"><button class="btn alt" id="payCash">Cash / enter by hand</button></div>
        <div id="payForm"></div>
      </div>
      <div class="card"><h3>Receipts</h3><div class="list" id="payList"></div></div>`;
    $("#payFile").onchange = onPaymentFile;
    $("#payCash").onclick = () => paymentForm({ method: "Cash" }, null, null);
    $("#payList").innerHTML = state.payments.length
      ? state.payments.map((p) => `<div class="li tap" data-p="${p.id}"><div><b>${esc(p.customerName)}</b><span class="muted">${esc(p.receiptNo)} · ${dmy(p.paidOn)} · ${esc(p.method)}</span></div><div class="r"><b>${rm(p.amount)}</b><span class="muted">${esc(p.docNo)}</span></div></div>`).join("")
      : `<p class="muted">No payments yet.</p>`;
    $$("#payList [data-p]").forEach((el) => (el.onclick = () => receiptDone(state.payments.find((p) => p.id === el.dataset.p))));
  }

  async function onPaymentFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const box = $("#payForm");
    box.innerHTML = `<p class="notice"><span class="spin"></span>Reading the payment slip…</p>`;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { suggestion, matches } = await api("/payments/extract", { method: "POST", form: fd });
      paymentForm(suggestion, file, matches, true);
    } catch (err) {
      paymentForm({ method: "Bank transfer" }, file, null);
      box.insertAdjacentHTML("afterbegin", `<p class="notice bad">${esc(err.message)}</p>`);
    }
  }

  function openJobs() {
    return state.jobs.filter((j) => ["Draft", "Sent", "Part paid"].includes(j.status) && j.balance > 0)
      .map((j) => ({ id: j.id, docNo: docNo(j), customerName: j.customerName, plate: j.plate, balance: j.balance, why: [] }));
  }

  function paymentForm(sug, file, matches, ai) {
    const box = $("#payForm");
    if (!box) return;
    const list = matches && matches.length ? matches : openJobs();
    const best = list[0] && (list[0].score === undefined || list[0].score >= 3) ? list[0].id : "";
    const c = (v) => (ai && v != null && v !== "" ? "ai" : "");
    const methods = ["Bank transfer", "DuitNow", "Cash", "Card", "Cheque", "E-wallet", "Other"];
    box.innerHTML = `
      ${ai ? `<p class="notice">AI filled the <b>blue</b> boxes. Check them, and check the invoice / estimate is right.</p>` : ""}
      <form id="pForm">
        <label>For invoice / estimate</label>
        <select name="jobId" required><option value="">— choose —</option>${list.map((m) => `<option value="${m.id}" ${m.id === best ? "selected" : ""}>${esc(m.docNo)} · ${esc(m.customerName)}${m.plate ? " · " + esc(m.plate) : ""} · balance ${rm(m.balance)}</option>`).join("")}</select>
        ${best && matches && matches[0]?.why?.length ? `<p class="muted">Matched by: ${esc(matches[0].why.join(", "))}</p>` : ai ? `<p class="notice warn">Could not match this payment for sure. Please choose the invoice or estimate.</p>` : ""}
        <div class="grid2">
          <div><label>Amount (RM)</label><input class="${c(sug.amount)}" name="amount" type="number" inputmode="decimal" step="0.01" min="0" required value="${esc(sug.amount ?? "")}"></div>
          <div><label>Date</label><input class="${c(sug.date)}" name="paidOn" type="date" value="${esc(sug.date || todayKL())}"></div>
        </div>
        <label>Method</label><select name="method">${methods.map((m) => `<option ${m === (sug.method || "Bank transfer") ? "selected" : ""}>${m}</option>`).join("")}</select>
        <div class="grid2">
          <div><label>Reference</label><input class="${c(sug.reference)}" name="reference" value="${esc(sug.reference || "")}"></div>
          <div><label>Paid by</label><input class="${c(sug.payerName)}" name="payerName" value="${esc(sug.payerName || "")}"></div>
        </div>
        <div class="btns"><button class="btn" type="submit">Record payment &amp; make receipt</button></div>
      </form>`;
    const form = $("#pForm");
    form.addEventListener("input", (e) => e.target.classList.remove("ai"));
    form.onsubmit = async (e) => {
      e.preventDefault();
      const data = { jobId: form.jobId.value, amount: form.amount.value, paidOn: form.paidOn.value, method: form.method.value, reference: form.reference.value, payerName: form.payerName.value };
      const fd = new FormData();
      if (file) fd.append("file", file);
      fd.append("data", JSON.stringify(data));
      const btn = e.submitter;
      busy(btn, true, "Recording…");
      try {
        const out = await api("/payments", { method: "POST", form: fd });
        const [pays, js] = await Promise.all([api("/payments"), api("/jobs")]);
        state.payments = pays.payments;
        state.jobs = js.jobs;
        if (!out.fileSaved) toast("Payment saved, but the slip file did not upload.");
        receiptDone(out.payment, out.job);
      } catch (err) {
        toast(err.message);
        busy(btn, false);
      }
    };
  }

  function receiptDone(p, j) {
    if (!p) return renderMoney();
    j = j || state.jobs.find((x) => x.id === p.jobId) || {};
    const link = docLink(p.token);
    const msg = `Hi ${p.customerName}, thank you. We received ${rm(p.amount)} for ${p.docNo}.${j.balance > 0 ? ` Balance: ${rm(j.balance)}.` : " Fully paid."}\nOfficial receipt ${p.receiptNo}: ${link}`;
    view.innerHTML = `
      <h2>Receipt ${esc(p.receiptNo)}</h2>
      <div class="card">
        <div class="total"><span>${esc(p.customerName)}</span><span>${rm(p.amount)}</span></div>
        <p class="muted">${dmy(p.paidOn)} · ${esc(p.method)}${p.reference ? " · Ref " + esc(p.reference) : ""}<br>For ${esc(p.docNo)}${j.balance !== undefined ? ` · ${j.balance > 0 ? "balance " + rm(j.balance) : "fully paid ✅"}` : ""}</p>
      </div>
      <div class="btns">
        <a class="btn wa" href="${esc(waLink(j.phone, msg))}" target="_blank" rel="noopener">Send receipt by WhatsApp</a>
        <a class="btn alt" href="${esc(link)}" target="_blank" rel="noopener">Open / save as PDF</a>
        <button class="btn alt" id="rBack">Back</button>
      </div>`;
    $("#rBack").onclick = renderMoney;
  }

  // ================= SETTINGS =================

  function renderSettings() {
    const s = state.settings;
    const f = (k, label, type = "text", extra = "") => `<label>${label}</label><input name="${k}" type="${type}" ${extra} value="${esc(s[k] ?? "")}">`;
    view.innerHTML = `
      <h2>Settings</h2>
      <form id="sForm">
        <div class="card"><h3>Parts pricing</h3>
          ${f("markupPercent", "Markup on parts (%)", "number", 'inputmode="decimal" step="any" min="0"')}
          <p class="muted" id="mkEx"></p>
          <label>Round selling price up to</label>
          <select name="roundTo">${[[0, "No rounding"], [0.1, "Nearest 10 sen"], [0.5, "Nearest 50 sen"], [1, "Nearest RM1"], [5, "Nearest RM5"], [10, "Nearest RM10"]].map(([val, l]) => `<option value="${val}" ${Number(s.roundTo) === val ? "selected" : ""}>${l}</option>`).join("")}</select>
        </div>
        <div class="card"><h3>On estimates, invoices &amp; receipts</h3>
          ${f("legalName", "Registered name (exactly as on SSM certificate)")}
          ${f("registrationNo", "SSM registration no")}
          ${f("hotline", "Hotline", "tel")}
          <label>Workshop address</label><textarea name="address" rows="2">${esc(s.address || "")}</textarea>
          <div class="grid2"><div>${f("tel", "Tel", "tel")}</div><div>${f("email", "Email", "email")}</div></div>
          ${f("whatsapp", "WhatsApp for payment proof", "tel")}
          ${f("bankName", "Bank")}${f("bankAccountName", "Account name")}${f("bankAccountNo", "Account no", "text", 'inputmode="numeric"')}
          <div class="grid2"><div>${f("partsWarrantyMonths", "Parts warranty (months)", "number", 'inputmode="numeric" min="0"')}</div><div>${f("estimateValidityDays", "Estimate valid (days)", "number", 'inputmode="numeric" min="1"')}</div></div>
          <p class="muted">Empty boxes print as [PLACEHOLDER] on documents, so you can see what is missing.</p>
        </div>
        <div class="btns"><button class="btn" type="submit">Save settings</button></div>
      </form>
      <div class="card" style="margin-top:12px"><h3>DuitNow QR</h3>
        ${s.duitNowQr ? `<img src="${esc(s.duitNowQr)}" alt="DuitNow QR" style="width:120px;height:120px;object-fit:contain;background:#fff;border-radius:8px">` : `<p class="muted">Not uploaded yet. A dashed box shows on documents until you add it.</p>`}
        <label class="upload" style="margin-top:8px">Upload DuitNow QR picture<input type="file" id="qrFile" accept="image/*"></label>
      </div>
      <div class="btns"><button type="button" class="btn alt" id="logout">Log out</button></div>`;
    const form = $("#sForm");
    const ex = () => ($("#mkEx").textContent = `Example: part cost RM100 → sell ${rm(sellPrice(100, form.markupPercent.value, form.roundTo.value))}`);
    form.addEventListener("input", ex);
    ex();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(form).entries());
      const btn = e.submitter;
      busy(btn, true, "Saving…");
      try {
        state.settings = await api("/settings", { method: "PUT", body });
        toast("Settings saved");
      } catch (err) {
        toast(err.message);
      } finally {
        busy(btn, false);
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
        renderSettings();
      } catch (err) {
        toast(err.message);
      }
    };
    $("#logout").onclick = async () => {
      await api("/logout", { method: "POST" }).catch(() => {});
      showLogin();
    };
  }

  async function start() {
    const me = await fetch("/api/me", { credentials: "same-origin" }).then((r) => r.json()).catch(() => ({}));
    if (!me.loggedIn) return showLogin();
    view.innerHTML = `<p class="muted"><span class="spin"></span>Loading…</p>`;
    try {
      await loadAll();
    } catch (err) {
      view.innerHTML = `<p class="notice bad">${esc(err.message)}</p>`;
      return;
    }
    $("#tabs").hidden = false;
    setTab(state.tab);
  }

  start();
})();
