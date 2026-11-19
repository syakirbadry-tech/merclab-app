// Vehicles: one record per car, keyed by plate. A car that only appears on
// jobs (no Vehicles record yet) is still listed; its record is made the
// first time it is edited, gets a photo, or gets a condition mark.
//
// Condition marks are kept as JSON on the vehicle:
//   { id, view, x, y, kind, area, note, photoId, date, jobNo, fixed, fixedOn }
// view = left | right | top | front | rear; x, y in the diagram's own units.

const crypto = require("crypto");
const db = require("./airtable");
const P = require("./pricing");

const plateKey = (p) => String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
const text = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const isRec = (id) => /^rec[A-Za-z0-9]{14}$/.test(id || "");
const isoOrEmpty = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

const VIEWS = ["left", "right", "top", "front", "rear"];
const KINDS = ["scratch", "dent", "chip", "paint", "crack", "rust", "other"];
const VIEW_SIZE = { left: [220, 100], right: [220, 100], top: [220, 100], front: [120, 100], rear: [120, 100] };

const parseJson = (s, d) => {
  try {
    const v = JSON.parse(s || "");
    return v ?? d;
  } catch {
    return d;
  }
};

// Text fields the owner can edit: body key → Airtable field.
const TEXT_FIELDS = {
  makeModel: ["Make model", 80],
  colour: ["Colour", 30],
  fuel: ["Fuel", 20],
  transmission: ["Transmission", 20],
  engine: ["Engine", 30],
  chassisNo: ["Chassis no", 30],
  engineNo: ["Engine no", 30],
  ownerName: ["Owner name", 120],
  ownerPhone: ["Owner phone", 30],
  notes: ["Notes", 2000],
};
const UPPER = ["chassisNo", "engineNo"];

function vehicleOut(r) {
  const f = r.fields;
  const photos = Array.isArray(f.Photo) ? f.Photo : [];
  const last = photos[photos.length - 1];
  const files = new Map((Array.isArray(f["Condition photos"]) ? f["Condition photos"] : []).map((a) => [a.id, a]));
  const marks = parseJson(f["Condition JSON"], []);
  return {
    id: r.id,
    key: f["Plate key"] || plateKey(f.Plate),
    plate: f.Plate || "",
    makeModel: f["Make model"] || "",
    year: f.Year ?? null,
    colour: f.Colour || "",
    fuel: f.Fuel || "",
    transmission: f.Transmission || "",
    engine: f.Engine || "",
    chassisNo: f["Chassis no"] || "",
    engineNo: f["Engine no"] || "",
    regDate: f["Reg date"] || "",
    mileageKm: f["Mileage km"] ?? null,
    nextServiceDate: f["Next service date"] || "",
    nextServiceKm: f["Next service km"] ?? null,
    customerId: f["Customer record"] || "",
    ownerName: f["Owner name"] || "",
    ownerPhone: f["Owner phone"] || "",
    notes: f.Notes || "",
    photo: last ? last.thumbnails?.large?.url || last.url : null,
    marks: (Array.isArray(marks) ? marks : []).map((m) => {
      const a = m.photoId ? files.get(m.photoId) : null;
      return { ...m, photo: a ? a.url : null, thumb: a ? a.thumbnails?.small?.url || a.url : null };
    }),
  };
}

// A car known only from its jobs.
function fromJobs(key, jobs) {
  const latest = jobs[0];
  const d = latest.details || {};
  return {
    id: null,
    key,
    plate: latest.plate,
    makeModel: latest.car || "",
    year: null,
    colour: "",
    fuel: "",
    transmission: "",
    engine: "",
    chassisNo: d.vehicle?.chassisNo || "",
    engineNo: d.vehicle?.engineNo || "",
    regDate: d.vehicle?.regDate || "",
    mileageKm: null,
    nextServiceDate: "",
    nextServiceKm: null,
    customerId: latest.customerId || "",
    ownerName: latest.customerName || "",
    ownerPhone: latest.phone || "",
    notes: "",
    photo: null,
    marks: [],
  };
}

const jobDate = (j) => j.invoiceDate || j.date || "";

// Records + cars seen on jobs, with last visit, visit count and top mileage.
function mergeVehicles(rows, jobs) {
  const byKey = new Map();
  for (const r of rows) {
    const v = vehicleOut(r);
    if (v.key && !byKey.has(v.key)) byKey.set(v.key, v);
  }
  const jobsByKey = new Map();
  for (const j of jobs) {
    const k = plateKey(j.plate);
    if (!k) continue;
    if (!jobsByKey.has(k)) jobsByKey.set(k, []);
    jobsByKey.get(k).push(j);
  }
  for (const [k, list] of jobsByKey) {
    list.sort((a, b) => jobDate(b).localeCompare(jobDate(a)));
    if (!byKey.has(k)) byKey.set(k, fromJobs(k, list));
  }
  return [...byKey.values()].map((v) => {
    const list = (jobsByKey.get(v.key) || []).filter((j) => j.status !== "Cancelled");
    const km = Math.max(v.mileageKm || 0, ...list.map((j) => j.mileageKm || 0));
    const last = list[0];
    return {
      ...v,
      mileageKm: km || null,
      lastVisit: last ? jobDate(last) : "",
      visits: list.length,
      openMarks: v.marks.filter((m) => !m.fixed).length,
      stage: last && last.stage && last.stage !== "Collected" ? last.stage : "",
    };
  });
}

// Make sure a Vehicles record exists for this plate; returns the raw record.
async function ensureRecord(key, jobs, seed = {}) {
  const rows = await db.list("vehicles");
  const found = rows.find((r) => (r.fields["Plate key"] || plateKey(r.fields.Plate)) === key);
  if (found) return found;
  const fromJob = jobs.filter((j) => plateKey(j.plate) === key).sort((a, b) => jobDate(b).localeCompare(jobDate(a)));
  const base = fromJob.length ? fromJobs(key, fromJob) : null;
  const plate = text(seed.plate, 20).toUpperCase() || base?.plate || key;
  const fields = {
    Plate: plate,
    "Plate key": key,
    "Make model": base?.makeModel || "",
    "Chassis no": base?.chassisNo || "",
    "Engine no": base?.engineNo || "",
    "Owner name": base?.ownerName || "",
    "Owner phone": base?.ownerPhone || "",
    "Customer record": base?.customerId || "",
  };
  if (base?.regDate) fields["Reg date"] = base.regDate;
  const km = Math.max(0, ...fromJob.map((j) => j.mileageKm || 0));
  if (km) fields["Mileage km"] = km;
  return (await db.create("vehicles", [fields]))[0];
}

// Body → Airtable fields (only the keys that were sent).
function vehicleFields(b) {
  const fields = {};
  for (const [k, [f, max]] of Object.entries(TEXT_FIELDS)) {
    if (!(k in b)) continue;
    const v = text(b[k], max);
    fields[f] = UPPER.includes(k) ? v.toUpperCase() : v;
  }
  const num = (k, f, lo, hi, label) => {
    if (!(k in b)) return;
    if (b[k] === "" || b[k] === null) return void (fields[f] = null);
    const n = Number(String(b[k]).replace(/[, ]/g, ""));
    if (!Number.isInteger(n) || n < lo || n > hi) throw bad(`${label} must be a whole number from ${lo} to ${hi}.`);
    fields[f] = n;
  };
  num("year", "Year", 1950, 2100, "Year");
  num("mileageKm", "Mileage km", 0, 3000000, "Mileage");
  num("nextServiceKm", "Next service km", 0, 3000000, "Next service km");
  for (const [k, f] of [["regDate", "Reg date"], ["nextServiceDate", "Next service date"]]) {
    if (k in b) fields[f] = isoOrEmpty(b[k]) || null;
  }
  if ("customerId" in b) fields["Customer record"] = isRec(b.customerId) ? b.customerId : "";
  return fields;
}

// Called when a job is saved: keep the car's record up to date.
async function syncFromJob(job, customerId) {
  const key = plateKey(job.vehicle.regNo);
  if (!key) return;
  const rows = await db.list("vehicles");
  const r = rows.find((x) => (x.fields["Plate key"] || plateKey(x.fields.Plate)) === key);
  const fields = {
    "Owner name": job.customer.name,
    "Owner phone": job.customer.phone,
    "Customer record": customerId || "",
  };
  if (job.vehicle.makeModel) fields["Make model"] = job.vehicle.makeModel;
  if (job.vehicle.chassisNo) fields["Chassis no"] = job.vehicle.chassisNo;
  if (job.vehicle.engineNo) fields["Engine no"] = job.vehicle.engineNo;
  if (job.vehicle.regDate) fields["Reg date"] = job.vehicle.regDate;
  if (r) {
    if (!(r.fields["Mileage km"] >= job.vehicle.mileageKm)) fields["Mileage km"] = job.vehicle.mileageKm;
    await db.update("vehicles", [{ id: r.id, fields }]);
  } else {
    await db.create("vehicles", [{ Plate: job.vehicle.regNo, "Plate key": key, "Mileage km": job.vehicle.mileageKm, ...fields }]);
  }
}

function cleanMark(b, prev = {}) {
  const view = VIEWS.includes(b.view) ? b.view : prev.view;
  if (!view) throw bad("Choose where on the car.");
  const [w, h] = VIEW_SIZE[view];
  const x = "x" in b ? Number(b.x) : prev.x;
  const y = "y" in b ? Number(b.y) : prev.y;
  if (!(x >= 0 && x <= w && y >= 0 && y <= h)) throw bad("That spot is outside the car picture.");
  const kind = KINDS.includes(b.kind) ? b.kind : prev.kind || "other";
  return {
    ...prev,
    view,
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    kind,
    area: "area" in b ? text(b.area, 60) : prev.area || "",
    note: "note" in b ? text(b.note, 300) : prev.note || "",
    jobNo: "jobNo" in b ? text(b.jobNo, 20) : prev.jobNo || "",
  };
}

function register(router, { wrap, oneFile, fileOf, bodyData, jobOut, customerOut }) {
  const allJobs = async () => (await db.list("quotes")).map(jobOut);

  router.get("/vehicles", wrap(async (req, res) => {
    const [rows, jobs] = await Promise.all([db.list("vehicles"), allJobs()]);
    const vehicles = mergeVehicles(rows, jobs).sort((a, b) => (b.lastVisit || "").localeCompare(a.lastVisit || "") || a.key.localeCompare(b.key));
    res.json({ vehicles });
  }));

  router.get("/vehicles/:key", wrap(async (req, res) => {
    const key = plateKey(req.params.key);
    const [rows, jobs] = await Promise.all([db.list("vehicles"), allJobs()]);
    const v = mergeVehicles(rows, jobs).find((x) => x.key === key);
    if (!v) throw bad("This car is not in the system.", 404);
    res.json(v);
  }));

  // New car (no job yet).
  router.post("/vehicles", wrap(async (req, res) => {
    const b = req.body || {};
    const key = plateKey(b.plate);
    if (key.length < 2) throw bad("Car plate is needed.");
    const [rows, jobs] = await Promise.all([db.list("vehicles"), allJobs()]);
    if (mergeVehicles(rows, jobs).some((x) => x.key === key)) throw bad(`${text(b.plate, 20).toUpperCase()} is already in the system.`, 409);
    const fields = { Plate: text(b.plate, 20).toUpperCase(), "Plate key": key, ...vehicleFields(b) };
    const [row] = await db.create("vehicles", [fields]);
    res.status(201).json(mergeVehicles([row], [])[0]);
  }));

  router.patch("/vehicles/:key", wrap(async (req, res) => {
    const key = plateKey(req.params.key);
    const jobs = await allJobs();
    const row = await ensureRecord(key, jobs);
    const fields = vehicleFields(req.body || {});
    if (Object.keys(fields).length) await db.update("vehicles", [{ id: row.id, fields }]);
    const rows = await db.list("vehicles");
    res.json(mergeVehicles(rows, jobs).find((x) => x.key === key));
  }));

  router.post("/vehicles/:key/photo", oneFile, wrap(async (req, res) => {
    const key = plateKey(req.params.key);
    const file = fileOf(req);
    if (!file || !file.mimeType.startsWith("image/")) throw bad("Please choose a photo of the car (JPG or PNG).");
    const jobs = await allJobs();
    const row = await ensureRecord(key, jobs);
    await db.upload("vehiclePhoto", row.id, { filename: `${key}.jpg`, contentType: file.mimeType, base64: file.base64 });
    const rows = await db.list("vehicles");
    res.json(mergeVehicles(rows, jobs).find((x) => x.key === key));
  }));

  // Add a condition mark (optional photo).
  router.post("/vehicles/:key/marks", oneFile, wrap(async (req, res) => {
    const key = plateKey(req.params.key);
    const mark = cleanMark(bodyData(req));
    const file = fileOf(req);
    if (file && !file.mimeType.startsWith("image/")) throw bad("The condition photo must be a picture (JPG or PNG).");
    const jobs = await allJobs();
    const row = await ensureRecord(key, jobs);
    const marks = parseJson(row.fields["Condition JSON"], []);
    if (marks.length >= 200) throw bad("This car already has 200 marks. Mark old ones as fixed or remove them first.");
    mark.id = "m" + crypto.randomBytes(5).toString("hex");
    mark.date = P.todayKL();
    mark.fixed = false;
    let photoSaved = true;
    if (file) {
      try {
        const up = await db.upload("conditionPhotos", row.id, { filename: `${key}-${mark.id}.jpg`, contentType: file.mimeType, base64: file.base64 });
        mark.photoId = up?.attachment?.id || null;
      } catch {
        photoSaved = false;
      }
    }
    // Re-read: the upload changed the record.
    const fresh = await db.get("vehicles", row.id);
    const list = parseJson(fresh.fields["Condition JSON"], []);
    list.push(mark);
    await db.update("vehicles", [{ id: row.id, fields: { "Condition JSON": JSON.stringify(list) } }]);
    const rows = await db.list("vehicles");
    res.status(201).json({ vehicle: mergeVehicles(rows, jobs).find((x) => x.key === key), photoSaved });
  }));

  router.patch("/vehicles/:key/marks/:id", wrap(async (req, res) => {
    const key = plateKey(req.params.key);
    const jobs = await allJobs();
    const row = await ensureRecord(key, jobs);
    const list = parseJson(row.fields["Condition JSON"], []);
    const i = list.findIndex((m) => m.id === req.params.id);
    if (i < 0) throw bad("That mark is not on this car.", 404);
    const b = req.body || {};
    const next = cleanMark(b, list[i]);
    if ("fixed" in b) {
      next.fixed = b.fixed === true;
      next.fixedOn = next.fixed ? P.todayKL() : "";
    }
    list[i] = next;
    await db.update("vehicles", [{ id: row.id, fields: { "Condition JSON": JSON.stringify(list) } }]);
    const rows = await db.list("vehicles");
    res.json(mergeVehicles(rows, jobs).find((x) => x.key === key));
  }));

  router.delete("/vehicles/:key/marks/:id", wrap(async (req, res) => {
    const key = plateKey(req.params.key);
    const jobs = await allJobs();
    const row = await ensureRecord(key, jobs);
    const list = parseJson(row.fields["Condition JSON"], []);
    const next = list.filter((m) => m.id !== req.params.id);
    if (next.length === list.length) throw bad("That mark is not on this car.", 404);
    await db.update("vehicles", [{ id: row.id, fields: { "Condition JSON": JSON.stringify(next) } }]);
    const rows = await db.list("vehicles");
    res.json(mergeVehicles(rows, jobs).find((x) => x.key === key));
  }));

  // ---------- customers: add / edit ----------
  const customerFields = (b) => {
    const fields = {};
    const map = { name: ["Name", 120], phone: ["Phone", 30], email: ["Email", 120], address: ["Address", 300], notes: ["Notes", 2000] };
    for (const [k, [f, max]] of Object.entries(map)) if (k in b) fields[f] = text(b[k], max);
    if ("name" in b && !fields.Name) throw bad("Customer name is needed.");
    if (fields.Email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.Email)) throw bad("That email does not look right.");
    return fields;
  };

  router.post("/customers", wrap(async (req, res) => {
    const b = req.body || {};
    if (!text(b.name)) throw bad("Customer name is needed.");
    const [row] = await db.create("customers", [customerFields(b)]);
    res.status(201).json(customerOut(row));
  }));

  router.patch("/customers/:id", wrap(async (req, res) => {
    if (!isRec(req.params.id)) throw bad("Unknown customer.");
    await db.get("customers", req.params.id);
    const [row] = await db.update("customers", [{ id: req.params.id, fields: customerFields(req.body || {}) }]);
    res.json(customerOut(row));
  }));
}

module.exports = { register, plateKey, mergeVehicles, syncFromJob, cleanMark, VIEWS, KINDS };
