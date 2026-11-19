// Workshop extras: service packages, fault cases, check-in, inspection
// checklist (with a client page), and the customer's online approval of an
// estimate.

const db = require("./airtable");
const M = require("./money");
const P = require("./pricing");
const { esc } = require("./template");

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
  return fields;
}

// ---------- fault cases ----------

const FAULT_TEXT = { title: ["Title", 120], docNo: ["Doc no", 20], makeModel: ["Make model", 80], engine: ["Engine", 40], symptom: ["Symptom", 2000], codes: ["Fault codes", 2000], tests: ["Tests done", 3000], cause: ["Root cause", 2000], fix: ["Fix", 3000], parts: ["Parts used", 1000], tags: ["Tags", 200] };

function faultOut(r) {
  const f = r.fields;
  const o = { id: r.id, date: f.Date || "", jobId: f["Job record"] || "", plateKey: f["Plate key"] || "", mileageKm: f["Mileage km"] ?? null, hours: f.Hours ?? null, verified: !!f.Verified };
  for (const [k, [name]] of Object.entries(FAULT_TEXT)) o[k] = f[name] || "";
  return o;
}

function faultFields(b) {
  const fields = {};
  for (const [k, [name, max]] of Object.entries(FAULT_TEXT)) if (k in b) fields[name] = text(b[k], max);
  if ("jobId" in b) fields["Job record"] = isRec(b.jobId) ? b.jobId : "";
  if ("plate" in b) fields["Plate key"] = plateKey(b.plate);
  if ("date" in b) fields.Date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : P.todayKL();
  if ("verified" in b) fields.Verified = b.verified === true;
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
    const row = (await db.list("quotes")).find((r) => r.fields["Link token"] === token);
    if (!row) return res.status(404).json({ error: "Not found" });
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
    if (!fields.Symptom && !fields.Title) throw bad("Write the symptom (what the customer noticed).");
    if (!fields.Title) fields.Title = `${fields["Make model"] || "Car"}: ${fields.Symptom.split("\n")[0]}`.slice(0, 120);
    const [row] = await db.create("faults", [fields]);
    res.status(201).json(faultOut(row));
  }));
  router.patch("/faults/:id", wrap(async (req, res) => {
    if (!isRec(req.params.id)) throw bad("Unknown fault case.");
    await db.get("faults", req.params.id);
    const [row] = await db.update("faults", [{ id: req.params.id, fields: faultFields(req.body || {}) }]);
    res.json(faultOut(row));
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

module.exports = { register, inspectionPage, addApproval, approveRoute, packageOut, faultOut, cleanInspection, FUEL };
