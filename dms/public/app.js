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

  const state = { tab: "buy", settings: null, parts: [], quotes: [], payments: [], customers: [] };

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
    const [s, p, q, pay, c] = await Promise.all([api("/settings"), api("/parts"), api("/quotes"), api("/payments"), api("/customers")]);
    state.settings = s;
    state.parts = p.parts;
    state.quotes = q.quotes;
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
    ({ buy: renderBuy, quote: renderQuotes, money: renderMoney, settings: renderSettings })[tab]();
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

  // ================= QUOTATIONS =================

  function statusPill(st) {
    return `<span class="pill ${esc(String(st).split(" ")[0])}">${esc(st)}</span>`;
  }

  function renderQuotes() {
    view.innerHTML = `
      <h2>Quotations</h2>
      <div class="btns" style="margin-bottom:12px"><button class="btn" id="newQuote">+ New quotation</button></div>
      <div class="card"><div class="list" id="quoteList"></div></div>`;
    $("#newQuote").onclick = () => quoteForm();
    $("#quoteList").innerHTML = state.quotes.length
      ? state.quotes.map((q) => `<div class="li tap" data-q="${q.id}"><div><b>${esc(q.customerName)}</b><span class="muted">${esc(q.quoteNo)} · ${esc([q.car, q.plate].filter(Boolean).join(" "))}</span></div>
          <div class="r"><b>${rm(q.total)}</b>${statusPill(q.status)}</div></div>`).join("")
      : `<p class="muted">No quotations yet.</p>`;
    $$("#quoteList [data-q]").forEach((el) => (el.onclick = () => quoteDetail(el.dataset.q)));
  }

  function quoteLine(l) {
    return `<div class="item" data-type="${esc(l.type)}" data-part="${esc(l.partId || "")}">
      <div class="row"><input name="description" placeholder="${l.type === "labour" ? "Labour / service" : "Item"}" value="${esc(l.description)}"><button type="button" class="x">✕</button></div>
      <div class="grid2"><div><label>Qty</label><input name="qty" type="number" inputmode="decimal" step="any" min="0" value="${esc(l.qty)}"></div>
      <div><label>Price each (RM)</label><input name="unitPrice" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(l.unitPrice ?? "")}"></div></div>
      ${l.stockNote ? `<p class="muted">${esc(l.stockNote)}</p>` : ""}
    </div>`;
  }

  function quoteForm() {
    const parts = state.parts;
    view.innerHTML = `
      <h2>New quotation</h2>
      <form id="qForm">
        <div class="card">
          <h3>Customer</h3>
          <label>Name</label><input name="customerName" list="custList" required autocomplete="off">
          <datalist id="custList">${state.customers.map((c) => `<option value="${esc(c.name)}">${esc([c.car, c.plate].filter(Boolean).join(" "))}</option>`).join("")}</datalist>
          <div class="grid2">
            <div><label>Phone (WhatsApp)</label><input name="phone" type="tel" inputmode="tel" placeholder="012-345 6789"></div>
            <div><label>Plate</label><input name="plate" style="text-transform:uppercase"></div>
          </div>
          <label>Car</label><input name="car" placeholder="e.g. Mercedes C200 W205">
        </div>
        <div class="card">
          <h3>Items</h3>
          <label>Add a part from stock</label>
          <input id="partPick" list="partOptions" placeholder="Type part name…" autocomplete="off">
          <datalist id="partOptions">${parts.map((p) => `<option value="${esc(p.name)}${p.partNo ? " · " + esc(p.partNo) : ""}">${rm(p.sellingPrice)} · ${p.qtyLeft} left</option>`).join("")}</datalist>
          <div id="qItems"></div>
          <div class="grid2" style="margin-top:8px"><button type="button" class="btn alt small" id="addLabour">+ Labour</button><button type="button" class="btn alt small" id="addOther">+ Other item</button></div>
          <label>Discount (RM)</label><input name="discount" type="number" inputmode="decimal" step="0.01" min="0" value="0">
          <div class="total"><span>Total</span><span id="qTotal">RM 0.00</span></div>
        </div>
        <div class="btns"><button class="btn" type="submit">Make quotation</button><button type="button" class="btn alt" id="qCancel">Back</button></div>
      </form>`;
    const form = $("#qForm");
    const items = $("#qItems");
    const total = () => {
      const sub = $$(".item", items).reduce((t, el) => t + (Number($("[name=qty]", el).value) || 0) * (Number($("[name=unitPrice]", el).value) || 0), 0);
      $("#qTotal").textContent = rm(Math.max(0, r2(sub - (Number(form.discount.value) || 0))));
    };
    form.customerName.addEventListener("change", () => {
      const c = state.customers.find((x) => x.name.toLowerCase() === form.customerName.value.trim().toLowerCase());
      if (c) {
        form.phone.value = c.phone;
        form.car.value = c.car;
        form.plate.value = c.plate;
      }
    });
    $("#partPick").addEventListener("change", (e) => {
      const v = e.target.value;
      const p = parts.find((x) => `${x.name}${x.partNo ? " · " + x.partNo : ""}` === v) || parts.find((x) => x.name === v);
      if (!p) return;
      items.insertAdjacentHTML("beforeend", quoteLine({ type: "part", partId: p.id, description: [p.brand, p.name].filter(Boolean).join(" "), qty: 1, unitPrice: p.sellingPrice, stockNote: p.qtyLeft <= 0 ? "⚠️ None left in stock" : `${p.qtyLeft} in stock` }));
      e.target.value = "";
      total();
    });
    $("#addLabour").onclick = () => { items.insertAdjacentHTML("beforeend", quoteLine({ type: "labour", description: "Labour", qty: 1, unitPrice: "" })); total(); };
    $("#addOther").onclick = () => { items.insertAdjacentHTML("beforeend", quoteLine({ type: "other", description: "", qty: 1, unitPrice: "" })); total(); };
    items.addEventListener("input", total);
    items.addEventListener("click", (e) => { if (e.target.classList.contains("x")) { e.target.closest(".item").remove(); total(); } });
    form.discount.oninput = total;
    $("#qCancel").onclick = renderQuotes;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const name = form.customerName.value.trim();
      const cust = state.customers.find((x) => x.name.toLowerCase() === name.toLowerCase());
      const body = {
        customerId: cust ? cust.id : "",
        customerName: name,
        phone: form.phone.value,
        car: form.car.value,
        plate: form.plate.value,
        discount: form.discount.value,
        items: $$(".item", items).map((el) => ({ type: el.dataset.type, partId: el.dataset.part, description: $("[name=description]", el).value, qty: $("[name=qty]", el).value, unitPrice: $("[name=unitPrice]", el).value })),
      };
      const btn = e.submitter;
      busy(btn, true, "Making…");
      try {
        const q = await api("/quotes", { method: "POST", body });
        const [qs, cs] = await Promise.all([api("/quotes"), api("/customers")]);
        state.quotes = qs.quotes;
        state.customers = cs.customers;
        toast(`${q.quoteNo} ready`);
        quoteDetail(q.id);
      } catch (err) {
        toast(err.message);
        busy(btn, false);
      }
    };
  }

  function quoteDetail(id) {
    const q = state.quotes.find((x) => x.id === id);
    if (!q) return renderQuotes();
    const link = docLink(q.token);
    const msg = `Hi ${q.customerName}, here is your quotation ${q.quoteNo}${q.plate ? ` for ${q.plate}` : ""} from ${state.settings.workshopName || "The Merc Lab"}.\nTotal: ${rm(q.total)}\n${link}`;
    const pays = state.payments.filter((p) => p.quoteId === q.id);
    view.innerHTML = `
      <h2>${esc(q.quoteNo)} ${statusPill(q.status)}</h2>
      <div class="card">
        <b>${esc(q.customerName)}</b><div class="muted">${esc([q.phone, q.car, q.plate].filter(Boolean).join(" · "))}</div>
        <div class="list" style="margin-top:8px">${q.items.map((i) => `<div class="li"><div>${esc(i.description)}<span class="muted"> ${i.qty} × ${rm(i.unitPrice)}</span></div><div class="r">${rm(i.amount)}</div></div>`).join("")}</div>
        ${q.discount ? `<div class="li"><span>Discount</span><span>- ${rm(q.discount)}</span></div>` : ""}
        <div class="total"><span>Total</span><span>${rm(q.total)}</span></div>
        ${q.paid ? `<div class="row muted"><span>Paid ${rm(q.paid)}</span><span style="text-align:right">Balance <b>${rm(q.balance)}</b></span></div>` : ""}
      </div>
      <div class="btns">
        ${q.status !== "Cancelled" ? `<a class="btn wa" id="qWa" href="${esc(waLink(q.phone, msg))}" target="_blank" rel="noopener">Send quotation by WhatsApp</a>` : ""}
        <a class="btn alt" href="${esc(link)}" target="_blank" rel="noopener">Open / save as PDF</a>
        <button class="btn alt" id="qCopy">Copy link</button>
        ${q.balance > 0 && q.status !== "Cancelled" ? `<button class="btn alt" id="qPay">Record payment for this</button>` : ""}
        ${!q.paid && q.status !== "Cancelled" ? `<button class="btn danger" id="qCancelQ">Cancel quotation</button>` : ""}
        <button class="btn alt" id="qBack">Back to list</button>
      </div>
      ${pays.length ? `<div class="card" style="margin-top:12px"><h3>Payments</h3><div class="list">${pays.map((p) => `<div class="li"><div><b>${esc(p.receiptNo)}</b><span class="muted">${dmy(p.paidOn)} · ${esc(p.method)}</span></div><div class="r">${rm(p.amount)}</div></div>`).join("")}</div></div>` : ""}`;
    if (!waPhone(q.phone) && $("#qWa")) $("#qWa").textContent = "Send by WhatsApp (choose contact)";
    $("#qWa")?.addEventListener("click", async () => {
      if (q.status === "Draft") {
        try {
          const upd = await api(`/quotes/${q.id}/status`, { method: "POST", body: { status: "Sent" } });
          Object.assign(q, upd);
        } catch {}
      }
    });
    $("#qCopy").onclick = async () => {
      try { await navigator.clipboard.writeText(link); toast("Link copied"); } catch { prompt("Copy this link:", link); }
    };
    $("#qPay")?.addEventListener("click", () => { setTab("money"); paymentForm({ amount: q.balance, method: "Bank transfer" }, null, [{ id: q.id, quoteNo: q.quoteNo, customerName: q.customerName, plate: q.plate, balance: q.balance, why: [] }]); });
    $("#qCancelQ")?.addEventListener("click", async () => {
      if (!confirm(`Cancel ${q.quoteNo}?`)) return;
      try {
        Object.assign(q, await api(`/quotes/${q.id}/status`, { method: "POST", body: { status: "Cancelled" } }));
        toast("Cancelled");
        quoteDetail(q.id);
      } catch (err) { toast(err.message); }
    });
    $("#qBack").onclick = renderQuotes;
  }

  // ================= MONEY (payments & receipts) =================

  function renderMoney() {
    view.innerHTML = `
      <h2>Money in</h2>
      <div class="card">
        <label class="upload">📷 Upload payment slip
          <small>Bank transfer / DuitNow screenshot or PDF. AI reads it and finds the quotation.</small>
          <input type="file" id="payFile" accept="image/*,application/pdf">
        </label>
        <div class="btns"><button class="btn alt" id="payCash">Cash / enter by hand</button></div>
        <div id="payForm"></div>
      </div>
      <div class="card"><h3>Receipts</h3><div class="list" id="payList"></div></div>`;
    $("#payFile").onchange = onPaymentFile;
    $("#payCash").onclick = () => paymentForm({ method: "Cash" }, null, null);
    $("#payList").innerHTML = state.payments.length
      ? state.payments.map((p) => `<div class="li tap" data-p="${p.id}"><div><b>${esc(p.customerName)}</b><span class="muted">${esc(p.receiptNo)} · ${dmy(p.paidOn)} · ${esc(p.method)}</span></div><div class="r"><b>${rm(p.amount)}</b><span class="muted">${esc(p.quoteNo)}</span></div></div>`).join("")
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

  function openQuotes() {
    return state.quotes.filter((q) => ["Draft", "Sent", "Part paid"].includes(q.status) && q.balance > 0)
      .map((q) => ({ id: q.id, quoteNo: q.quoteNo, customerName: q.customerName, plate: q.plate, balance: q.balance, why: [] }));
  }

  function paymentForm(sug, file, matches, ai) {
    const box = $("#payForm");
    if (!box) return;
    const list = matches && matches.length ? matches : openQuotes();
    const best = list[0] && (list[0].score === undefined || list[0].score >= 3) ? list[0].id : "";
    const c = (v) => (ai && v != null && v !== "" ? "ai" : "");
    const methods = ["Bank transfer", "DuitNow", "Cash", "Card", "Cheque", "E-wallet", "Other"];
    box.innerHTML = `
      ${ai ? `<p class="notice">AI filled the <b>blue</b> boxes. Check them, and check the quotation is right.</p>` : ""}
      <form id="pForm">
        <label>For quotation</label>
        <select name="quoteId" required><option value="">— choose —</option>${list.map((m) => `<option value="${m.id}" ${m.id === best ? "selected" : ""}>${esc(m.quoteNo)} · ${esc(m.customerName)}${m.plate ? " · " + esc(m.plate) : ""} · balance ${rm(m.balance)}</option>`).join("")}</select>
        ${best && matches && matches[0]?.why?.length ? `<p class="muted">Matched by: ${esc(matches[0].why.join(", "))}</p>` : ai ? `<p class="notice warn">Could not match this payment for sure. Please choose the quotation.</p>` : ""}
        <div class="grid2">
          <div><label>Amount (RM)</label><input class="${c(sug.amount)}" name="amount" type="number" inputmode="decimal" step="0.01" min="0" required value="${esc(sug.amount ?? "")}"></div>
          <div><label>Date</label><input class="${c(sug.date)}" name="paidOn" type="date" value="${esc(sug.date || new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10))}"></div>
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
      const data = { quoteId: form.quoteId.value, amount: form.amount.value, paidOn: form.paidOn.value, method: form.method.value, reference: form.reference.value, payerName: form.payerName.value };
      const fd = new FormData();
      if (file) fd.append("file", file);
      fd.append("data", JSON.stringify(data));
      const btn = e.submitter;
      busy(btn, true, "Recording…");
      try {
        const out = await api("/payments", { method: "POST", form: fd });
        const [pays, qs, ps] = await Promise.all([api("/payments"), api("/quotes"), api("/parts")]);
        state.payments = pays.payments;
        state.quotes = qs.quotes;
        state.parts = ps.parts;
        if (out.lowStock.length) toast(`Stock went below 0 for: ${out.lowStock.join(", ")}`);
        receiptDone(out.payment, out.quote);
      } catch (err) {
        toast(err.message);
        busy(btn, false);
      }
    };
  }

  function receiptDone(p, q) {
    if (!p) return renderMoney();
    q = q || state.quotes.find((x) => x.id === p.quoteId) || {};
    const link = docLink(p.token);
    const msg = `Hi ${p.customerName}, thank you. We received ${rm(p.amount)} for ${p.quoteNo}.${q.balance > 0 ? ` Balance: ${rm(q.balance)}.` : " Fully paid."}\nYour receipt ${p.receiptNo}: ${link}`;
    view.innerHTML = `
      <h2>Receipt ${esc(p.receiptNo)}</h2>
      <div class="card">
        <div class="total"><span>${esc(p.customerName)}</span><span>${rm(p.amount)}</span></div>
        <p class="muted">${dmy(p.paidOn)} · ${esc(p.method)}${p.reference ? " · Ref " + esc(p.reference) : ""}<br>For ${esc(p.quoteNo)}${q.balance !== undefined ? ` · ${q.balance > 0 ? "balance " + rm(q.balance) : "fully paid ✅"}` : ""}</p>
      </div>
      <div class="btns">
        <a class="btn wa" href="${esc(waLink(q.phone, msg))}" target="_blank" rel="noopener">Send receipt by WhatsApp</a>
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
        <div class="card"><h3>Pricing</h3>
          ${f("markupPercent", "Markup on parts (%)", "number", 'inputmode="decimal" step="any" min="0"')}
          <p class="muted" id="mkEx"></p>
          <label>Round selling price up to</label>
          <select name="roundTo">${[[0, "No rounding"], [0.1, "Nearest 10 sen"], [0.5, "Nearest 50 sen"], [1, "Nearest RM1"], [5, "Nearest RM5"], [10, "Nearest RM10"]].map(([v, l]) => `<option value="${v}" ${Number(s.roundTo) === v ? "selected" : ""}>${l}</option>`).join("")}</select>
          ${f("quoteValidDays", "Quotation valid for (days)", "number", 'inputmode="numeric" min="1"')}
        </div>
        <div class="card"><h3>On quotations &amp; receipts</h3>
          ${f("workshopName", "Workshop name")}
          <label>Address</label><textarea name="address" rows="3">${esc(s.address || "")}</textarea>
          ${f("phone", "Phone", "tel")}${f("email", "Email", "email")}${f("registrationNo", "Registration no (SSM)")}
          ${f("bankName", "Bank")}${f("bankAccountName", "Account name")}${f("bankAccountNo", "Account no", "text", 'inputmode="numeric"')}
          <label>Note on quotations</label><textarea name="quoteNotes" rows="3">${esc(s.quoteNotes || "")}</textarea>
          <label>Note on receipts</label><textarea name="receiptNotes" rows="2">${esc(s.receiptNotes || "")}</textarea>
        </div>
        <div class="btns"><button class="btn" type="submit">Save settings</button><button type="button" class="btn alt" id="logout">Log out</button></div>
      </form>`;
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
    $("#logout").onclick = async () => {
      await api("/logout", { method: "POST" }).catch(() => {});
      showLogin();
    };
  }

  // ---------- start ----------

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
