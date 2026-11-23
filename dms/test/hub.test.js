// Tests for the Merc HUB search, ranking and text helpers (public/hub-logic.js).
// Demo data only: no real customer or MBM material.

const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("../public/hub-logic");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const DEMO = [
  { id: "recA", source: "Our case", verified: true, title: "M274: misfire at cold start", makeModel: "C200 W205", engine: "M274", codes: "P0302, P0087", symptom: "Engine light on, rough idle", cause: "ME software", fix: "ME update", date: "2026-11-12", mileageKm: 85412, hours: 1.5, jobId: "recJOB1", plateKey: "VDM2841" },
  { id: "recB", source: "Our case", verified: false, title: "W205 coolant loss, no visible leak", makeModel: "C300 W205", engine: "M274", codes: "P0128", symptom: "Coolant level drops", date: "2026-11-06" },
  { id: "recC", source: "MBM forum", title: "Demo tip: camshaft solenoid oil leak", makeModel: "W205", engine: "M274", codes: "P0016", symptom: "Oil on the connector", sourceRef: "Demo thread 0001", date: "2026-10-20" },
  { id: "recD", source: "General info", title: "Demo: M260 coolant capacity", makeModel: "A250 W177", engine: "M260", details: "Capacity about 6.5 L", date: "2026-09-15" },
  { id: "recE", source: "Our case", verified: true, title: "X253 OM651: no start after battery", makeModel: "GLC X253", engine: "OM651", codes: "U0100", symptom: "Cranks, no start", date: "2026-11-03" },
  { id: "recF", title: "Old entry with no source", makeModel: "E200 W213", engine: "M264", symptom: "Harsh shift", date: "2026-08-01" },
];

test("results rank: our verified > MBM > our not verified > general", () => {
  const r = H.search(DEMO, {});
  assert.deepEqual(r.map((x) => x.f.id), ["recA", "recE", "recC", "recB", "recF", "recD"]);
  const g = H.groups(r);
  assert.deepEqual(g.map((x) => [x.label, x.items.length]), [["Our verified fixes", 2], ["MBM forum", 1], ["Our cases, not verified yet", 2], ["General information", 1]]);
});

test("an entry with no source counts as our case", () => {
  assert.equal(H.srcOf(DEMO[5]), "Our case");
  assert.equal(H.srcKey(DEMO[5]), "our");
  assert.equal(H.srcKey(DEMO[2]), "mbm");
  assert.equal(H.srcKey(DEMO[3]), "gen");
});

test("search needs every word; title and codes weigh most", () => {
  assert.deepEqual(H.search(DEMO, { q: "coolant" }).map((x) => x.f.id), ["recB", "recD"]);
  assert.deepEqual(H.search(DEMO, { q: "p0016 m274" }).map((x) => x.f.id), ["recC"]);
  assert.deepEqual(H.search(DEMO, { q: "coolant nothing-like-this" }), []);
  // inside one group, the better match comes first
  const r = H.search(DEMO, { q: "m274" }).filter((x) => x.rank === 0);
  assert.equal(r[0].f.id, "recA");
});

test("filters: source, model, verified only", () => {
  assert.deepEqual(H.search(DEMO, { source: "MBM forum" }).map((x) => x.f.id), ["recC"]);
  assert.deepEqual(H.search(DEMO, { model: "W205" }).map((x) => x.f.id), ["recA", "recC", "recB"]);
  assert.deepEqual(H.search(DEMO, { verifiedOnly: true }).map((x) => x.f.id), ["recA", "recE"]);
});

test("newest sort ignores the groups", () => {
  assert.deepEqual(H.search(DEMO, { sort: "new" }).map((x) => x.f.id), ["recA", "recB", "recE", "recC", "recD", "recF"]);
});

test("for a car: model series and engine from Vehicles", () => {
  const car = H.carFilter({ plate: "VDM 2841", makeModel: "Mercedes-Benz C200", engine: "M274 DE20", chassisNo: "WDD2050421F000001" });
  assert.deepEqual(car, { label: "VDM 2841 · Mercedes-Benz C200", series: "205", engine: "M274" });
  assert.deepEqual(H.search(DEMO, { car }).map((x) => x.f.id), ["recA", "recC", "recB"]);
  const glc = H.carFilter({ plate: "WXY 1", makeModel: "GLC 250d X253", engine: "OM651", chassisNo: "" });
  assert.deepEqual(H.search(DEMO, { car: glc }).map((x) => x.f.id), ["recE"]);
  // a car we know nothing about matches nothing (not everything)
  assert.deepEqual(H.search(DEMO, { car: H.carFilter({ plate: "ABC 1" }) }), []);
});

test("counts for the side rail", () => {
  const c = H.counts(DEMO);
  assert.equal(c.total, 6);
  assert.deepEqual(c.bySrc, { "Our case": 4, "MBM forum": 1, "General info": 1 });
  assert.equal(c.verified, 2);
  assert.equal(c.models.W205, 3);
  assert.deepEqual(H.top(c.codes, 2), [["P0016", 1], ["P0087", 1]]);
});

test("codes and chassis are read from free text", () => {
  assert.deepEqual(H.codesOf("p0302, P0087; 2B9A00-64 / hello"), ["P0302", "P0087", "2B9A00-64"]);
  assert.deepEqual(H.chassisList("C200 W205 and W213"), ["W205", "W213"]);
  assert.equal(H.chassisOf("C200 W205"), "W205");
  assert.equal(H.engineCode("om 651 de22"), "OM651");
});

test("values become chips, and text is never unescaped", () => {
  assert.equal(H.vals("keep at 13.5 V for 25 min"), 'keep at <span class="val">13.5 V</span> for <span class="val">25 min</span>');
  assert.equal(H.vals("spec 4.5–6.5 bar, 10Nm, 85,000 km"), 'spec <span class="val">4.5–6.5 bar</span>, <span class="val">10Nm</span>, <span class="val">85,000 km</span>');
  assert.equal(H.vals("W205 and P0302 and 2 files"), "W205 and P0302 and 2 files");
  const html = H.prose("## Spec\n- torque 10 Nm\n- <b>x</b>\n1. first\n2. second\nplain line", esc);
  assert.equal(html, '<h4>Spec</h4><ul><li>torque <span class="val">10 Nm</span></li><li>&lt;b&gt;x&lt;/b&gt;</li></ul><ol><li>first</li><li>second</li></ol><p>plain line</p>');
  assert.deepEqual(H.steps("1. Read faults\n\n- Check pressure\nDrive"), ["Read faults", "Check pressure", "Drive"]);
});

test("client view hides hours, job and plate; rounds mileage; never MBM", () => {
  const c = H.clientCopy(DEMO[0]);
  assert.equal(c.hours, null);
  assert.equal(c.jobId, "");
  assert.equal(c.plateKey, "");
  assert.equal(c.mileageKm, 85000);
  assert.equal(H.clientCopy(DEMO[2]), null);
  assert.deepEqual(H.maskVin("wdd2050421f000001"), { shown: "WDD2050421F", hidden: true });
  assert.equal(H.maskVin(""), null);
});

test("export has our cases only, with no plate, job or customer", () => {
  const out = H.exportCases(DEMO, "2026-11-23");
  assert.equal(out.cases.length, 4);
  assert.ok(out.cases.every((c) => !("plate" in c) && !("jobId" in c) && !("customer" in c)));
  assert.equal(out.cases[0].case_number, "ML-2026-0001");
  assert.equal(out.cases[0].model_series, "W205");
  assert.equal(out.cases[0].mileage, "85k km");
  assert.ok(!JSON.stringify(out).includes("Demo thread"));
  assert.ok(!JSON.stringify(out).includes("VDM2841"));
});
