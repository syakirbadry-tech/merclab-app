// Money rules for the DMS. Pure functions only, so they are easy to test.
// All amounts are Malaysian ringgit, kept to 2 decimal places.

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Selling price = cost + markup %. Then rounded UP to the "round to" step
// (0 = no rounding, 0.1, 1, 5...). Example: cost 100, markup 30 → 130.
function sellingPrice(unitCost, markupPercent, roundTo = 0) {
  const cost = Number(unitCost);
  const markup = Number(markupPercent);
  if (!Number.isFinite(cost) || cost < 0) return null;
  const raw = cost * (1 + (Number.isFinite(markup) ? markup : 0) / 100);
  const step = Number(roundTo);
  if (Number.isFinite(step) && step > 0) {
    // Small tolerance so 130.0000001 does not jump to 131.
    return round2(Math.ceil(round2(raw) / step - 1e-9) * step);
  }
  return round2(raw);
}

// Quotation lines: [{ type, partId?, description, qty, unitPrice }]
function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => {
      const qty = Number(it.qty);
      const unitPrice = Number(it.unitPrice);
      const description = String(it.description || "").trim().slice(0, 200);
      if (!description || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) return null;
      const type = ["part", "labour", "other"].includes(it.type) ? it.type : "other";
      const line = { type, description, qty: round2(qty), unitPrice: round2(unitPrice), amount: round2(qty * unitPrice) };
      if (type === "part" && /^rec[A-Za-z0-9]{14}$/.test(it.partId || "")) line.partId = it.partId;
      return line;
    })
    .filter(Boolean);
}

function quoteTotals(items, discount = 0) {
  const subtotal = round2(items.reduce((s, it) => s + it.amount, 0));
  let d = round2(Number(discount) || 0);
  if (d < 0) d = 0;
  if (d > subtotal) d = subtotal;
  return { subtotal, discount: d, total: round2(subtotal - d) };
}

// Status after money comes in.
function paymentState(total, paid) {
  const t = round2(total);
  const p = round2(paid);
  const balance = round2(t - p);
  const status = balance <= 0 ? "Paid" : p > 0 ? "Part paid" : null;
  return { paid: p, balance: balance < 0 ? 0 : balance, status };
}

// Running numbers like Q-2611-007 (prefix, 2-digit year, month, count in month).
function nextNumber(prefix, existing, isoDate) {
  const yymm = String(isoDate).slice(2, 4) + String(isoDate).slice(5, 7);
  const head = `${prefix}-${yymm}-`;
  let max = 0;
  for (const no of existing) {
    if (typeof no === "string" && no.startsWith(head)) {
      const n = parseInt(no.slice(head.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return head + String(max + 1).padStart(3, "0");
}

// Malaysian phone to WhatsApp format: 012-345 6789 → 60123456789.
function waPhone(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0")) d = "6" + d;
  else if (!d.startsWith("60") && d.length <= 10) d = "60" + d;
  return d.length >= 10 && d.length <= 13 ? d : "";
}

// Today's date in Kuala Lumpur as YYYY-MM-DD.
function todayKL(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

module.exports = { round2, sellingPrice, cleanItems, quoteTotals, paymentState, nextNumber, waPhone, todayKL, addDays };
