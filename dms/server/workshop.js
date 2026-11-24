// Workshop extras: service packages, fault cases, check-in, inspection
// checklist (with a client page), and the customer's online approval of an
// estimate.

const db = require("./airtable");
const M = require("./money");
const P = require("./pricing");
const { esc } = require("./template");
const { noteFail } = require("./auth");
const ai = require("./ai");

const text = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const isRec = (id) => /^rec[A-Za-z0-9]{14}$/.test(id || "");
const isAtt = (id) => /^att[A-Za-z0-9]{14}$/.test(id || "");
const parseJson = (s, d) => {
  try {
    const v = JSON.parse(s || "");
    return v ?? d;
  } catch {
    return d;
  }
};
const plateKey = (p) => String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);

// ---------- packages ----------

function packageOut(r) {
  const f = r.fields;
  return {
    id: r.id,
    name: f.Name || "",
    request: f.Request || "",
    lines: parseJson(f["Lines JSON"], []),
    active: !!f.Active,
    setsService: !!f["Sets next service"],
    fits: fitsList(f["Fits models"]),
    notes: f.Notes || "",
  };
}

function packageFields(b, partial) {
  const fields = {};
  if (!partial || "name" in b) {
    const name = text(b.name, 80);
    if (!name) throw bad("Package name is needed.");
    fields.Name = name;
  }
  if (!partial || "request" in b || "lines" in b) {
    const [g] = M.cleanGroups([{ request: b.request, lines: b.lines }]);
    fields.Request = g.request;
    fields["Lines JSON"] = JSON.stringify(g.lines);
  }
  if ("active" in b) fields.Active = b.active === true;
  if ("setsService" in b) fields["Sets next service"] = b.setsService === true;
  if ("notes" in b) fields.Notes = text(b.notes, 1000);
  if ("fits" in b) {
    const raw = Array.isArray(b.fits) ? b.fits.join(",") : String(b.fits || "");
    const list = fitsList(raw);
    const badCode = raw.split(/[,;\n]+/).map((c) => c.trim()).filter(Boolean).find((c) => !list.includes(c.replace(/[^0-9]/g, "")));
    if (badCode) throw bad(`"${badCode}" is not a model code. Use 3 digits for a model (177 = W177) or 7 digits for one variant (1770542 = A45 S).`);
    fields["Fits models"] = list.join(", ");
  }
  return fields;
}

// Models a package fits, from the chassis number: characters 4-6 are the model (177 = W177),
// 7-10 the variant (0542 = A45 S). "177" fits every W177, "1770542" only that variant.
function fitsList(v) {
  return [...new Set(String(v || "").split(/[,;\n]+/).map((c) => c.replace(/[^0-9]/g, "")).filter((c) => c.length === 3 || c.length === 7))].slice(0, 30);
}

// ---------- fault cases ----------

// Merc HUB entries come from three sources. Only "Our case" entries can ever
// be exported (MBM forum material is MBM's and stays private).
const FAULT_TEXT = { title: ["Title", 120], docNo: ["Doc no", 20], makeModel: ["Make model", 80], engine: ["Engine", 40], symptom: ["Symptom", 2000], codes: ["Fault codes", 2000], tests: ["Tests done", 3000], cause: ["Root cause", 2000], fix: ["Fix", 3000], parts: ["Parts used", 1000], tags: ["Tags", 200], sourceRef: ["Source ref", 200], details: ["Details", 20000], functionGroup: ["Function group", 80] };
const SOURCES = ["Our case", "MBM forum", "General info"];

// Topic numbers for easy tracking: MLH-0001 our cases, MBM-0001 forum,
// GEN-0001 general info. Given once when an entry is made and never changed
// (not even if its source changes later), so a number always means one entry.
const TOPIC_PREFIX = { "Our case": "MLH", "MBM forum": "MBM", "General info": "GEN" };
const TOPIC_RE = /^(MLH|MBM|GEN)-(\d{4,})$/;
function nextTopicNos(existing, sources) {
  const max = {};
  for (const t of existing) {
    const m = TOPIC_RE.exec(String(t || ""));
    if (m) max[m[1]] = Math.max(max[m[1]] || 0, Number(m[2]));
  }
  return sources.map((s) => {
    const p = TOPIC_PREFIX[s] || "MLH";
    max[p] = (max[p] || 0) + 1;
    return `${p}-${String(max[p]).padStart(4, "0")}`;
  });
}
// Structured tests and remedies (HUB-DATA-MODEL.md), kept as JSON text:
//   tests:    [{ check, spec, measured, then }] in order
//   remedies: [{ label: "A", title, when, steps: [..], parts: [{ name, part_no, qty }], no_parts: "none" | "depends" | "" }]
// The plain text fields (Tests done, Fix, Parts used) are written from them
// too, so search, the Assistant, export and Fault cases keep working.
const s300 = (v, n = 300) => (typeof v === "string" ? v.trim().slice(0, n) : typeof v === "number" ? String(v) : "");
function cleanTests(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 30).map((t) => ({ check: s300(t?.check), spec: s300(t?.spec, 80), measured: s300(t?.measured, 80), then: s300(t?.then, 120) })).filter((t) => t.check || t.spec || t.measured || t.then);
}
function cleanRemedies(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 5).map((r) => ({
    title: s300(r?.title, 160),
    when: s300(r?.when, 160),
    steps: (Array.isArray(r?.steps) ? r.steps : []).map((x) => s300(x, 500)).filter(Boolean).slice(0, 20),
    parts: (Array.isArray(r?.parts) ? r.parts : []).map((x) => {
      const q = Number(x?.qty);
      return { name: s300(x?.name, 120), part_no: s300(x?.part_no, 40), qty: Number.isFinite(q) && q > 0 && q < 1000 ? q : null };
    }).filter((x) => x.name || x.part_no).slice(0, 30),
    no_parts: ["none", "depends"].includes(r?.no_parts) ? r.no_parts : "",
  })).filter((r) => r.title || r.steps.length || r.parts.length).map((r, i) => ({ label: "ABCDE"[i], ...r }));
}
const testsText = (tests) => tests.map((t, i) => `${i + 1}. ${[t.check, t.spec && `Spec ${t.spec}`, t.measured && `Measured ${t.measured}`].filter(Boolean).join(" · ")}${t.then ? ` → ${t.then}` : ""}`).join("\n");
const fixText = (rems) => rems.map((r) => [`${r.label}: ${r.title || "Remedy"}${r.when ? ` (${r.when})` : ""}`, ...r.steps.map((x) => `- ${x}`)].join("\n")).join("\n");
const partsText = (rems) => rems.flatMap((r) => (r.parts.length ? r.parts.map((x) => `${x.name}${x.part_no ? ` (${x.part_no})` : ""}${x.qty ? ` x${x.qty}` : ""}`) : r.no_parts === "none" ? [`${r.label}: no parts needed`] : [])).join("; ");

// New HUB fields. Until the owner adds them in Airtable, entries still save
// without them, and the reply says which ones are missing.
const NEW_FAULT_FIELDS = ["Topic no", "Function group", "Tests JSON", "Remedies JSON"];
function unknownField(err) {
  if (!/unknown field/i.test(err?.message || "")) return "";
  return NEW_FAULT_FIELDS.find((n) => err.message.toLowerCase().includes(n.toLowerCase())) || "";
}
async function writeFaults(write, rows) {
  const missing = [];
  for (;;) {
    try {
      const saved = await write(rows);
      return { saved, missing };
    } catch (err) {
      const name = unknownField(err);
      if (!name || missing.includes(name)) throw err;
      missing.push(name);
      rows = rows.map((r) => { const { [name]: _, ...rest } = r; return rest; });
    }
  }
}
async function createFaults(rows) {
  const existing = (await db.list("faults")).map((r) => r.fields["Topic no"]);
  const nos = nextTopicNos(existing, rows.map((f) => f.Source));
  return writeFaults((list) => db.create("faults", list), rows.map((f, i) => ({ ...f, "Topic no": nos[i] })));
}

function faultOut(r) {
  const f = r.fields;
  const src = f.Source?.name || f.Source;
  const o = { id: r.id, topicNo: f["Topic no"] || "", date: f.Date || "", jobId: f["Job record"] || "", plateKey: f["Plate key"] || "", mileageKm: f["Mileage km"] ?? null, hours: f.Hours ?? null, verified: !!f.Verified, source: SOURCES.includes(src) ? src : "Our case" };
  for (const [k, [name]] of Object.entries(FAULT_TEXT)) o[k] = f[name] || "";
  o.files = (Array.isArray(f.Files) ? f.Files : []).map((a) => ({ url: a.url, name: a.filename || "File", type: a.type || "" }));
  o.testSteps = cleanTests(parseJson(f["Tests JSON"], []));
  o.remedies = cleanRemedies(parseJson(f["Remedies JSON"], []));
  return o;
}

function faultFields(b) {
  const fields = {};
  for (const [k, [name, max]] of Object.entries(FAULT_TEXT)) if (k in b) fields[name] = text(b[k], max);
  if ("source" in b) {
    if (!SOURCES.includes(b.source)) throw bad("Choose where this came from: Our case, MBM forum or General info.");
    fields.Source = b.source;
  }
  if ("jobId" in b) fields["Job record"] = isRec(b.jobId) ? b.jobId : "";
  if ("plate" in b) fields["Plate key"] = plateKey(b.plate);
  if ("date" in b) fields.Date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : P.todayKL();
  if ("verified" in b) fields.Verified = b.verified === true;
  if ("testSteps" in b) {
    const t = cleanTests(b.testSteps);
    fields["Tests JSON"] = t.length ? JSON.stringify(t) : "";
    if (t.length || !("tests" in b)) fields["Tests done"] = testsText(t);
  }
  if ("remedies" in b) {
    const r = cleanRemedies(b.remedies);
    fields["Remedies JSON"] = r.length ? JSON.stringify(r) : "";
    if (r.length || !("fix" in b)) fields.Fix = fixText(r);
    if (r.length || !("parts" in b)) fields["Parts used"] = partsText(r);
  }
  for (const [k, f, max] of [["mileageKm", "Mileage km", 3000000], ["hours", "Hours", 500]]) {
    if (!(k in b)) continue;
    if (b[k] === "" || b[k] === null) fields[f] = null;
    else {
      const n = Number(b[k]);
      if (!(n >= 0 && n <= max)) throw bad(`${f} must be a number.`);
      fields[f] = k === "hours" ? Math.round(n * 10) / 10 : Math.round(n);
    }
  }
  return fields;
}

// ---------- check-in & inspection ----------

const FUEL = ["E", "1/4", "1/2", "3/4", "F"];
const STATUS = ["ok", "soon", "now", "na", ""];

function cleanCheckin(b, prev = {}) {
  return {
    ...prev,
    fuel: FUEL.includes(b.fuel) ? b.fuel : prev.fuel || "",
    items: "items" in b ? text(b.items, 500) : prev.items || "",
    keys: "keys" in b ? text(b.keys, 60) : prev.keys || "",
    notes: "notes" in b ? text(b.notes, 1000) : prev.notes || "",
    at: prev.at || new Date().toISOString(),
  };
}

function cleanInspection(b) {
  if (!Array.isArray(b.items)) throw bad("The checklist is empty.");
  const items = b.items.slice(0, 80).map((it) => ({
    key: text(it.key, 40).replace(/[^a-z0-9_-]/gi, ""),
    group: text(it.group, 40),
    label: text(it.label, 80),
    status: STATUS.includes(it.status) ? it.status : "",
    value: text(it.value, 40),
    note: text(it.note, 300),
    photoIds: (Array.isArray(it.photoIds) ? it.photoIds : []).filter(isAtt).slice(0, 6),
  })).filter((it) => it.key && it.label);
  return { items, summary: text(b.summary, 1000), by: text(b.by, 60), at: new Date().toISOString() };
}

// ---------- client page: inspection report ----------

const ST = {
  now: { label: "Needs attention now", short: "Now", color: "#b91c1c", bg: "#fdecec" },
  soon: { label: "Needs attention soon", short: "Soon", color: "#b45309", bg: "#fdf3e2" },
  ok: { label: "Checked and OK", short: "OK", color: "#15803d", bg: "#e6f6ec" },
};

function inspectionPage(job, company) {
  const ins = job.inspection || { items: [] };
  const items = ins.items.filter((i) => i.status && i.status !== "na");
  const order = { now: 0, soon: 1, ok: 2 };
  items.sort((a, b) => order[a.status] - order[b.status]);
  const count = (s) => items.filter((i) => i.status === s).length;
  const date = ins.at ? new Date(new Date(ins.at).getTime() + 8 * 3600e3).toISOString().slice(0, 10).split("-").reverse().join("/") : "";
  const card = (i) => {
    const s = ST[i.status];
    const imgs = (i.photoIds || []).map((id) => job.photos[id]).filter(Boolean)
      .map((p) => `<a href="${esc(p.url)}" target="_blank" rel="noopener"><img src="${esc(p.thumb)}" alt="Photo: ${esc(i.label)}" loading="lazy"></a>`).join("");
    return `<div class="it"><div class="h"><span class="b" style="background:${s.bg};color:${s.color}"><i style="background:${s.color}"></i>${s.short}</span><b>${esc(i.label)}</b>${i.value ? `<span class="v">${esc(i.value)}</span>` : ""}</div>
      ${i.note ? `<p>${esc(i.note)}</p>` : ""}${imgs ? `<div class="ph">${imgs}</div>` : ""}</div>`;
  };
  const section = (s) => (count(s) ? `<h2 style="color:${ST[s].color}">${ST[s].label} (${count(s)})</h2>${items.filter((i) => i.status === s).map(card).join("")}` : "");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Inspection report ${esc(job.plate)}</title>
<style>
body{margin:0;background:#f3f5f9;color:#0f172a;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
.w{max-width:720px;margin:0 auto;padding:16px}
.top{background:#0b1324;color:#fff;padding:18px 16px}.top .w{padding:0 16px}
.top b{font-size:18px}.top div{color:#aab6cc;font-size:14px}
.car{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin-top:-4px}
.car h1{font-size:20px;margin:0 0 4px}.plate{display:inline-block;border:1.5px solid #0f172a;border-radius:5px;padding:0 7px;font-weight:700;font-size:14px;letter-spacing:.04em}
.sum{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}
.sum div{border-radius:10px;padding:10px;text-align:center;font-size:13px;font-weight:600}.sum b{display:block;font-size:24px}
h2{font-size:16px;margin:22px 0 8px}
.it{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;margin-bottom:8px}
.it .h{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.it .v{margin-left:auto;color:#334155;font-weight:600;font-variant-numeric:tabular-nums}
.b{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;padding:2px 9px;border-radius:99px}.b i{width:7px;height:7px;border-radius:50%}
.it p{margin:6px 0 0;color:#334155;font-size:15px}.ph{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.ph img{width:96px;height:96px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0}
.note{background:#fff;border-left:4px solid #1d4ed8;padding:10px 14px;border-radius:8px;margin:14px 0}
.f{color:#64748b;font-size:13px;margin:24px 0 40px}
</style></head><body>
<div class="top"><div class="w"><b>${esc(company.brandName || "The Merc Lab")}</b><div>Vehicle inspection report${date ? " · " + date : ""}</div></div></div>
<div class="w">
<div class="car"><h1>${esc(job.car || "Your car")}</h1><span class="plate">${esc(job.plate)}</span>${job.mileageKm ? ` &nbsp;${Number(job.mileageKm).toLocaleString("en-MY")} km` : ""}</div>
<div class="sum"><div style="background:${ST.now.bg};color:${ST.now.color}"><b>${count("now")}</b>Now</div><div style="background:${ST.soon.bg};color:${ST.soon.color}"><b>${count("soon")}</b>Soon</div><div style="background:${ST.ok.bg};color:${ST.ok.color}"><b>${count("ok")}</b>OK</div></div>
${ins.summary ? `<div class="note">${esc(ins.summary)}</div>` : ""}
${section("now")}${section("soon")}${section("ok")}
${items.length ? "" : "<p>The inspection is not finished yet.</p>"}
<p class="f">Prices for any work are on your estimate. Questions? Call ${esc(company.hotline || company.tel || "us")}.<br>${esc(company.legalName || "")}</p>
</div></body></html>`;
}

// Panel added to the client's estimate page: approve online, or see that it is approved.
function approvalPanel(job, token) {
  const insp = job.inspectionToken && job.inspection?.items?.length ? `<a class="lk" href="/d/${esc(job.inspectionToken)}">See the inspection report</a>` : "";
  if (job.approvedAt) {
    const when = new Date(new Date(job.approvedAt).getTime() + 8 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
    return `<div class="ap"><div class="ok">Approved by ${esc(job.approvedName)} on ${esc(when.split(" ")[0].split("-").reverse().join("/"))} ${esc(when.split(" ")[1])}. Thank you.</div>${insp}</div>`;
  }
  if (job.invoiceNo || job.status === "Cancelled") return insp ? `<div class="ap">${insp}</div>` : "";
  return `<div class="ap" id="ap"><b>Happy with this estimate?</b>
<form id="apf"><input id="apn" placeholder="Your name" aria-label="Your name" required minlength="2" maxlength="80" autocomplete="name"><button>Approve estimate</button></form>
<small>By approving, you ask us to do the work listed. ${insp}</small></div>
<script>(function(){var f=document.getElementById("apf");f.onsubmit=function(e){e.preventDefault();var b=f.querySelector("button");b.disabled=true;b.textContent="Sending…";
fetch(location.pathname+"/approve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:document.getElementById("apn").value})}).then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d}})})
.then(function(x){if(!x.ok)throw new Error(x.d.error||"Please try again.");document.getElementById("ap").innerHTML='<div class="ok">Approved. Thank you, we will start the work.</div>'})
.catch(function(err){b.disabled=false;b.textContent="Approve estimate";alert(err.message)})}})();</script>`;
}

const APPROVAL_CSS = `<style>@media print{.ap{display:none}}.ap{max-width:760px;margin:0 auto 14px;background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:14px 16px;font:15px/1.4 Arial,sans-serif;color:#0f172a;box-sizing:border-box}
.ap form{display:flex;gap:8px;margin:10px 0 6px;flex-wrap:wrap}.ap input{flex:1;min-width:180px;font:16px Arial,sans-serif;padding:11px 12px;border:1px solid #94a3b8;border-radius:9px}
.ap button{font:700 16px Arial,sans-serif;padding:11px 18px;border:0;border-radius:9px;background:#15803d;color:#fff;cursor:pointer}.ap small{color:#475569}
.ap .ok{color:#15803d;font-weight:700}.ap .lk{display:inline-block;margin-top:6px;color:#1d4ed8;font-weight:600}</style>`;

function addApproval(html, job, token) {
  const panel = approvalPanel(job, token);
  return panel ? html.replace('<div class="sheet" id="sheet">', `${APPROVAL_CSS}${panel}<div class="sheet" id="sheet">`) : html;
}

// Public: POST /d/:token/approve
async function approveRoute(req, res, { jobOut }) {
  res.setHeader("Cache-Control", "no-store");
  const token = req.params.token;
  if (!/^q[a-f0-9]{32}$/.test(token)) return res.status(404).json({ error: "Not found" });
  try {
    const found = await db.findOne("quotes", "Link token", token);
    const row = found && found.fields["Link token"] === token ? found : null;
    if (!row) {
      noteFail("ap:" + (req.ip || "x"));
      return res.status(404).json({ error: "Not found" });
    }
    const j = jobOut(row);
    if (j.status === "Cancelled") return res.status(400).json({ error: "This estimate was cancelled. Please contact the workshop." });
    if (j.invoiceNo || j.approvedAt) return res.json({ ok: true, already: true });
    const name = text(req.body?.name, 80);
    if (name.length < 2) return res.status(400).json({ error: "Please type your name." });
    const fields = { "Approved at": new Date().toISOString(), "Approved name": name };
    if (!j.stage || j.stage === "Booked") fields.Stage = "In workshop";
    await db.update("quotes", [{ id: j.id, fields }]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[approve]", err.message);
    res.status(500).json({ error: "Could not save. Please try again." });
  }
}

function register(router, { wrap, oneFile, fileOf, bodyData, jobOut, newToken }) {
  const getJob = async (id) => {
    if (!isRec(id)) throw bad("Unknown job.");
    return jobOut(await db.get("quotes", id));
  };

  // Packages
  router.get("/packages", wrap(async (req, res) => {
    const list = (await db.list("packages")).map(packageOut).sort((a, b) => a.name.localeCompare(b.name));
    res.json({ packages: list });
  }));
  router.post("/packages", wrap(async (req, res) => {
    const [row] = await db.create("packages", [{ Active: true, ...packageFields(req.body || {}, false) }]);
    res.status(201).json(packageOut(row));
  }));
  router.patch("/packages/:id", wrap(async (req, res) => {
    if (!isRec(req.params.id)) throw bad("Unknown package.");
    await db.get("packages", req.params.id);
    const [row] = await db.update("packages", [{ id: req.params.id, fields: packageFields(req.body || {}, true) }]);
    res.json(packageOut(row));
  }));

  // Fault cases
  router.get("/faults", wrap(async (req, res) => {
    const list = (await db.list("faults")).map(faultOut).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    res.json({ faults: list });
  }));
  router.post("/faults", wrap(async (req, res) => {
    const b = req.body || {};
    const fields = faultFields({ date: "", ...b });
    if (!fields.Symptom && !fields.Title && !fields.Details) throw bad("Write the symptom (what the customer noticed).");
    if (!fields.Title) fields.Title = `${fields["Make model"] || "Car"}: ${(fields.Symptom || fields.Details).split("\n")[0]}`.slice(0, 120);
    if (!fields.Source) fields.Source = "Our case";
    const { saved: [row], missing } = await createFaults([fields]);
    res.status(201).json({ ...faultOut(row), missingFields: missing });
  }));
  router.patch("/faults/:id", wrap(async (req, res) => {
    if (!isRec(req.params.id)) throw bad("Unknown fault case.");
    await db.get("faults", req.params.id);
    const { saved: [row], missing } = await writeFaults((list) => db.update("faults", list.map((fields) => ({ id: req.params.id, fields }))), [faultFields(req.body || {})]);
    res.json({ ...faultOut(row), missingFields: missing });
  }));

  // Merc HUB import, step 1: the AI reads a document, screenshot, photo of
  // notes or pasted text and splits it into entries. Nothing is saved here:
  // the owner checks the list first.
  router.post("/faults/read", oneFile, wrap(async (req, res) => {
    const d = bodyData(req);
    const source = SOURCES.includes(d.source) ? d.source : "General info";
    const file = fileOf(req);
    const pasted = text(d.text, 60000);
    if (!file && !pasted) throw bad("Choose a file (PDF, screenshot or photo) or paste the text.");
    let entries;
    try {
      entries = await ai.readHub({ file, text: pasted, source });
    } catch (err) {
      return res.status([503, 504].includes(err.status) ? err.status : 502).json({ error: err.message });
    }
    if (!entries.length) throw bad("The AI found nothing to add in this. Try a clearer file, or paste the text.", 422);
    res.json({ source, entries });
  }));

  // Step 2: save the entries the owner kept (at most 30 at once).
  router.post("/faults/bulk", wrap(async (req, res) => {
    const b = req.body || {};
    if (!SOURCES.includes(b.source)) throw bad("Choose where this came from: Our case, MBM forum or General info.");
    const list = Array.isArray(b.entries) ? b.entries.slice(0, 30) : [];
    if (!list.length) throw bad("Nothing to save. Tick at least one entry.");
    const keys = ["title", "makeModel", "engine", "symptom", "codes", "tests", "cause", "fix", "parts", "details", "tags", "sourceRef", "functionGroup"];
    const rows = list.map((e) => {
      const picked = Object.fromEntries(keys.filter((k) => typeof e?.[k] === "string").map((k) => [k, e[k]]));
      if (!picked.sourceRef && typeof b.sourceRef === "string") picked.sourceRef = b.sourceRef;
      const fields = faultFields({ ...picked, source: b.source, date: /^\d{4}-\d{2}-\d{2}$/.test(e?.date || "") ? e.date : "" });
      if (!fields.Title) throw bad("Every entry needs a title.");
      return fields;
    });
    const { saved, missing } = await createFaults(rows);
    res.status(201).json({ faults: saved.map(faultOut), missingFields: missing });
  }));

  // Give topic numbers to entries made before numbers existed, oldest first.
  router.post("/faults/number-old", wrap(async (req, res) => {
    const all = await db.list("faults");
    const todo = all.filter((r) => !TOPIC_RE.test(String(r.fields["Topic no"] || "")))
      .sort((a, b) => String(a.fields.Date || "").localeCompare(String(b.fields.Date || "")) || String(a.createdTime || "").localeCompare(String(b.createdTime || "")) || a.id.localeCompare(b.id));
    if (!todo.length) return res.json({ numbered: 0 });
    const src = (r) => { const v = r.fields.Source?.name || r.fields.Source; return SOURCES.includes(v) ? v : "Our case"; };
    const nos = nextTopicNos(all.map((r) => r.fields["Topic no"]), todo.map(src));
    try {
      await db.update("faults", todo.map((r, i) => ({ id: r.id, fields: { "Topic no": nos[i] } })));
    } catch (err) {
      if (unknownField(err)) throw bad('Add the "Topic no" field (single line text) to the faults table in Airtable first.');
      throw err;
    }
    res.json({ numbered: todo.length });
  }));

  // Keep the original document / screenshot with the entry.
  router.post("/faults/:id/file", oneFile, wrap(async (req, res) => {
    if (!isRec(req.params.id)) throw bad("Unknown entry.");
    const file = fileOf(req);
    if (!file) throw bad("Choose the file.");
    await db.get("faults", req.params.id);
    await db.upload("faultFiles", req.params.id, { filename: file.filename, contentType: file.mimeType, base64: file.base64 });
    res.json(faultOut(await db.get("faults", req.params.id)));
  }));

  // A photo for a job (odometer, inspection). Returns its id.
  router.post("/jobs/:id/photo", oneFile, wrap(async (req, res) => {
    const j = await getJob(req.params.id);
    const file = fileOf(req);
    if (!file || !file.mimeType.startsWith("image/")) throw bad("Please choose a photo (JPG or PNG).");
    const up = await db.upload("jobPhotos", j.id, { filename: `${(j.plate || "job").replace(/\W/g, "")}-${Date.now()}.jpg`, contentType: file.mimeType, base64: file.base64 });
    const a = up?.attachment;
    if (!a?.id) throw bad("The photo did not save. Please try again.", 502);
    res.status(201).json({ id: a.id, url: a.url, thumb: a.thumbnails?.large?.url || a.url });
  }));

  router.post("/jobs/:id/checkin", oneFile, wrap(async (req, res) => {
    const j = await getJob(req.params.id);
    const checkin = cleanCheckin(bodyData(req), j.checkin || {});
    const file = fileOf(req);
    if (file) {
      if (!file.mimeType.startsWith("image/")) throw bad("The odometer photo must be a picture.");
      const up = await db.upload("jobPhotos", j.id, { filename: `odometer-${Date.now()}.jpg`, contentType: file.mimeType, base64: file.base64 });
      if (up?.attachment?.id) checkin.odoPhotoId = up.attachment.id;
    }
    const [row] = await db.update("quotes", [{ id: j.id, fields: { "Check-in JSON": JSON.stringify(checkin) } }]);
    res.json(jobOut(row));
  }));

  router.put("/jobs/:id/inspection", wrap(async (req, res) => {
    const j = await getJob(req.params.id);
    const ins = cleanInspection(req.body || {});
    const fields = { "Inspection JSON": JSON.stringify(ins) };
    if (!j.inspectionToken) fields["Inspection token"] = newToken("h");
    const [row] = await db.update("quotes", [{ id: j.id, fields }]);
    res.json(jobOut(row));
  }));
}

module.exports = { nextTopicNos, register, inspectionPage, addApproval, approveRoute, packageOut, faultOut, cleanInspection, FUEL };
