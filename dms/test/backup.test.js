// Tests for the laptop backup (npm run backup) with a fake database, fake
// downloads and a temporary folder. Demo data only.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const B = require("../scripts/backup");

const NOW = new Date("2026-11-23T15:00:00Z"); // 23:00 in Kuala Lumpur
const noSleep = async () => {};

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "merclab-backup-test-"));
}

const att = (id, filename, url = `https://files.test/${id}`) => ({ id, url, filename, type: "image/jpeg", size: 3 });

function fakeDb() {
  const data = {
    customers: [{ id: "recCUST00000001", createdTime: "2026-01-01T00:00:00.000Z", fields: { Name: "Demo Customer", Phone: "0120000000" } }],
    vehicles: [{ id: "recVEH000000001", fields: { Plate: "VDM 2841", Photo: [att("attPHOTO1", "front.jpg")], "Condition photos": [att("attCOND1", "left side.jpg"), att("attCOND2", "a/b:c?.jpg")] } }],
    payments: [{ id: "recPAY000000001", fields: { Amount: 1234.5, Proof: [att("attSLIP1", "slip.pdf")] } }],
    faults: [{ id: "recHUB000000001", fields: { Title: "Demo fault", Files: [att("attHUB1", "guide.pdf"), att("attPHOTO1", "front.jpg")] } }],
    empty: [],
  };
  return { TABLES: Object.fromEntries(Object.keys(data).map((t) => [t, "tbl" + t])), list: async (t) => data[t].map((r) => ({ ...r, fields: { ...r.fields } })) };
}

const okFetch = (fail = new Set()) => async (url) => {
  const id = url.split("/").pop();
  if (fail.has(id)) return { ok: false, status: 404 };
  return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(`data-${id}`).buffer };
};

test("backup saves every table and every attached file", async () => {
  const root = tmpRoot();
  const r = await B.runBackup({ db: fakeDb(), fetchFn: okFetch(), root, now: NOW, sleep: noSleep });
  const day = path.join(root, "2026-11-23");
  assert.equal(r.folder, day);
  assert.deepEqual(r.tables, { customers: 1, vehicles: 1, payments: 1, faults: 1, empty: 0 });
  for (const t of Object.keys(r.tables)) assert.ok(fs.existsSync(path.join(day, "tables", `${t}.json`)), t);
  const customers = JSON.parse(fs.readFileSync(path.join(day, "tables", "customers.json"), "utf8"));
  assert.equal(customers[0].fields.Name, "Demo Customer");
  assert.equal(customers[0].createdTime, "2026-01-01T00:00:00.000Z");
  // 5 different files; the photo used twice is saved once.
  assert.equal(r.files.count, 5);
  assert.equal(r.errors.length, 0);
  const index = JSON.parse(fs.readFileSync(path.join(day, "files.json"), "utf8"));
  assert.equal(index.length, 5);
  for (const f of index) assert.equal(fs.readFileSync(path.join(day, f.path), "utf8"), `data-${f.id}`);
  assert.ok(index.some((f) => f.path === "files/payments/recPAY000000001/attSLIP1-slip.pdf"));
  assert.ok(index.some((f) => f.path === "files/faults/recHUB000000001/attHUB1-guide.pdf"));
  // Unsafe characters in a file name are replaced.
  assert.ok(index.some((f) => f.path === "files/vehicles/recVEH000000001/attCOND2-a_b_c_.jpg"));
  assert.ok(!fs.existsSync(path.join(root, "2026-11-23.partial")));
  assert.match(fs.readFileSync(path.join(root, "backup-log.txt"), "utf8"), /2026-11-23 {2}OK {2}tables=5 records=4 files=5/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("the folder date is the Kuala Lumpur date", async () => {
  const root = tmpRoot();
  const r = await B.runBackup({ db: fakeDb(), fetchFn: okFetch(), root, now: new Date("2026-11-23T16:30:00Z"), sleep: noSleep });
  assert.equal(path.basename(r.folder), "2026-11-24");
  fs.rmSync(root, { recursive: true, force: true });
});

test("keeps the last 30 days and touches nothing else in the folder", async () => {
  const root = tmpRoot();
  const keep = ["2026-10-25", "2026-11-01", "2026-11-22", "2026-11-23.partial", "My notes", "2025-01-01-copy"];
  const gone = ["2026-10-24", "2026-09-01", "2025-12-31", "2026-11-20.partial", "2026-11-21.replaced"];
  for (const d of [...keep, ...gone]) fs.mkdirSync(path.join(root, d));
  fs.writeFileSync(path.join(root, "2026-01-01"), "a file named like a date is not a backup folder");
  const removed = B.prune(root, "2026-11-23", 30);
  assert.deepEqual(removed, [...gone].sort());
  for (const d of keep) assert.ok(fs.existsSync(path.join(root, d)), `kept ${d}`);
  assert.ok(fs.existsSync(path.join(root, "2026-01-01")));
  fs.rmSync(root, { recursive: true, force: true });
});

test("a good backup removes old ones", async () => {
  const root = tmpRoot();
  fs.mkdirSync(path.join(root, "2026-10-01"));
  fs.mkdirSync(path.join(root, "2026-11-10"));
  const r = await B.runBackup({ db: fakeDb(), fetchFn: okFetch(), root, now: NOW, sleep: noSleep });
  assert.deepEqual(r.removedOldBackups, ["2026-10-01"]);
  assert.ok(!fs.existsSync(path.join(root, "2026-10-01")));
  assert.ok(fs.existsSync(path.join(root, "2026-11-10")));
  fs.rmSync(root, { recursive: true, force: true });
});

test("if a file fails, the error is listed and old backups are kept", async () => {
  const root = tmpRoot();
  fs.mkdirSync(path.join(root, "2026-10-01"));
  const r = await B.runBackup({ db: fakeDb(), fetchFn: okFetch(new Set(["attSLIP1"])), root, now: NOW, sleep: noSleep });
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].id, "attSLIP1");
  assert.equal(r.files.count, 4);
  assert.ok(fs.existsSync(path.join(root, "2026-10-01")), "old backup kept");
  const info = JSON.parse(fs.readFileSync(path.join(r.folder, "backup-info.json"), "utf8"));
  assert.equal(info.errors.length, 1);
  assert.match(fs.readFileSync(path.join(root, "backup-log.txt"), "utf8"), /WITH ERRORS/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("a flaky download is retried", async () => {
  const root = tmpRoot();
  let calls = 0;
  const flaky = async (url) => {
    if (url.endsWith("attHUB1") && calls++ < 2) throw new Error("network");
    return okFetch()(url);
  };
  const r = await B.runBackup({ db: fakeDb(), fetchFn: flaky, root, now: NOW, sleep: noSleep });
  assert.equal(r.errors.length, 0);
  assert.equal(r.files.count, 5);
  fs.rmSync(root, { recursive: true, force: true });
});

test("if the database fails, nothing is deleted and no backup is marked done", async () => {
  const root = tmpRoot();
  fs.mkdirSync(path.join(root, "2026-10-01"));
  const db = { ...fakeDb(), list: async () => { throw new Error("Database request failed (502)"); } };
  await assert.rejects(B.runBackup({ db, fetchFn: okFetch(), root, now: NOW, sleep: noSleep }), /502/);
  assert.ok(fs.existsSync(path.join(root, "2026-10-01")));
  assert.ok(!fs.existsSync(path.join(root, "2026-11-23")));
  fs.rmSync(root, { recursive: true, force: true });
});

test("running twice on one day replaces that day's backup", async () => {
  const root = tmpRoot();
  await B.runBackup({ db: fakeDb(), fetchFn: okFetch(), root, now: NOW, sleep: noSleep });
  fs.writeFileSync(path.join(root, "2026-11-23", "stale.txt"), "x");
  await B.runBackup({ db: fakeDb(), fetchFn: okFetch(), root, now: NOW, sleep: noSleep });
  assert.ok(!fs.existsSync(path.join(root, "2026-11-23", "stale.txt")));
  assert.ok(fs.existsSync(path.join(root, "2026-11-23", "backup-info.json")));
  assert.ok(!fs.existsSync(path.join(root, "2026-11-23.replaced")));
  fs.rmSync(root, { recursive: true, force: true });
});

test("refuses to save inside the code folder or at the top of a drive", async () => {
  await assert.rejects(B.runBackup({ db: fakeDb(), fetchFn: okFetch(), root: path.join(__dirname, "..", "backups"), now: NOW, sleep: noSleep }), /outside the code folder/);
  await assert.rejects(B.runBackup({ db: fakeDb(), fetchFn: okFetch(), root: path.parse(os.tmpdir()).root, now: NOW, sleep: noSleep }), /top of a drive/);
});

test(".env reader: comments, quotes, and the environment wins", () => {
  const root = tmpRoot();
  const file = path.join(root, ".env");
  fs.writeFileSync(file, "# demo\r\nAIRTABLE_PAT=\"patDEMO.123\"\r\nAIRTABLE_BASE_ID = appDEMO\nBACKUP_DIR='D:\\Demo Backups'\nnot a line\n");
  const env = { AIRTABLE_BASE_ID: "appFROMENV" };
  assert.equal(B.readEnvFile(file, env), true);
  assert.deepEqual(env, { AIRTABLE_PAT: "patDEMO.123", AIRTABLE_BASE_ID: "appFROMENV", BACKUP_DIR: "D:\\Demo Backups" });
  assert.equal(B.readEnvFile(path.join(root, "missing.env"), {}), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test("safe file names and attachment detection", () => {
  assert.equal(B.safeName('in<v>oice:1/2?.pdf'), "in_v_oice_1_2_.pdf");
  assert.equal(B.safeName("trailing. "), "trailing");
  assert.equal(B.safeName(""), "file");
  assert.equal(B.isAttachmentList([att("a", "x.jpg")]), true);
  assert.equal(B.isAttachmentList(["recABC"]), false);
  assert.equal(B.isAttachmentList([]), false);
  assert.equal(B.isAttachmentList({ id: "a", url: "u", filename: "f" }), false);
});
