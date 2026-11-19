// CRM: contact log (interactions), follow-ups and bookings.

const db = require("./airtable");
const P = require("./pricing");

const text = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const isRec = (id) => /^rec[A-Za-z0-9]{14}$/.test(id || "");
const iso = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

const KINDS = ["Call", "WhatsApp", "Visit", "Email", "Note"];
const BOOKING = ["Booked", "Arrived", "No-show", "Cancelled"];

const interactionOut = (r) => ({ id: r.id, note: r.fields.Note || "", date: r.fields.Date || "", customerId: r.fields["Customer record"] || "", customerName: r.fields["Customer name"] || "", type: r.fields.Type?.name || r.fields.Type || "Note", createdTime: r.createdTime || "" });

const bookingOut = (r) => {
  const f = r.fields;
  return { id: r.id, work: f.Work || "", date: f.Date || "", time: f.Time || "", customerId: f["Customer record"] || "", customerName: f["Customer name"] || "", phone: f.Phone || "", plate: f.Plate || "", car: f.Car || "", status: f.Status?.name || f.Status || "Booked", jobId: f["Job record"] || "", notes: f.Notes || "" };
};

function bookingFields(b, partial) {
  const fields = {};
  if (!partial || "date" in b) {
    const d = iso(b.date);
    if (!d) throw bad("Choose the booking date.");
    fields.Date = d;
  }
  if ("time" in b) {
    const t = text(b.time, 5);
    if (t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw bad("Time must look like 09:30.");
    fields.Time = t;
  }
  if (!partial || "customerName" in b) {
    const n = text(b.customerName, 120);
    if (!n) throw bad("Customer name is needed.");
    fields["Customer name"] = n;
  }
  for (const [k, f, max] of [["phone", "Phone", 30], ["car", "Car", 80], ["work", "Work", 200], ["notes", "Notes", 1000]]) if (k in b) fields[f] = text(b[k], max);
  if ("plate" in b) fields.Plate = text(b.plate, 20).toUpperCase();
  if ("customerId" in b) fields["Customer record"] = isRec(b.customerId) ? b.customerId : "";
  if ("jobId" in b) fields["Job record"] = isRec(b.jobId) ? b.jobId : "";
  if ("status" in b) {
    if (!BOOKING.includes(b.status)) throw bad("Unknown booking status.");
    fields.Status = b.status;
  }
  return fields;
}

function register(router, { wrap, customerOut }) {
  router.get("/interactions", wrap(async (req, res) => {
    const list = (await db.list("interactions")).map(interactionOut).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdTime || "").localeCompare(a.createdTime || ""));
    res.json({ interactions: list });
  }));

  // Log a contact; can also set (or clear) the customer's next follow-up.
  router.post("/interactions", wrap(async (req, res) => {
    const b = req.body || {};
    if (!isRec(b.customerId)) throw bad("Choose the customer.");
    const c = customerOut(await db.get("customers", b.customerId));
    const note = text(b.note, 2000);
    const type = KINDS.includes(b.type) ? b.type : "Note";
    if (!note && type === "Note") throw bad("Write what happened.");
    const [row] = await db.create("interactions", [{ Note: note || type, Date: iso(b.date) || P.todayKL(), "Customer record": c.id, "Customer name": c.name, Type: type }]);
    let customer = c;
    if ("nextFollowUp" in b) {
      const next = iso(b.nextFollowUp);
      const [cr] = await db.update("customers", [{ id: c.id, fields: { "Next follow-up": next || null, "Follow-up note": next ? text(b.followUpNote, 200) : "" } }]);
      customer = customerOut(cr);
    }
    res.status(201).json({ interaction: interactionOut(row), customer });
  }));

  router.get("/bookings", wrap(async (req, res) => {
    const list = (await db.list("bookings")).map(bookingOut).sort((a, b) => `${a.date} ${a.time || "99"}`.localeCompare(`${b.date} ${b.time || "99"}`));
    res.json({ bookings: list });
  }));
  router.post("/bookings", wrap(async (req, res) => {
    const [row] = await db.create("bookings", [{ Status: "Booked", ...bookingFields(req.body || {}, false) }]);
    res.status(201).json(bookingOut(row));
  }));
  router.patch("/bookings/:id", wrap(async (req, res) => {
    if (!isRec(req.params.id)) throw bad("Unknown booking.");
    await db.get("bookings", req.params.id);
    const [row] = await db.update("bookings", [{ id: req.params.id, fields: bookingFields(req.body || {}, true) }]);
    res.json(bookingOut(row));
  }));
}

module.exports = { register, interactionOut, bookingOut, KINDS };
