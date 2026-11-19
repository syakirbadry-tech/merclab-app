// Small Airtable client for the Merc Lab DMS base. The token stays on the
// server (environment variable); the browser only talks to our own /api.
// Records come back keyed by FIELD NAME (Airtable's default).

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const PAT = process.env.AIRTABLE_PAT;
const API = "https://api.airtable.com/v0";
const CONTENT = "https://content.airtable.com/v0";

const TABLES = {
  settings: "tbl1cLARYdb9kajVM",
  purchases: "tblrVyapvADRRcwFx",
  parts: "tblPWyEAdMoVMQkok",
  customers: "tblVVfLjjWJAEU2qV",
  quotes: "tblwjVJuJARYbfYhl",
  payments: "tblhz031eVXvVZdcd",
  vehicles: "tbl7WHw77Y0IKsHHf",
  packages: "tblET3exu2ZWkx3QK",
  faults: "tblWpQd8poWDX9TtM",
  interactions: "tblWL55adp7Uglt4d",
  bookings: "tbl4o2AYhv5elFmjw",
};

// Attachment fields need their field ID for the upload endpoint.
const ATTACHMENT_FIELDS = {
  purchaseReceipt: "fldO6AgBLw6GO3WB7",
  paymentProof: "fldHikqbP4WNVKXZu",
  settingsQr: "fldvowTv1iG6o6XQu",
  vehiclePhoto: "fldrRYcQvqpjaDMNU",
  conditionPhotos: "fldqm0WfL8ftbOvzD",
  jobPhotos: "flduOq0QvNrKmv0JP",
};

async function request(path, options = {}) {
  if (!BASE_ID || !PAT) {
    const err = new Error("The database is not connected yet (AIRTABLE_BASE_ID / AIRTABLE_PAT missing).");
    err.status = 500;
    throw err;
  }
  const res = await fetch(`${API}/${BASE_ID}/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json", ...options.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error?.message || `Database request failed (${res.status})`);
    err.status = res.status === 404 ? 404 : 502;
    throw err;
  }
  return body;
}

async function list(table, { fields } = {}) {
  const qs = new URLSearchParams();
  (fields || []).forEach((f) => qs.append("fields[]", f));
  let offset;
  let out = [];
  do {
    if (offset) qs.set("offset", offset);
    const data = await request(`${TABLES[table]}?${qs}`);
    out = out.concat(data.records);
    offset = data.offset;
  } while (offset);
  return out;
}

async function get(table, id) {
  return request(`${TABLES[table]}/${id}`);
}

// Airtable takes at most 10 records per write.
async function create(table, fieldsList) {
  const out = [];
  for (let i = 0; i < fieldsList.length; i += 10) {
    const chunk = fieldsList.slice(i, i + 10).map((fields) => ({ fields }));
    const data = await request(TABLES[table], { method: "POST", body: JSON.stringify({ records: chunk, typecast: true }) });
    out.push(...data.records);
  }
  return out;
}

async function update(table, updates) {
  const out = [];
  for (let i = 0; i < updates.length; i += 10) {
    const chunk = updates.slice(i, i + 10);
    const data = await request(TABLES[table], { method: "PATCH", body: JSON.stringify({ records: chunk, typecast: true }) });
    out.push(...data.records);
  }
  return out;
}

async function upload(fieldKey, recordId, { filename, contentType, base64 }) {
  const res = await fetch(`${CONTENT}/${BASE_ID}/${recordId}/${ATTACHMENT_FIELDS[fieldKey]}/uploadAttachment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ contentType, filename, file: base64 }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body?.error?.message || `File upload failed (${res.status})`);
    err.status = 502;
    throw err;
  }
  // The answer holds the record's attachments in that field (keyed by field
  // ID); the new file is the last one.
  const body = await res.json().catch(() => ({}));
  const files = body?.fields?.[ATTACHMENT_FIELDS[fieldKey]];
  return { attachment: Array.isArray(files) && files.length ? files[files.length - 1] : null };
}

// Exported as one object so tests can swap in an in-memory version.
module.exports = { TABLES, ATTACHMENT_FIELDS, list, get, create, update, upload };
