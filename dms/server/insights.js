// Parts analysis and service tracking, worked out from the invoices.
//
// Parts: which parts move fast, which are maintenance (service / wear) parts,
// what to buy for stock, what sits on the shelf unused, and what each model
// needs most. Only invoiced, not-cancelled jobs count: that is when a part
// really left the shelf.
//
// Service: every invoice with an oil change or a service line is a service.
// The next one is due a set time after the last (12 months by default, from
// Settings), unless the owner set the car's next service date by hand.

const P = require("./pricing");

const DAY = 864e5;
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const isoDate = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : "");
const jobDay = (j) => isoDate(j.invoiceDate) || isoDate(j.repairDate) || isoDate(j.date);
const invoiced = (j) => !!j.invoiceNo && j.status !== "Cancelled" && !!jobDay(j);
const round2 = (n) => Math.round(n * 100) / 100;

// ---------- what kind of part ----------

const SERVICE_PART = /ENGINE OIL|\bOIL FILTER|\bMB ?229|\b[05]W-?\d0\b|AIR FILTER|AIR ?COND(ITION(ER|ING)?)? FILTER|CABIN FILTER|DUST FILTER|POLLEN|CHARCOAL|FUEL FILTER|SPARK PLUG|DRAIN PLUG|SEAL(ING)? RING|SUMP (PLUG|WASHER)|BRAKE FLUID|COOLANT|ANTIFREEZE|WIPER|WASHER FLUID|TRANSMISSION (FLUID|FILTER|OIL)|\bATF\b|GEAR ?OIL/i;
const WEAR_PART = /BRAKE PAD|BRAKE DIS[CK]|\bROTOR|WEAR SENSOR|PAD SENSOR|BATTERY|\bBELT\b|TYRE|TIRE|SHOCK|ABSORBER|BUSH|MOUNT/i;

function kindOf(name) {
  if (SERVICE_PART.test(name)) return "Service";
  if (WEAR_PART.test(name)) return "Wear";
  return "Repair";
}

// An oil change, or a line that says "service" (but not an aircond or
// gearbox service), makes the job a service.
const OIL = /ENGINE OIL|\bOIL FILTER|\bMB ?229|\b[05]W-?\d0\b|TUKAR MI[NJ]YAK|OIL CHANGE|MINYAK ENJIN/i;
const SERVICE_WORD = /SERVI[CS]/i;
const NOT_ENGINE_SERVICE = /AIR ?CON|AIRCOND|\bA\/?C\b|GEAR|TRANSMISSION|\bATF\b|BRAKE|COOLANT|RADIATOR/i;
function isServiceJob(j) {
  for (const g of j.groups || []) {
    const req = String(g.request || "");
    if (SERVICE_WORD.test(req) && !NOT_ENGINE_SERVICE.test(req)) return true;
    for (const l of g.lines || []) {
      const d = String(l.description || "");
      if (OIL.test(d) && !/TRANSMISSION|GEAR|\bATF\b/i.test(d)) return true;
      if (l.type === "labour" && SERVICE_WORD.test(d) && !NOT_ENGINE_SERVICE.test(d)) return true;
    }
  }
  return false;
}

// ---------- which model ----------

const MODELS = {
  203: "C-Class", 204: "C-Class", 205: "C-Class", 206: "C-Class",
  211: "E-Class", 212: "E-Class", 213: "E-Class", 214: "E-Class", 207: "E-Class Coupe", 238: "E-Class Coupe",
  176: "A-Class", 177: "A-Class", 246: "B-Class", 247: "B-Class / GLA", 117: "CLA", 118: "CLA",
  156: "GLA", 253: "GLC", 254: "GLC", 166: "ML / GLE", 167: "GLE", 292: "GLE Coupe",
  221: "S-Class", 222: "S-Class", 223: "S-Class", 218: "CLS", 257: "CLS", 463: "G-Class", 447: "V-Class",
  172: "SLK", 231: "SL", 290: "AMG GT 4-Door", 243: "EQA", 293: "EQC",
};
const BODY = { 253: "X", 254: "X", 156: "X", 166: "W", 167: "V", 292: "C", 117: "C", 118: "C", 207: "C", 238: "C", 290: "X", 243: "H", 293: "N" };

// "W205" from the car name ("C200 (W205)") or the chassis number
// (WDD2050422F..., W1N253..., PMH205...: digits 4-6 are the model).
function modelOf(car, chassisNo) {
  // "C200" is a trim, "W205" a model: take the first that is a known model.
  for (const m of String(car || "").toUpperCase().matchAll(/\b([WCSXVHAZRN])\s?(\d{3})\b/g)) {
    if (MODELS[m[2]]) return { code: m[1] + m[2], name: MODELS[m[2]] };
  }
  const vin = String(chassisNo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const digits = vin.length >= 11 ? vin.slice(3, 6) : "";
  if (/^\d{3}$/.test(digits) && MODELS[digits]) return { code: (BODY[digits] || "W") + digits, name: MODELS[digits] };
  return null;
}

// General workshop knowledge, NOT from this workshop's records: parts that
// commonly need replacing on these models. Shown labelled as such.
const KNOWN = {
  176: ["Camshaft adjuster solenoid (oil leak, M270)", "Thermostat housing (M270)", "Engine mounts"],
  177: ["Thermostat / coolant pump (M260 / M282)", "Front brake pads and discs", "Engine mounts"],
  117: ["Camshaft adjuster solenoid (oil leak, M270)", "Thermostat housing (M270)"],
  118: ["Thermostat / coolant pump (M260 / M282)"],
  156: ["Camshaft adjuster solenoid (oil leak, M270)", "Thermostat housing (M270)"],
  246: ["Camshaft adjuster solenoid (oil leak, M270)", "Thermostat housing (M270)"],
  247: ["Thermostat / coolant pump (M260 / M282)"],
  204: ["Camshaft adjuster solenoid (M271)", "Timing chain and tensioner (M271)", "Engine mounts"],
  205: ["Camshaft adjuster solenoid (oil leak, M274)", "Engine mounts", "Thermostat (M274)"],
  212: ["Camshaft adjuster solenoid (M271 / M274)", "Engine mounts", "Airmatic (if fitted)"],
  213: ["Camshaft adjuster solenoid (oil leak, M274)", "Thermostat (M264)", "Air suspension (if fitted)"],
  253: ["Camshaft adjuster solenoid (oil leak, M274)", "Thermostat (M264)", "Air suspension (if fitted)"],
  166: ["Airmatic struts and compressor", "Engine mounts"],
  222: ["Airmatic struts, lines and compressor", "Valve block"],
  221: ["Airmatic struts and compressor", "Valve block"],
};
const knownFor = (code) => KNOWN[String(code || "").slice(1)] || [];

// ---------- parts ----------

const noKey = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const nameKey = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

// One key per real part: the part number when there is one, else the name.
function keyFor(line, partsById) {
  const rec = line.partId ? partsById.get(line.partId) : null;
  const no = noKey(line.partNo || rec?.partNo);
  if (no.length >= 6) return "n:" + no;
  return "d:" + nameKey(rec?.name || line.description);
}
const partKey = (p) => (noKey(p.partNo).length >= 6 ? "n:" + noKey(p.partNo) : "d:" + nameKey(p.name));

// How fast a part moves, by the number of jobs that used it per month.
function speedOf(jobsPerMonth) {
  if (jobsPerMonth >= 1) return "Fast";
  if (jobsPerMonth >= 1 / 3) return "Steady";
  return "Slow";
}

/**
 * @param {object} o
 * @param {object[]} o.jobs  jobOut() list
 * @param {object[]} o.parts partOut() list
 * @param {object[]} [o.vehicles] mergeVehicles() list (for chassis numbers)
 * @param {string} o.today  yyyy-mm-dd
 * @param {number} [o.months] look-back window (3-24, default 12)
 * @param {number} [o.coverMonths] stock to keep, in months of use (default 1.5)
 */
function partsInsights({ jobs, parts, vehicles = [], today, months = 12, coverMonths = 1.5 }) {
  months = Math.min(24, Math.max(1, Math.round(Number(months) || 12)));
  const from = P.addMonths(today, -months);
  const done = jobs.filter(invoiced);
  const inWindow = done.filter((j) => jobDay(j) > from && jobDay(j) <= today);
  // A new workshop has less history than the window: average over what there is.
  const first = done.map(jobDay).sort()[0] || today;
  const span = Math.max(1, Math.min(months, daysBetween(first > from ? first : from, today) / 30.44));

  const partsById = new Map(parts.map((p) => [p.id, p]));
  const stockByKey = new Map();
  for (const p of parts) {
    const k = partKey(p);
    const s = stockByKey.get(k) || { qtyLeft: 0, unitCost: 0, boughtOn: "", supplier: "", ids: [] };
    s.qtyLeft = round2(s.qtyLeft + Math.max(0, p.qtyLeft || 0));
    s.ids.push(p.id);
    if ((p.boughtOn || "") >= s.boughtOn) Object.assign(s, { unitCost: p.unitCost || s.unitCost, boughtOn: p.boughtOn || s.boughtOn, supplier: p.supplier || s.supplier });
    stockByKey.set(k, s);
  }
  const chassisByPlate = new Map(vehicles.map((v) => [noKey(v.plate), v.chassisNo]));

  const use = new Map();
  const models = new Map();
  for (const j of inWindow) {
    const day = jobDay(j);
    const model = modelOf(j.car, j.details?.vehicle?.chassisNo || chassisByPlate.get(noKey(j.plate)));
    const seen = new Set();
    for (const g of j.groups || []) for (const l of g.lines || []) {
      if (l.type !== "part" || !(l.qty > 0)) continue;
      const k = keyFor(l, partsById);
      const u = use.get(k) || { key: k, name: "", partNo: "", qty: 0, jobs: 0, cars: new Set(), models: new Map(), lastUsed: "", maxPerJob: 0, sales: 0 };
      if (day >= u.lastUsed) Object.assign(u, { lastUsed: day, name: l.description || u.name, partNo: l.partNo || u.partNo });
      u.qty = round2(u.qty + l.qty);
      u.sales = round2(u.sales + (l.amount ?? l.qty * (l.unitPrice || 0)));
      u.maxPerJob = Math.max(u.maxPerJob, l.qty);
      if (!seen.has(k)) {
        u.jobs += 1;
        seen.add(k);
        if (j.plate) u.cars.add(noKey(j.plate));
        if (model) u.models.set(model.code, (u.models.get(model.code) || 0) + 1);
      }
      use.set(k, u);
    }
    if (model) {
      const m = models.get(model.code) || { code: model.code, name: model.name, jobs: 0, cars: new Set(), parts: new Map() };
      m.jobs += 1;
      if (j.plate) m.cars.add(noKey(j.plate));
      for (const k of seen) m.parts.set(k, (m.parts.get(k) || 0) + 1);
      models.set(model.code, m);
    }
  }

  const items = [...use.values()].map((u) => {
    const stock = stockByKey.get(u.key) || { qtyLeft: 0, unitCost: 0, supplier: "", ids: [] };
    const kind = kindOf(u.name);
    const perMonth = round2(u.qty / span);
    const jobsPerMonth = u.jobs / span;
    const speed = speedOf(jobsPerMonth);
    // Stock it if it keeps coming back: 3+ jobs, or 2+ for service/wear parts.
    const repeat = u.jobs >= 3 || (kind !== "Repair" && u.jobs >= 2);
    const target = repeat ? Math.max(Math.ceil(u.maxPerJob), Math.ceil(perMonth * coverMonths)) : 0;
    const buy = Math.max(0, Math.ceil(target - stock.qtyLeft));
    return {
      key: u.key, name: u.name, partNo: u.partNo, kind, maintenance: kind !== "Repair", speed,
      qtyUsed: u.qty, jobs: u.jobs, cars: u.cars.size, perMonth, lastUsed: u.lastUsed, sales: u.sales,
      models: [...u.models.entries()].sort((a, b) => b[1] - a[1]).map(([code, n]) => ({ code, jobs: n })),
      inStock: stock.qtyLeft, unitCost: stock.unitCost, supplier: stock.supplier, partIds: stock.ids,
      target, buy, buyCost: round2(buy * (stock.unitCost || 0)),
    };
  }).sort((a, b) => b.jobs - a.jobs || b.qtyUsed - a.qtyUsed || a.name.localeCompare(b.name));

  const toBuy = items.filter((i) => i.buy > 0).sort((a, b) => (b.maintenance - a.maintenance) || b.jobs - a.jobs);

  // On the shelf, bought 90+ days ago, not used for 6 months.
  const sixAgo = P.addMonths(today, -6);
  const lastUse = new Map();
  for (const j of done) for (const g of j.groups || []) for (const l of g.lines || []) {
    if (l.type !== "part") continue;
    const k = keyFor(l, partsById);
    if (jobDay(j) > (lastUse.get(k) || "")) lastUse.set(k, jobDay(j));
  }
  const idle = [...stockByKey.entries()]
    .filter(([k, s]) => s.qtyLeft > 0 && (lastUse.get(k) || "") <= sixAgo && s.boughtOn && daysBetween(s.boughtOn, today) >= 90)
    .map(([k, s]) => {
      const p = partsById.get(s.ids[s.ids.length - 1]);
      return { key: k, name: p?.name || "", partNo: p?.partNo || "", inStock: s.qtyLeft, value: round2(s.qtyLeft * (s.unitCost || 0)), lastUsed: lastUse.get(k) || "", boughtOn: s.boughtOn };
    })
    .sort((a, b) => b.value - a.value);

  const names = new Map(items.map((i) => [i.key, i]));
  const byModel = [...models.values()].map((m) => {
    const top = [...m.parts.entries()].map(([k, n]) => ({ name: names.get(k)?.name || "", partNo: names.get(k)?.partNo || "", kind: names.get(k)?.kind || "Repair", jobs: n })).sort((a, b) => b.jobs - a.jobs);
    return {
      code: m.code, name: m.name, jobs: m.jobs, cars: m.cars.size,
      service: top.filter((t) => t.kind !== "Repair").slice(0, 5),
      repairs: top.filter((t) => t.kind === "Repair").slice(0, 5),
      known: knownFor(m.code),
    };
  }).sort((a, b) => b.jobs - a.jobs);

  return {
    months, from, today, monthsOfData: round2(span), invoices: inWindow.length,
    summary: {
      partsUsed: items.length,
      fast: items.filter((i) => i.speed === "Fast").length,
      maintenance: items.filter((i) => i.maintenance).length,
      buyCost: round2(toBuy.reduce((t, i) => t + i.buyCost, 0)),
      idleValue: round2(idle.reduce((t, i) => t + i.value, 0)),
    },
    items, toBuy, idle, byModel,
  };
}

// ---------- service ----------

/**
 * Service record for one car.
 * @param {object[]} carJobs the car's jobs (any order)
 * @param {object} manual { nextServiceDate, nextServiceKm } set by hand on the car
 * @param {object} o { today, months, km }
 */
function serviceOf(carJobs, manual, { today, months = 12, km = 10000 }) {
  const history = carJobs.filter((j) => invoiced(j) && isServiceJob(j))
    .map((j) => ({ date: jobDay(j), km: j.mileageKm || null, docNo: j.invoiceNo, jobId: j.id }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const last = history[history.length - 1] || null;
  // Did the car come back for each service that fell due? (within 90 days)
  let due = 0;
  let back = 0;
  history.forEach((s, i) => {
    const d = P.addMonths(s.date, months);
    if (d > today) return;
    due += 1;
    const next = history[i + 1];
    if (next && next.date <= P.addDays(d, 90)) back += 1;
  });
  let dueDate = last ? P.addMonths(last.date, months) : "";
  let dueKm = last && last.km ? last.km + km : null;
  let set = "auto";
  if (manual.nextServiceDate && (!last || manual.nextServiceDate > last.date)) {
    dueDate = manual.nextServiceDate;
    dueKm = manual.nextServiceKm || dueKm;
    set = "manual";
  }
  const days = dueDate ? daysBetween(today, dueDate) : null;
  const status = !dueDate ? "none" : days < -180 ? "lapsed" : days < 0 ? "overdue" : days <= 30 ? "due" : days <= 60 ? "soon" : "ok";
  return {
    lastServiceDate: last ? last.date : "",
    lastServiceKm: last ? last.km : null,
    serviceDueDate: dueDate,
    serviceDueKm: dueKm,
    serviceDueSet: set,
    serviceStatus: status,
    serviceDays: days,
    serviceHistory: history.slice().reverse(),
    serviceReturns: { due, back },
  };
}

// GET /api/insights/parts?months=12
function register(router, { wrap, jobOut, partOut, loadSettings, mergeVehicles }) {
  const db = require("./airtable");
  router.get("/insights/parts", wrap(async (req, res) => {
    const months = [3, 6, 12, 24].includes(Number(req.query.months)) ? Number(req.query.months) : 12;
    const [q, p, v, s] = await Promise.all([db.list("quotes"), db.list("parts"), db.list("vehicles"), loadSettings()]);
    const jobs = q.map(jobOut);
    const vehicles = mergeVehicles(v, jobs, { months: s.serviceIntervalMonths, km: s.serviceIntervalKm });
    res.json(partsInsights({ jobs, parts: p.map(partOut), vehicles, today: P.todayKL(), months }));
  }));
}

module.exports = { register, partsInsights, serviceOf, isServiceJob, kindOf, modelOf, speedOf, knownFor, jobDay };
