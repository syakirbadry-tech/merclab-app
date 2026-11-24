// Service quotation: what a car needs at its next service, worked out from
// its own invoices, with today's prices. Nothing is saved here: the result
// fills the New estimate form and the owner checks it and presses Save.
//
// For each service item (oil, oil filter, air filter, cabin filter, brake
// fluid, plugs...) it finds when it was last changed on this car, the part
// number, qty and the price charged then. The item is due if it is changed
// at every service (oil, filter) or its interval has passed. The price is
// today's selling price from stock (newest purchase), else the last price.
// A car with no service here gets the matching Service package, or the
// parts used on the last car of the same model.
//
// Intervals are a general Mercedes guide, not this car's own service
// booklet: the owner checks them on the estimate.

const P = require("./pricing");
const I = require("./insights");

const DAY = 864e5;
const isoDate = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : "");
const jobDay = (j) => isoDate(j.invoiceDate) || isoDate(j.repairDate) || isoDate(j.date);
const invoiced = (j) => !!j.invoiceNo && j.status !== "Cancelled" && !!jobDay(j);
const monthsBetween = (a, b) => Math.floor((Date.parse(b) - Date.parse(a)) / DAY / 30.44);
const noKey = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const plateKey = (p) => String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// every: changed at every service. quote: false = only mentioned (a separate job to offer).
const ITEMS = [
  { id: "oil", label: "Engine oil", re: /ENGINE OIL|MINYAK ENJIN|\bMB ?229|\b[05]W-?\d0\b/i, not: /TRANSMISSION|GEAR|\bATF\b|FILTER/i, every: true },
  { id: "oilFilter", label: "Oil filter", re: /OIL FILTER/i, every: true },
  { id: "seal", label: "Drain plug / seal", re: /DRAIN PLUG|SUMP (PLUG|WASHER)|SEAL(ING)? RING|SCREW PLUG/i, not: /GEAR|TRANSMISSION/i, every: true },
  { id: "cabin", label: "Cabin filter", re: /CABIN|DUST FILTER|POLLEN|CHARCOAL|COMBINATION FILTER|AIR ?CON(D(ITION(ER|ING)?)?)? FILTER|\bA\/?C FILTER/i, months: 24, km: 20000 },
  { id: "air", label: "Air filter", re: /AIR FILTER|AIR CLEANER|AIR ELEMENT/i, months: 24, km: 40000 },
  { id: "brakeFluid", label: "Brake fluid", re: /BRAKE FLUID|\bDOT ?4\b/i, months: 24 },
  { id: "plugs", label: "Spark plugs", re: /SPARK PLUG/i, months: 48, km: 60000 },
  { id: "fuelFilter", label: "Fuel filter", re: /FUEL FILTER/i, months: 48, km: 60000 },
  { id: "wiper", label: "Wiper blades", re: /WIPER/i, months: 12 },
  { id: "atf", label: "Gearbox oil (ATF)", re: /\bATF\b|TRANSMISSION (FLUID|OIL|FILTER)|GEAR ?(BOX )?OIL/i, months: 48, km: 60000, quote: false },
  { id: "coolant", label: "Coolant", re: /COOLANT|ANTIFREEZE/i, months: 60, km: 100000, quote: false },
];
const itemOf = (desc) => ITEMS.find((it) => it.re.test(desc) && !(it.not && it.not.test(desc))) || null;

// A part line, with the job it came from.
function linesOf(j) {
  const out = [];
  for (const g of j.groups || []) for (const l of g.lines || []) {
    if (l.type === "part" && l.qty > 0) out.push({ ...l, date: jobDay(j), km: j.mileageKm || null, docNo: j.invoiceNo, jobId: j.id });
  }
  return out;
}

// The group on a job that is the service (the one with the oil, or "SERVICE").
function serviceGroup(j) {
  const groups = j.groups || [];
  return groups.find((g) => (g.lines || []).some((l) => l.type === "part" && itemOf(l.description || "")?.every))
    || groups.find((g) => /SERVI[CS]/i.test(g.request || "") && !/AIR ?CON|AIRCOND|GEAR|BRAKE/i.test(g.request || ""))
    || null;
}

// Mercedes alternates Service A and B.
function nextRequest(last) {
  const r = String(last || "").toUpperCase().trim();
  if (/\bSERVICE A\b/.test(r)) return r.replace(/\bSERVICE A\b/, "SERVICE B");
  if (/\bSERVICE B\b/.test(r)) return r.replace(/\bSERVICE B\b/, "SERVICE A");
  return /SERVI[CS]/.test(r) ? r : "SERVICE"; // "WORK AS INVOICED" says nothing useful
}

/**
 * @param {object} o
 * @param {object} o.vehicle  mergeVehicles() entry for the car
 * @param {object[]} o.jobs   jobOut() list (all cars)
 * @param {object[]} o.parts  partOut() list
 * @param {object[]} o.packages packageOut() list
 * @param {object[]} [o.vehicles] mergeVehicles() list (chassis of other cars)
 * @param {number} o.labourRate RM per hour
 * @param {string} o.today yyyy-mm-dd
 */
function serviceQuote({ vehicle: v, jobs, parts, packages = [], vehicles = [], labourRate = 100, today }) {
  const key = v.key || plateKey(v.plate);
  const carJobs = jobs.filter((j) => plateKey(j.plate) === key && invoiced(j)).sort((a, b) => jobDay(b).localeCompare(jobDay(a)));
  const kmNow = v.mileageKm || null;
  const model = I.modelOf(v.makeModel, v.chassisNo);

  // Stock: newest purchase per part number (and per record id).
  const partsById = new Map(parts.map((p) => [p.id, p]));
  const stockByNo = new Map();
  for (const p of parts) {
    const k = noKey(p.partNo);
    if (k.length < 5) continue;
    const s = stockByNo.get(k);
    if (!s || (p.boughtOn || "") >= (s.boughtOn || "")) stockByNo.set(k, { ...p, qtyLeft: (s ? s.qtyLeft : 0) + Math.max(0, p.qtyLeft || 0) });
    else s.qtyLeft += Math.max(0, p.qtyLeft || 0);
  }
  const stockFor = (l) => {
    const byNo = noKey(l.partNo).length >= 5 ? stockByNo.get(noKey(l.partNo)) : null;
    if (byNo) return byNo;
    const rec = l.partId ? partsById.get(l.partId) : null;
    return rec ? stockByNo.get(noKey(rec.partNo)) || rec : null;
  };

  // Price a line from a past job: today's stock price, else the price then.
  const priced = (l) => {
    const st = stockFor(l);
    const lastPrice = round2(l.unitPrice || 0);
    const now = st && st.sellingPrice > 0 ? round2(st.sellingPrice) : null;
    return {
      unitPrice: now ?? lastPrice,
      priceFrom: now !== null ? "stock" : "last",
      lastPrice: l.date ? lastPrice : null,
      priceChanged: now !== null && !!l.date && lastPrice > 0 && Math.abs(now - lastPrice) >= 0.01,
      stockLeft: st ? round2(st.qtyLeft || 0) : null,
      partId: st?.id || l.partId || "",
      partNo: l.partNo || st?.partNo || "",
    };
  };

  // When each item was last changed on this car.
  const hist = new Map();
  for (const j of carJobs) for (const l of linesOf(j)) {
    const it = itemOf(l.description || "");
    if (it && !hist.has(it.id)) hist.set(it.id, l); // carJobs is newest first
  }
  const svcJobs = carJobs.filter((j) => I.isServiceJob(j));
  const lastSvc = svcJobs[0] || null;
  const lastGroup = lastSvc ? serviceGroup(lastSvc) : null;

  const items = [];
  const checks = [];
  const notes = [];
  const lines = [];

  const ageOf = (h) => {
    const m = monthsBetween(h.date, today);
    const kmSince = kmNow && h.km ? kmNow - h.km : null;
    return { m, kmSince, text: `last changed ${h.date.split("-").reverse().join("/")}${h.km ? ` at ${h.km.toLocaleString("en-MY")} km` : ""} (${m < 1 ? "this month" : `${m} month${m === 1 ? "" : "s"} ago`}${kmSince > 0 ? `, ${kmSince.toLocaleString("en-MY")} km since` : ""})` };
  };

  let source = "none";
  if (lastSvc) {
    source = "history";
    for (const it of ITEMS) {
      const h = hist.get(it.id);
      if (!h) {
        // Never changed here: worth a look on an older or high-mileage car.
        if (!it.every && ((it.km && kmNow >= it.km) || (it.months && v.regDate && monthsBetween(v.regDate, today) >= it.months))) {
          checks.push(`${it.label}: no record of a change at our workshop. Check it.`);
        }
        continue;
      }
      const age = ageOf(h);
      let due = false;
      let why = "";
      if (it.every) {
        // Only items that were on the last service itself (a seal bought once is not every time).
        const onLast = (lastGroup?.lines || []).some((l) => l.type === "part" && itemOf(l.description || "")?.id === it.id);
        if (!onLast) continue;
        due = true;
        why = "Changed at every service";
      } else if ((it.months && age.m >= it.months - 1) || (it.km && age.kmSince !== null && age.kmSince >= it.km - 2000)) {
        due = true;
        why = `Due: ${age.text}`;
      }
      if (!due) continue;
      if (it.quote === false) {
        checks.push(`${it.label} is due (${age.text}). Offer it as a separate job.`);
        continue;
      }
      const pr = priced(h);
      const line = { type: "part", description: h.description, partNo: pr.partNo, qty: h.qty, unitPrice: pr.unitPrice };
      if (pr.partId) line.partId = pr.partId;
      lines.push(line);
      items.push({ item: it.label, description: h.description, partNo: pr.partNo, qty: h.qty, unitPrice: pr.unitPrice, priceFrom: pr.priceFrom, lastPrice: pr.lastPrice, priceChanged: pr.priceChanged, stockLeft: pr.stockLeft, lastDate: h.date, lastKm: h.km, lastDoc: h.docNo, why });
    }
    // Labour and sundries from the last service, at today's labour rate.
    for (const l of lastGroup?.lines || []) {
      if (l.type === "part") continue;
      const line = { type: l.type, description: l.description, amount: l.amount };
      if (l.type === "labour") {
        if (l.opCode) line.opCode = l.opCode;
        if (l.hours > 0) Object.assign(line, { hours: l.hours, amount: round2(l.hours * labourRate) });
      }
      if (l.category) line.category = l.category;
      lines.push(line);
      items.push({ item: l.type === "labour" ? "Labour" : "Sundry", description: l.description, qty: 1, unitPrice: line.amount, priceFrom: l.type === "labour" && l.hours > 0 ? "rate" : "last", lastPrice: l.amount, priceChanged: Math.abs((line.amount || 0) - (l.amount || 0)) >= 0.01, lastDate: lastSvc ? jobDay(lastSvc) : "", lastDoc: lastSvc?.invoiceNo, why: "Same as last service" });
    }
  }

  // Wear parts: never added, only listed so the tech checks them.
  const wearSeen = new Set();
  for (const j of carJobs) for (const l of linesOf(j)) {
    if (I.kindOf(l.description || "") !== "Wear") continue;
    const k = noKey(l.description).slice(0, 30);
    if (wearSeen.has(k)) continue;
    wearSeen.add(k);
    checks.push(`${l.description}: ${ageOf(l).text}. Check wear.`);
  }

  // No service here yet: the matching Service package, else the last car of the same model.
  let pkgUsed = null;
  const ch = (() => {
    const s = noKey(v.chassisNo);
    return s.length === 17 ? { model: s.slice(3, 6), variant: s.slice(6, 10) } : null;
  })();
  const fits = (pkg) => !(pkg.fits || []).length || (!!ch && pkg.fits.some((c) => (c.length === 3 ? c === ch.model : c === ch.model + ch.variant)));
  const svcPackages = packages.filter((p) => p.active && (p.setsService || /SERVI[CS]/i.test(`${p.name} ${p.request}`)) && fits(p));
  if (!lines.length) {
    // The package made for this model first, then one for any model.
    const pick = svcPackages.find((p) => (p.fits || []).length) || svcPackages[0];
    if (pick) {
      source = "package";
      pkgUsed = { id: pick.id, name: pick.name };
      for (const l of pick.lines || []) {
        const line = { ...l };
        if (l.type === "part") {
          const st = l.partId ? partsById.get(l.partId) : stockFor(l);
          if (st && st.sellingPrice > 0) line.unitPrice = round2(st.sellingPrice);
          items.push({ item: itemOf(l.description || "")?.label || "Part", description: l.description, partNo: l.partNo || "", qty: l.qty, unitPrice: line.unitPrice, priceFrom: st ? "stock" : "package", stockLeft: st ? st.qtyLeft : null, why: `From package ${pick.name}` });
        } else {
          if (l.type === "labour" && l.hours > 0) line.amount = round2(l.hours * labourRate);
          items.push({ item: l.type === "labour" ? "Labour" : "Sundry", description: l.description, qty: 1, unitPrice: line.amount, priceFrom: "package", why: `From package ${pick.name}` });
        }
        lines.push(line);
      }
      notes.push(lastSvc ? `Nothing due from this car's records, so the ${pick.name} package is used.` : `No service for this car in our records yet, so the ${pick.name} package is used.`);
    } else if (model) {
      const chassisByPlate = new Map(vehicles.map((x) => [plateKey(x.plate), x.chassisNo]));
      const same = jobs.filter((j) => invoiced(j) && plateKey(j.plate) !== key && I.isServiceJob(j) && I.modelOf(j.car, j.details?.vehicle?.chassisNo || chassisByPlate.get(plateKey(j.plate)))?.code === model.code)
        .sort((a, b) => jobDay(b).localeCompare(jobDay(a)))[0];
      const g = same && serviceGroup(same);
      if (g) {
        source = "model";
        for (const l of g.lines || []) {
          if (l.type !== "part" || !itemOf(l.description || "")?.every) continue;
          const pr = priced({ ...l, date: "" });
          const line = { type: "part", description: l.description, partNo: pr.partNo, qty: l.qty, unitPrice: pr.unitPrice };
          if (pr.partId) line.partId = pr.partId;
          lines.push(line);
          items.push({ item: itemOf(l.description).label, description: l.description, partNo: pr.partNo, qty: l.qty, unitPrice: pr.unitPrice, priceFrom: pr.priceFrom, stockLeft: pr.stockLeft, why: `Used on the last ${model.code} service (${same.invoiceNo})` });
        }
        for (const l of g.lines || []) {
          if (l.type !== "labour") continue;
          const amount = l.hours > 0 ? round2(l.hours * labourRate) : l.amount;
          lines.push({ type: "labour", description: l.description, amount, ...(l.hours > 0 ? { hours: l.hours } : {}), ...(l.opCode ? { opCode: l.opCode } : {}) });
          items.push({ item: "Labour", description: l.description, qty: 1, unitPrice: amount, priceFrom: l.hours > 0 ? "rate" : "last", why: `As on the last ${model.code} service` });
        }
        notes.push(`No service for this car in our records yet. Parts are from the last ${model.code} service. Check the part numbers fit this car.`);
      }
    }
  }
  if (!lines.length) notes.push("No service history for this car and no Service package fits it. Add the parts by hand, or make a Service package for this model.");
  if (lastSvc && source === "history" && !lines.some((l) => l.type === "labour")) notes.push("The last service had no labour line. Add the labour.");
  if (!kmNow) notes.push("No mileage on record: type today's mileage so the km checks are right.");
  if (items.some((i) => i.priceChanged)) notes.push("Some prices changed since last time. They are marked below.");

  const request = source === "history" ? nextRequest(lastGroup?.request) : source === "package" ? pkgUsed && (packages.find((p) => p.id === pkgUsed.id)?.request || "SERVICE") : "SERVICE";
  const partsTotal = round2(lines.filter((l) => l.type === "part").reduce((t, l) => t + l.qty * l.unitPrice, 0));
  const otherTotal = round2(lines.filter((l) => l.type !== "part").reduce((t, l) => t + (Number(l.amount) || 0), 0));

  return {
    car: { key, plate: v.plate, makeModel: v.makeModel, model: model?.code || "", mileageKm: kmNow, ownerName: v.ownerName, chassisNo: v.chassisNo },
    lastService: lastSvc ? { date: jobDay(lastSvc), km: lastSvc.mileageKm || null, docNo: lastSvc.invoiceNo, request: lastGroup?.request || "" } : null,
    due: { date: v.serviceDueDate || "", km: v.serviceDueKm || null, status: v.serviceStatus || "none" },
    source,
    package: pkgUsed,
    group: lines.length ? { request: String(request || "SERVICE").toUpperCase(), lines } : null,
    items,
    checks: checks.slice(0, 12),
    notes,
    total: round2(partsTotal + otherTotal),
  };
}

// GET /api/service-quote/:key
function register(router, { wrap, jobOut, partOut, packageOut, loadSettings, mergeVehicles }) {
  const db = require("./airtable");
  router.get("/service-quote/:key", wrap(async (req, res) => {
    const key = plateKey(req.params.key);
    const [q, p, vr, pk, s] = await Promise.all([db.list("quotes"), db.list("parts"), db.list("vehicles"), db.list("packages"), loadSettings()]);
    const jobs = q.map(jobOut);
    const vehicles = mergeVehicles(vr, jobs, { months: s.serviceIntervalMonths, km: s.serviceIntervalKm });
    const vehicle = vehicles.find((x) => x.key === key);
    if (!vehicle) throw Object.assign(new Error("This car is not in the system."), { status: 404 });
    res.json(serviceQuote({ vehicle, jobs, parts: p.map(partOut), packages: pk.map(packageOut), vehicles, labourRate: Number(s.labourRate) || 100, today: P.todayKL() }));
  }));
}

module.exports = { register, serviceQuote, ITEMS, itemOf, nextRequest };
