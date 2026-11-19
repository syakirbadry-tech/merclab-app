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

async function callGemini({ prompt, schema, base64, mimeType }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const err = new Error("The AI reader is not set up yet (GEMINI_API_KEY missing). Fill in the form by hand.");
    err.status = 503;
    throw err;
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0 },
    }),
  });
  const body = await res.json().catch(() => ({}));
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!res.ok || !text) {
    const err = new Error("The AI could not read this file. Try a clearer photo, or fill in the form by hand.");
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

module.exports = { MODEL, callGemini, readPurchase, readPayment, cleanPurchase, cleanPayment, cleanDate, METHODS, PURCHASE_SCHEMA, PAYMENT_SCHEMA };
