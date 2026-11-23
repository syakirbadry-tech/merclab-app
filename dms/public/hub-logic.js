// Merc HUB: search, ranking and text helpers. No screen code here, so the
// same file runs in the browser (window.MLHub) and in the tests (require).
// Works on the fault entries exactly as /api/faults returns them; no new fields.
(function (root, factory) {
  const M = factory();
  if (typeof module === "object" && module.exports) module.exports = M;
  else root.MLHub = M;
})(typeof self !== "undefined" ? self : this, function () {
  const SOURCES = ["Our case", "MBM forum", "General info"];
  const SRC_KEY = { "Our case": "our", "MBM forum": "mbm", "General info": "gen" };
  const srcOf = (f) => (SOURCES.includes(f && f.source) ? f.source : "Our case");
  const srcKey = (f) => SRC_KEY[srcOf(f)];

  // Result groups, best first: our verified > MBM > our unverified > general.
  const GROUPS = ["Our verified fixes", "MBM forum", "Our cases, not verified yet", "General information"];
  function rankOf(f) {
    const s = srcOf(f);
    if (s === "Our case") return f.verified ? 0 : 2;
    return s === "MBM forum" ? 1 : 3;
  }

  // Chassis codes (W205, X253…) and fault codes (P0302, 2B9A00-64…).
  // C200, S500, A250, R350 are model names, not chassis codes.
  const MODEL_NAME = /^([ACS]\d\d0|R(280|300|320|350|500))$/;
  const chassisList = (s) => [...new Set((String(s || "").toUpperCase().match(/\b[WXCRSAVH]\d{3}\b/g) || []).filter((c) => !MODEL_NAME.test(c)))];
  const chassisOf = (s) => chassisList(s).pop() || ""; // last match: "C200 W205" → W205
  const codesOf = (s) => [...new Set(String(s || "").toUpperCase().split(/[\s,;/|]+/).filter((c) => /^[PBCU][0-9A-F]{4}(-[0-9A-F]{2,3})?$/.test(c) || /^[0-9A-F]{4,6}-[0-9A-F]{2,3}$/.test(c)))];
  const chassisOfEntry = (f) => chassisList(`${f.makeModel || ""} ${f.title || ""}`);
  const engineCode = (s) => (String(s || "").toUpperCase().match(/\b(?:OM|M)\s?\d{3}\b/) || [""])[0].replace(/\s/, "");

  // Search: every word must be found. Title and codes weigh most.
  const FIELDS = [["topicNo", 3], ["title", 3], ["codes", 3], ["functionGroup", 1], ["symptom", 2], ["makeModel", 2], ["engine", 2], ["cause", 1], ["fix", 1], ["tests", 1], ["parts", 1], ["tags", 1], ["details", 1], ["sourceRef", 1]];
  const words = (q) => String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
  function score(f, ws) {
    if (!ws.length) return 0;
    let total = 0;
    for (const w of ws) {
      let best = 0;
      for (const [k, wt] of FIELDS) if (String(f[k] || "").toLowerCase().includes(w)) best = Math.max(best, wt);
      if (!best) return -1;
      total += best;
    }
    return total;
  }

  // A car from Vehicles → its model series (digits, so W205 / S205 / C205 all
  // match "205") and engine, like XENTRY's vehicle definition.
  function carFilter(v) {
    if (!v) return null;
    const ch = chassisOf(v.makeModel);
    const digits = ch ? ch.slice(1) : /^WDD|^WDC|^WDB|^W1K|^W1N|^W1V|^WDF/i.test(v.chassisNo || "") ? String(v.chassisNo).slice(3, 6) : "";
    return { label: [v.plate, v.makeModel].filter(Boolean).join(" · "), series: /^\d{3}$/.test(digits) ? digits : "", engine: engineCode(v.engine) };
  }
  function fitsCar(f, car) {
    if (!car) return true;
    if (car.series && !chassisOfEntry(f).some((c) => c.slice(1) === car.series)) return false;
    const e = engineCode(f.engine);
    if (car.engine && e && e !== car.engine) return false;
    return !!(car.series || car.engine);
  }

  // opts: { q, source, model, verifiedOnly, car, sort: "best" | "new" }
  function search(faults, opts = {}) {
    const ws = words(opts.q);
    const out = [];
    for (const f of faults || []) {
      const src = srcOf(f);
      if (opts.source && src !== opts.source) continue;
      if (opts.model && !chassisOfEntry(f).includes(opts.model)) continue;
      if (opts.verifiedOnly && !(src === "Our case" && f.verified)) continue;
      if (opts.car && !fitsCar(f, opts.car)) continue;
      const s = score(f, ws);
      if (s < 0) continue;
      out.push({ f, rank: rankOf(f), score: s });
    }
    const byDate = (a, b) => String(b.f.date || "").localeCompare(String(a.f.date || ""));
    if (opts.sort === "new") out.sort(byDate);
    else out.sort((a, b) => a.rank - b.rank || b.score - a.score || byDate(a, b));
    return out;
  }

  function groups(list) {
    const g = GROUPS.map((label, rank) => ({ label, rank, items: [] }));
    for (const x of list) g[x.rank].items.push(x);
    return g.filter((x) => x.items.length);
  }

  function counts(faults) {
    const bySrc = Object.fromEntries(SOURCES.map((s) => [s, 0]));
    const models = {};
    const codes = {};
    let verified = 0;
    for (const f of faults || []) {
      const s = srcOf(f);
      bySrc[s] += 1;
      if (s === "Our case" && f.verified) verified += 1;
      for (const c of chassisOfEntry(f)) models[c] = (models[c] || 0) + 1;
      for (const c of codesOf(f.codes)) codes[c] = (codes[c] || 0) + 1;
    }
    return { total: (faults || []).length, bySrc, verified, models, codes };
  }
  const top = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);

  // Values such as 13.5 V, 4.5–6.5 bar, 10 Nm, 85,000 km become chips.
  // Input must already be HTML-escaped.
  const NUM = "\\d[\\d,]*(?:\\.\\d+)?";
  // (no look-behind: older iPhones do not support it)
  const VAL_RE = new RegExp(`(^|[^\\w.])(${NUM}(?:\\s?[–-]\\s?${NUM})?\\s?(?:mV|V|A|bar|kPa|Nm|km|ml|L|°C|%|min|rpm|mm|kW|Ω|h|s))(?![\\w])`, "g");
  const vals = (escaped) => String(escaped).replace(VAL_RE, (m, pre, v) => `${pre}<span class="val">${v}</span>`);

  // Plain text → light formatting: "- " bullets, "1. " steps, "## " headings.
  function prose(text, esc) {
    const out = [];
    let list = null;
    const close = () => { if (list) { out.push(`<${list.tag}>${list.items.join("")}</${list.tag}>`); list = null; } };
    for (const raw of String(text || "").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) { close(); continue; }
      let m;
      if ((m = line.match(/^#{1,4}\s+(.*)$/))) { close(); out.push(`<h4>${vals(esc(m[1]))}</h4>`); continue; }
      const tag = /^[-•*]\s+/.test(line) ? "ul" : /^\d+[.)]\s+/.test(line) ? "ol" : "";
      if (tag) {
        if (!list || list.tag !== tag) { close(); list = { tag, items: [] }; }
        list.items.push(`<li>${vals(esc(line.replace(/^([-•*]|\d+[.)])\s+/, "")))}</li>`);
        continue;
      }
      close();
      out.push(`<p>${vals(esc(line))}</p>`);
    }
    close();
    return out.join("");
  }

  // One line per step (numbering and bullets removed).
  const steps = (text) => String(text || "").split(/\r?\n/).map((l) => l.trim().replace(/^([-•*]|\d+[.)])\s+/, "")).filter(Boolean);

  // Structured tests and remedies; older entries fall back to their text.
  const splitParts = (s) => String(s || "").split(/\r?\n|;|,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean);
  function testsOf(f) {
    if (Array.isArray(f.testSteps) && f.testSteps.length) return { structured: true, list: f.testSteps };
    return { structured: false, list: steps(f.tests).map((check) => ({ check, spec: "", measured: "", then: "" })) };
  }
  function remediesOf(f) {
    if (Array.isArray(f.remedies) && f.remedies.length) return { structured: true, list: f.remedies };
    const st = steps(f.fix);
    const parts = splitParts(f.parts);
    if (!st.length && !parts.length) return { structured: false, list: [] };
    return { structured: false, list: [{ label: "A", title: "", when: "", steps: st, parts: parts.map((name) => ({ name, part_no: "", qty: null })), no_parts: "" }] };
  }
  // Function groups (short pick-list; free text is allowed too).
  const FUNCTION_GROUPS = ["Engine · fuel system", "Engine · ignition", "Engine · cooling", "Engine · lubrication", "Engine · air intake and turbo", "Engine · timing and camshaft", "Exhaust and emissions", "Transmission", "Electrical · starting and charging", "Electrical · network (CAN)", "Body electronics", "Brakes", "Suspension and steering", "Climate control", "Infotainment and cameras", "Safety (SRS)", "Body and trim"];

  // What a paying member would see later: no hours, no job, chassis no. cut
  // to its first 11 characters, mileage rounded to 5,000 km. MBM never.
  const roundKm = (km) => (Number(km) > 0 ? Math.round(Number(km) / 5000) * 5000 : null);
  const maskVin = (vin) => { const v = String(vin || "").trim().toUpperCase(); return v ? { shown: v.slice(0, 11), hidden: v.length > 11 } : null; };
  function clientCopy(f) {
    if (srcOf(f) === "MBM forum") return null;
    return { ...f, hours: null, jobId: "", docNo: "", plateKey: "", mileageKm: roundKm(f.mileageKm) };
  }

  // "Export our cases": only Our case entries, without names, plates or prices.
  function exportCases(faults, today) {
    const ours = (faults || []).filter((f) => srcOf(f) === "Our case");
    return {
      hub: "Merc HUB", version: 1, format: "Workshop Diagnostic Network cases", source: "The Merc Lab", exported: today,
      cases: ours.map((f, i) => ({
        case_number: f.topicNo || `ML-${String(today).slice(0, 4)}-${String(i + 1).padStart(4, "0")}`,
        case_date: String(f.date || "").slice(0, 4), vehicle_model: f.makeModel, model_series: chassisOf(`${f.makeModel} ${f.title}`), engine: f.engine,
        mileage: f.mileageKm ? `${Math.floor(f.mileageKm / 5000) * 5}k km` : "", fault_codes: codesOf(f.codes).join(", "), symptom: f.symptom,
        diagnosis_steps: f.tests, root_cause: f.cause, fix_applied: f.fix, parts_used: f.parts, time_spent_hours: f.hours,
        status: f.verified ? "Resolved" : "Open", notes: f.tags,
      })),
    };
  }

  return { FUNCTION_GROUPS, testsOf, remediesOf, splitParts, SOURCES, GROUPS, srcOf, srcKey, rankOf, chassisList, chassisOf, chassisOfEntry, codesOf, engineCode, words, score, carFilter, fitsCar, search, groups, counts, top, vals, prose, steps, roundKm, maskVin, clientCopy, exportCases };
});
