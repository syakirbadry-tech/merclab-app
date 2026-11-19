// Document money rules (handover section 5). All amounts are integer SEN
// internally; never floats. Display with thousands separators, 2 decimals.

const LINE_TYPES = ["part", "labour", "sundry", "sublet"];

// "96.30" / 96.3 → 9630. Rejects anything that is not a plain number.
function toSen(v) {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const third = Number((frac + "000")[2]);
  let sen = Number(whole) * 100 + Number((frac + "00").slice(0, 2)) + (third >= 5 ? 1 : 0);
  return s.startsWith("-") ? -sen : sen;
}

function fmt(sen) {
  const neg = sen < 0;
  const a = Math.abs(Math.round(sen));
  const ringgit = Math.floor(a / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + ringgit + "." + String(a % 100).padStart(2, "0");
}

// Malaysian rounding mechanism: nearest 5 sen.
const roundTo5Sen = (sen) => Math.round(sen / 5) * 5;

function cleanText(v, max) {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

// Validate and normalise job groups from the form / JSON input.
// Throws { status: 400 } with a plain message on bad input.
function cleanGroups(groups) {
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  if (!Array.isArray(groups)) throw bad("Add at least one job.");
  const out = [];
  groups.slice(0, 20).forEach((g, gi) => {
    const code = cleanText(g?.code, 6) || `C${gi + 1}`;
    const request = cleanText(g?.request, 120).toUpperCase();
    const lines = [];
    (Array.isArray(g?.lines) ? g.lines : []).slice(0, 80).forEach((l) => {
      const type = LINE_TYPES.includes(l?.type) ? l.type : null;
      const description = cleanText(l?.description, 120);
      if (!type || !description) return; // empty rows from the form are ignored
      const line = { type, description, taxable: l.taxable === true };
      if (type === "part") {
        const qty = Number(l.qty);
        const unitSen = toSen(l.unitPrice);
        if (!(qty > 0) || qty > 9999) throw bad(`Quantity for "${description}" must be more than 0.`);
        if (unitSen === null || unitSen < 0) throw bad(`Price for "${description}" is missing.`);
        line.qty = Math.round(qty * 100) / 100;
        line.unitPrice = unitSen / 100;
        line.amount = Math.round(line.qty * unitSen) / 100;
        line.partNo = cleanText(l.partNo, 40);
        if (/^rec[A-Za-z0-9]{14}$/.test(l.partId || "")) line.partId = l.partId;
      } else {
        const sen = toSen(l.amount);
        if (sen === null || sen < 0) throw bad(`Amount for "${description}" is missing.`);
        line.amount = sen / 100;
        if (type === "labour") line.opCode = cleanText(l.opCode, 20);
        else line.category = cleanText(l.category, 20).toUpperCase() || (type === "sundry" ? "SUNDRY" : "SUBLET");
      }
      lines.push(line);
    });
    if (request || lines.length) out.push({ code, request, lines });
  });
  if (!out.some((g) => g.lines.length)) throw bad("Add at least one part, labour or sundry line.");
  return out;
}

const lineSen = (l) => (l.type === "part" ? Math.round(l.qty * toSen(l.unitPrice)) : toSen(l.amount));

// sst: { on: boolean, rate: 0.08 }, round5: boolean
function computeTotals(groups, { surcharge = 0, menus = 0, sst = { on: false, rate: 0.08 }, round5 = false } = {}) {
  let parts = 0, labour = 0, sublet = 0, taxable = 0;
  for (const g of groups) {
    for (const l of g.lines) {
      const a = lineSen(l);
      if (l.type === "part") parts += a;
      else if (l.type === "sublet") sublet += a;
      else labour += a; // labour + sundry
      if (l.taxable) taxable += a;
    }
  }
  const surchargeSen = toSen(surcharge) || 0;
  const menusSen = toSen(menus) || 0;
  const subtotal = parts + labour + sublet + surchargeSen + menusSen;
  const tax = sst.on ? Math.round(taxable * sst.rate) : 0;
  const inclTax = subtotal + tax;
  const grand = round5 ? roundTo5Sen(inclTax) : inclTax;
  return { parts, labour, sublet, surcharge: surchargeSen, menus: menusSen, subtotal, taxable, tax, inclTax, rounding: grand - inclTax, grand };
}

module.exports = { LINE_TYPES, toSen, fmt, roundTo5Sen, cleanGroups, computeTotals, lineSen };
