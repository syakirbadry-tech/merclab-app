// One-click backup to this computer: every DMS table as JSON, plus every
// attached file (supplier receipts, payment slips, photos, Merc HUB files).
//
//   npm run backup
//
// Reads AIRTABLE_PAT and AIRTABLE_BASE_ID from dms/.env (git-ignored; never
// commit it). Saves to "E:\The Merc Lab Backups\<yyyy-mm-dd>\" (Kuala Lumpur
// date), or to BACKUP_DIR if that is set. After a backup with no errors it
// deletes dated backup folders older than 30 days, only inside that folder.
// The backup holds customer data: keep it on this computer, never in the repo.

const fs = require("node:fs");
const path = require("node:path");
const { todayKL, addDays } = require("../server/pricing");

const DMS_DIR = path.join(__dirname, "..");
const REPO_DIR = path.join(DMS_DIR, "..");
const DEFAULT_ROOT = "E:\\The Merc Lab Backups";
const KEEP_DAYS = 30;
const PARALLEL_DOWNLOADS = 4;
// A finished backup is "2026-11-23". While it is being written it is
// "2026-11-23.partial"; an older copy of the same day is briefly ".replaced".
const FOLDER_RE = /^(\d{4}-\d{2}-\d{2})(\.partial|\.replaced)?$/;

// Minimal .env reader (KEY=value, # comments, optional quotes). Values already
// in the environment win, so a scheduled task can override them.
function readEnvFile(file, env = process.env) {
  if (!fs.existsSync(file)) return false;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (env[m[1]] === undefined || env[m[1]] === "") env[m[1]] = v;
  }
  return true;
}

// Airtable attachment fields come back as [{ id, url, filename, ... }].
function isAttachmentList(v) {
  return Array.isArray(v) && v.length > 0 && v.every((a) => a && typeof a === "object" && typeof a.id === "string" && typeof a.url === "string" && "filename" in a);
}

// A file name that is safe on Windows.
function safeName(name) {
  const s = String(name || "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "").trim().slice(0, 120);
  return s || "file";
}

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry a few times with a growing wait (Airtable allows 5 calls a second).
async function withRetry(fn, { tries = 4, sleep = realSleep } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (i < tries - 1) await sleep(1000 * 2 ** i);
    }
  }
  throw last;
}

function insideRepo(dir) {
  const rel = path.relative(path.resolve(REPO_DIR), path.resolve(dir));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// Delete dated backup folders older than keepDays (today counts as day 1),
// plus leftovers of failed runs from earlier days. Only folders directly in
// root whose name is a date are ever touched; links are never followed.
function prune(root, today, keepDays = KEEP_DAYS) {
  const oldest = addDays(today, -(keepDays - 1));
  const removed = [];
  for (const name of fs.readdirSync(root)) {
    const m = name.match(FOLDER_RE);
    if (!m) continue;
    const full = path.join(root, name);
    const st = fs.lstatSync(full);
    if (!st.isDirectory() || st.isSymbolicLink()) continue;
    const tooOld = m[1] < oldest;
    const leftover = m[2] && m[1] < today;
    if (tooOld || leftover) {
      fs.rmSync(full, { recursive: true, force: true });
      removed.push(name);
    }
  }
  return removed.sort();
}

async function runBackup({ db, fetchFn = fetch, root = DEFAULT_ROOT, now = new Date(), keepDays = KEEP_DAYS, sleep = realSleep, log = () => {} }) {
  if (!root || path.parse(path.resolve(root)).root === path.resolve(root)) throw new Error("Choose a backup folder, not the top of a drive.");
  if (insideRepo(root)) throw new Error("The backup folder must be outside the code folder (the repo is public).");
  const day = todayKL(now);
  fs.mkdirSync(root, { recursive: true });
  const work = path.join(root, `${day}.partial`);
  const final = path.join(root, day);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(path.join(work, "tables"), { recursive: true });

  const info = { madeAt: now.toISOString(), day, tables: {}, files: { count: 0, bytes: 0 }, errors: [], removedOldBackups: [] };

  // 1. Every table.
  const attachments = new Map();
  for (const table of Object.keys(db.TABLES)) {
    log(`Table ${table}...`);
    const records = await withRetry(() => db.list(table), { sleep });
    const rows = records.map((r) => ({ id: r.id, createdTime: r.createdTime, fields: r.fields }));
    fs.writeFileSync(path.join(work, "tables", `${table}.json`), JSON.stringify(rows, null, 1));
    info.tables[table] = rows.length;
    for (const r of rows) {
      for (const [field, v] of Object.entries(r.fields || {})) {
        if (!isAttachmentList(v)) continue;
        for (const a of v) if (!attachments.has(a.id)) attachments.set(a.id, { table, record: r.id, field, att: a });
      }
    }
  }

  // 2. Every attached file, a few at a time. Airtable file links expire after
  // a couple of hours, so this runs straight after reading the tables.
  const index = [];
  const queue = [...attachments.values()];
  log(`${queue.length} files to save...`);
  async function worker() {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const { table, record, field, att } = item;
      const rel = path.join("files", table, record, `${att.id}-${safeName(att.filename)}`);
      try {
        const buf = await withRetry(async () => {
          const res = await fetchFn(att.url, { signal: AbortSignal.timeout(120000) });
          if (!res.ok) throw new Error(`download failed (${res.status})`);
          return Buffer.from(await res.arrayBuffer());
        }, { sleep });
        fs.mkdirSync(path.join(work, path.dirname(rel)), { recursive: true });
        fs.writeFileSync(path.join(work, rel), buf);
        info.files.count++;
        info.files.bytes += buf.length;
        index.push({ table, record, field, id: att.id, filename: att.filename, type: att.type || "", size: buf.length, path: rel.split(path.sep).join("/") });
      } catch (err) {
        info.errors.push({ table, record, field, id: att.id, filename: att.filename, error: err.message });
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL_DOWNLOADS }, worker));
  index.sort((a, b) => a.path.localeCompare(b.path));
  fs.writeFileSync(path.join(work, "files.json"), JSON.stringify(index, null, 1));

  // 3. Make it the backup for today (replacing an earlier run of the same day).
  fs.writeFileSync(path.join(work, "backup-info.json"), JSON.stringify(info, null, 1));
  if (fs.existsSync(final)) {
    const old = path.join(root, `${day}.replaced`);
    fs.rmSync(old, { recursive: true, force: true });
    fs.renameSync(final, old);
    fs.renameSync(work, final);
    fs.rmSync(old, { recursive: true, force: true });
  } else {
    fs.renameSync(work, final);
  }

  // 4. Old backups go only after a fully good one.
  if (!info.errors.length) {
    info.removedOldBackups = prune(root, day, keepDays);
    fs.writeFileSync(path.join(final, "backup-info.json"), JSON.stringify(info, null, 1));
  }

  const tablesN = Object.keys(info.tables).length;
  const recordsN = Object.values(info.tables).reduce((s, n) => s + n, 0);
  const line = `${new Date().toISOString()}  ${day}  ${info.errors.length ? "WITH ERRORS" : "OK"}  tables=${tablesN} records=${recordsN} files=${info.files.count} MB=${(info.files.bytes / 1048576).toFixed(1)} failed=${info.errors.length} removed=${info.removedOldBackups.length}`;
  fs.appendFileSync(path.join(root, "backup-log.txt"), line + "\n");
  return { ...info, folder: final, summary: line };
}

async function main() {
  readEnvFile(path.join(DMS_DIR, ".env"));
  if (!process.env.AIRTABLE_PAT || !process.env.AIRTABLE_BASE_ID) {
    console.error("Backup stopped: AIRTABLE_PAT and AIRTABLE_BASE_ID are missing. Put them in dms/.env (see README, 'Backup to this computer').");
    process.exit(2);
  }
  const db = require("../server/airtable"); // reads the env, so load it after .env
  const root = process.env.BACKUP_DIR || DEFAULT_ROOT;
  try {
    const r = await runBackup({ db, root, log: (m) => console.log(m) });
    console.log(`\nSaved to ${r.folder}\n${r.summary}`);
    if (r.errors.length) {
      console.error(`${r.errors.length} file(s) could not be saved; see backup-info.json. Old backups were kept.`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`Backup failed: ${err.message}. Old backups were kept.`);
    try {
      fs.mkdirSync(root, { recursive: true });
      fs.appendFileSync(path.join(root, "backup-log.txt"), `${new Date().toISOString()}  FAILED  ${err.message}\n`);
    } catch {}
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { runBackup, prune, readEnvFile, safeName, isAttachmentList, withRetry, DEFAULT_ROOT, KEEP_DAYS };
