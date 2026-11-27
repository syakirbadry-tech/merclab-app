// Reads supplier receipts and payment slips with Gemini, then cleans the
// answer. The AI only SUGGESTS: nothing is saved until the owner checks
// the form and presses Save.

const { round2, todayKL } = require("./pricing");

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

const PURCHASE_PROMPT = `You are reading a receipt, invoice or cash bill from a Malaysian car parts supplier, for a small car workshop. It may be printed or handwritten, in English, Malay or Chinese. Extract only what is written. Use null for anything you cannot read confidently. Never invent values.

- supplier: the shop/company that sold the parts (the name at the top).
- date: the receipt date as YYYY-MM-DD. Malaysian receipts write dates day first (19/11/26 = 2026-11-19).
- receiptNo: the receipt/invoice/bill number.
- items: every part line. For each:
  - name: the part name as written, cleaned up (e.g. "Oil filter").
  - partNo: the part number / code if shown, else null.
  - brand: the brand if shown (e.g. "Bosch", "Mann", "Genuine MB"), else null.
  - qty: quantity as a number (default 1 if not shown).
  - unitPrice: price for ONE unit after any line discount, as a number without "RM".
  - amount: the line total as a number.
- total: the final total paid, as a number.
Ignore lines that are not parts (e.g. "Rounding", "Total", "Cash", "Change").`;

const PURCHASE_SCHEMA = {
  type: "OBJECT",
  properties: {
    supplier: { type: "STRING", nullable: true },
    date: { type: "STRING", nullable: true },
    receiptNo: { type: "STRING", nullable: true },
    total: { type: "NUMBER", nullable: true },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", nullable: true },
          partNo: { type: "STRING", nullable: true },
          brand: { type: "STRING", nullable: true },
          qty: { type: "NUMBER", nullable: true },
          unitPrice: { type: "NUMBER", nullable: true },
          amount: { type: "NUMBER", nullable: true },
        },
      },
    },
  },
};

const PAYMENT_PROMPT = `You are reading proof of a payment received by a small Malaysian car workshop: a bank transfer slip, DuitNow / DuitNow QR screenshot, online banking receipt, e-wallet screenshot or a photo of a cheque. Extract only what is shown. Use null for anything not clearly visible. Never invent values.

- amount: the amount paid, as a number without "RM".
- date: the payment date as YYYY-MM-DD (Malaysian dates are day first).
- reference: the transaction / reference / receipt number.
- payerName: the name of the person or company who SENT the money (from / sender / payer), not the receiver.
- recipientNote: the payment description / recipient reference the payer typed, if any (e.g. "Q-2611-003" or "service BMW").
- method: exactly one of "Bank transfer", "DuitNow", "Card", "Cheque", "E-wallet", "Other".`;

const PAYMENT_SCHEMA = {
  type: "OBJECT",
  properties: {
    amount: { type: "NUMBER", nullable: true },
    date: { type: "STRING", nullable: true },
    reference: { type: "STRING", nullable: true },
    payerName: { type: "STRING", nullable: true },
    recipientNote: { type: "STRING", nullable: true },
    method: { type: "STRING", nullable: true },
  },
};

const METHODS = ["Bank transfer", "DuitNow", "Cash", "Card", "Cheque", "E-wallet", "Other"];

// Money the workshop PAID OUT (expenses): a bill, a receipt, or a transfer
// slip to a person such as a contract technician.
const EXPENSE_CATS = ["Rent", "Utilities", "Wages", "Workshop supplies", "Sublet (outside work)", "Parts for jobs (no stock)", "Tools & equipment (asset)", "Transport", "Marketing", "Phone & internet", "Bank fees", "Insurance & licences", "Owner drawings", "Other"];
const EXPENSE_PROMPT = `You are reading proof of money PAID OUT by a small Malaysian car workshop: a bill, a receipt or cash bill, or a bank transfer / DuitNow / e-wallet slip to a person or company (for example a contract technician, a landlord, a utility). Extract only what is shown. Use null for anything not clearly visible. Never invent values.

- paidTo: who RECEIVED the money. On a transfer slip this is the recipient / beneficiary / "to" name, NOT the bank and NOT the sender. On a bill or receipt it is the shop or company at the top.
- amount: the total paid, as a number without "RM".
- date: the payment or receipt date as YYYY-MM-DD (Malaysian dates are day first: 19/11/26 = 2026-11-19).
- description: a short note of what it was for, from the payment reference / recipient reference / items (e.g. "Aircond repair VDM2841", "TNB electricity"). Null if nothing is written.
- method: exactly one of "Bank transfer", "DuitNow", "Cash", "Card", "Cheque", "E-wallet", "Other".
- category: your best guess of exactly one of: ${EXPENSE_CATS.map((c) => `"${c}"`).join(", ")}. Payment to a technician or mechanic for work on a car is "Sublet (outside work)". Null if unsure.`;

const EXPENSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    paidTo: { type: "STRING", nullable: true },
    amount: { type: "NUMBER", nullable: true },
    date: { type: "STRING", nullable: true },
    description: { type: "STRING", nullable: true },
    method: { type: "STRING", nullable: true },
    category: { type: "STRING", nullable: true },
  },
};

// The AI normally answers in 5-20 seconds. Never leave the owner waiting forever:
// each try stops after this, and a slow first try gets one more go (the phone waits 2 minutes).
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 50000;

// Phones sometimes send a PDF or photo with no type, or a generic one.
const EXT_TYPES = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" };
function fileType(mimeType, filename) {
  const m = String(mimeType || "").toLowerCase();
  if (m && m !== "application/octet-stream" && m !== "binary/octet-stream") return m === "image/jpg" ? "image/jpeg" : m;
  const ext = String(filename || "").toLowerCase().split(".").pop();
  return EXT_TYPES[ext] || m || "application/octet-stream";
}
// Used when the set model name is not (or no longer) available.
const FALLBACK_MODEL = "gemini-flash-latest";

async function callGemini({ prompt, schema, base64, mimeType, filename, timeoutMs }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const err = new Error("The AI reader is not set up yet (GEMINI_API_KEY missing). Fill in the form by hand.");
    err.status = 503;
    throw err;
  }
  const type = fileType(mimeType, filename);
  const ask = async (model) => {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [...(base64 ? [{ inline_data: { mime_type: type, data: base64 } }] : []), { text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0 },
        }),
        signal: AbortSignal.timeout(timeoutMs || AI_TIMEOUT_MS),
      });
      return { res, body: await res.json().catch(() => ({})) };
    } catch (e) {
      const slow = e?.name === "TimeoutError" || e?.name === "AbortError";
      const err = new Error(slow ? "The AI took too long to read this file. Fill in the form by hand." : "Could not reach the AI reader. Fill in the form by hand.");
      err.status = slow ? 504 : 502;
      throw err;
    }
  };
  let res, body;
  try {
    ({ res, body } = await ask(MODEL));
  } catch (e) {
    // A slow answer is often just a busy moment: try once more on the quick model.
    if (e.status !== 504 || MODEL === FALLBACK_MODEL) throw e;
    console.warn(`AI model ${MODEL} was slow; trying ${FALLBACK_MODEL}`);
    ({ res, body } = await ask(FALLBACK_MODEL));
  }
  const why = (b) => String(b?.error?.message || "").slice(0, 300);
  if (!res.ok && MODEL !== FALLBACK_MODEL && (res.status === 404 || /model|not found|not supported/i.test(why(body)))) {
    console.warn(`AI model ${MODEL} refused (${res.status}: ${why(body)}); trying ${FALLBACK_MODEL}`);
    ({ res, body } = await ask(FALLBACK_MODEL));
  }
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!res.ok || !text) {
    const reason = why(body) || (body?.candidates?.[0]?.finishReason ? `stopped: ${body.candidates[0].finishReason}` : "") || (body?.promptFeedback?.blockReason ? `blocked: ${body.promptFeedback.blockReason}` : "");
    console.error(`AI read failed (HTTP ${res.status}, ${type})${reason ? ": " + reason : ""}`);
    const err = new Error(res.status === 429 ? "The AI is busy (too many requests). Try again in a minute, or fill in the form by hand." : `The AI could not read this file${reason ? ` (${reason.slice(0, 120)})` : ""}. Try a clearer photo, or fill in the form by hand.`);
    err.status = 502;
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error("The AI answer was not readable. Fill in the form by hand.");
    err.status = 502;
    throw err;
  }
}

// ---- cleaning: never trust the AI blindly ----

const str = (v, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v) => {
  const n = typeof v === "string" ? Number(v.replace(/[^0-9.\-]/g, "")) : Number(v);
  return Number.isFinite(n) && v !== null && v !== "" ? n : null;
};

function cleanDate(v, today = todayKL()) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + "T00:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
  if (v > today) return null; // receipts cannot be from the future
  if (v < "2000-01-01") return null;
  return v;
}

function cleanPurchase(raw, today) {
  const r = raw && typeof raw === "object" ? raw : {};
  const items = (Array.isArray(r.items) ? r.items : [])
    .map((it) => {
      const name = str(it?.name, 200);
      if (!name) return null;
      let qty = num(it.qty);
      if (!(qty > 0)) qty = 1;
      const ok = (n) => typeof n === "number" && n >= 0;
      let unitCost = num(it.unitPrice);
      const amount = num(it.amount);
      if (!ok(unitCost) && ok(amount)) unitCost = amount / qty;
      if (!ok(unitCost)) unitCost = null;
      return { name, partNo: str(it.partNo, 60), brand: str(it.brand, 60), qty: round2(qty), unitCost: unitCost === null ? null : round2(unitCost) };
    })
    .filter(Boolean)
    .slice(0, 60);
  const total = num(r.total);
  return {
    supplier: str(r.supplier, 120),
    date: cleanDate(r.date, today),
    receiptNo: str(r.receiptNo, 60),
    total: total !== null && total >= 0 ? round2(total) : null,
    items,
  };
}

function cleanPayment(raw, today) {
  const r = raw && typeof raw === "object" ? raw : {};
  const amount = num(r.amount);
  return {
    amount: amount !== null && amount > 0 ? round2(amount) : null,
    date: cleanDate(r.date, today),
    reference: str(r.reference, 80),
    payerName: str(r.payerName, 120),
    recipientNote: str(r.recipientNote, 200),
    method: METHODS.includes(r.method) ? r.method : "Bank transfer",
  };
}

async function readPurchase(file) {
  return cleanPurchase(await module.exports.callGemini({ prompt: PURCHASE_PROMPT, schema: PURCHASE_SCHEMA, ...file }));
}

async function readPayment(file) {
  return cleanPayment(await module.exports.callGemini({ prompt: PAYMENT_PROMPT, schema: PAYMENT_SCHEMA, ...file }));
}

function cleanExpense(raw, today) {
  const r = raw && typeof raw === "object" ? raw : {};
  const amount = num(r.amount);
  return {
    paidTo: str(r.paidTo, 120) || "",
    amount: amount !== null && amount > 0 ? round2(amount) : null,
    date: cleanDate(r.date, today) || "",
    description: str(r.description, 200) || "",
    method: METHODS.includes(r.method) ? r.method : "Bank transfer",
    category: EXPENSE_CATS.includes(r.category) ? r.category : "",
  };
}

async function readExpense(file) {
  return cleanExpense(await module.exports.callGemini({ prompt: EXPENSE_PROMPT, schema: EXPENSE_SCHEMA, ...file }));
}

// ---- Merc HUB: turn a technical document, forum post or own notes into
// searchable entries (symptom → codes → tests → cause → fix) ----

const HUB_KINDS = {
  "Our case": "the workshop's own notes or job records of cases it handled itself",
  "MBM forum": "a Mercedes-Benz Malaysia (MBM) technical forum post, technical tip or bulletin",
  "General info": "general Mercedes-Benz technical information (specifications, procedures, how a system works, known issues)",
};
const hubPrompt = (source) => `You are building a diagnosis reference library for a Mercedes-Benz workshop in Malaysia. The material below is ${HUB_KINDS[source] || HUB_KINDS["General info"]}. It may be a PDF, a screenshot, a photo of notes or pasted text, in English or Malay.

Split it into separate entries: one entry per separate problem, case, tip or topic (a forum page with 3 threads = 3 entries; one long procedure = 1 entry). At most 30 entries.
Write in clear English (translate Malay). Copy codes, part numbers, values and steps exactly. Use null when a field does not apply. Never invent anything that is not in the material.

For each entry:
- title: short, specific (e.g. "W205 M274: coolant loss, water pump seal").
- makeModel: model and chassis code as written (e.g. "C-Class W205", "GLC X253"), else null.
- engine: engine code (e.g. "M274", "OM651"), else null.
- symptom: what the driver or technician noticed.
- codes: fault codes / DTCs exactly as written, comma separated.
- tests: diagnostic steps and measurements, in order.
- cause: the root cause found.
- fix: the repair, remedy or procedure.
- parts: part names and part numbers used.
- details: any other useful information kept faithfully (specifications, torque values, capacities, conditions, notes, software versions). For general information, put the main content here.
- tags: a few comma-separated keywords (system, e.g. "cooling, engine").
- sourceRef: the thread, bulletin or document number / title / date if shown, else null.`;

const HUB_SCHEMA = {
  type: "OBJECT",
  properties: {
    entries: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: Object.fromEntries(["title", "makeModel", "engine", "symptom", "codes", "tests", "cause", "fix", "parts", "details", "tags", "sourceRef"].map((k) => [k, { type: "STRING", nullable: true }])),
      },
    },
  },
};
const HUB_LIMITS = { title: 120, makeModel: 80, engine: 40, symptom: 2000, codes: 2000, tests: 3000, cause: 2000, fix: 3000, parts: 1000, details: 20000, tags: 200, sourceRef: 200 };

function cleanHub(raw) {
  const list = Array.isArray(raw?.entries) ? raw.entries : [];
  return list.slice(0, 30).map((e) => {
    const o = {};
    for (const [k, max] of Object.entries(HUB_LIMITS)) o[k] = str(e?.[k], max) || "";
    if (!o.title) o.title = [o.makeModel, (o.symptom || o.details).split("\n")[0]].filter(Boolean).join(": ").slice(0, 120);
    return o;
  }).filter((o) => o.title && (o.symptom || o.cause || o.fix || o.details || o.tests));
}

// file = { base64, mimeType } or text = pasted words (or both).
async function readHub({ file, text, source }) {
  const pasted = typeof text === "string" && text.trim() ? `\n\nMATERIAL (pasted text):\n${text.trim().slice(0, 60000)}` : "";
  return cleanHub(await module.exports.callGemini({ prompt: hubPrompt(source) + pasted, schema: HUB_SCHEMA, ...(file || {}), timeoutMs: Number(process.env.AI_HUB_TIMEOUT_MS) || 100000 }));
}

module.exports = { MODEL, FALLBACK_MODEL, fileType, callGemini, readPurchase, readPayment, readExpense, readHub, cleanPurchase, cleanPayment, cleanExpense, cleanHub, cleanDate, METHODS, EXPENSE_CATS, HUB_KINDS, PURCHASE_SCHEMA, PAYMENT_SCHEMA, EXPENSE_SCHEMA, HUB_SCHEMA };
