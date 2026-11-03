#!/usr/bin/env node
// Load the private student records into D1.
//
//   node import.mjs <portal_records.json> [--local] [--secret-file <path>] [--db md101]
//
// <portal_records.json> is the PRIVATE file written by ~/Desktop/MD101/tools/build_portal.py
// (in Class Records/Portal Codes, never in this repo): { "students": [ { "no", "mobile", "record" } ] }.
//
// The secret is read from $SERVER_SECRET, else from --secret-file, else from
// ~/Desktop/MD101/Class Records/Portal Codes/server_secret.txt. It must be the same value given to
// `npx wrangler secret put SERVER_SECRET`.
//
// Mobile numbers never leave this machine: only HMAC-SHA256(secret, mobile) is uploaded, and the
// temporary SQL file is deleted after the upload.

import { readFileSync, writeFileSync, rmSync, mkdtempSync, existsSync } from "node:fs";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const input = args.find((a, i) => !a.startsWith("--") && !(i > 0 && ["--secret-file", "--db"].includes(args[i - 1])));
if (!input) { console.error("usage: node import.mjs <portal_records.json> [--local] [--secret-file <path>] [--db md101]"); process.exit(2); }

const normalizeNo = (v) => String(v ?? "").trim().toUpperCase();
const normalizeMobile = (v) => { let d = String(v ?? "").replace(/\D/g, ""); if (d.length === 12 && d.startsWith("63")) d = "0" + d.slice(2); return d; };
const sql = (s) => "'" + String(s).replace(/'/g, "''") + "'";

const secretFile = opt("--secret-file", join(homedir(), "Desktop/MD101/Class Records/Portal Codes/server_secret.txt"));
const secret = (process.env.SERVER_SECRET || (existsSync(secretFile) ? readFileSync(secretFile, "utf8") : "")).trim();
if (secret.length < 32) { console.error(`SERVER_SECRET missing or too short (set $SERVER_SECRET or create ${secretFile}).`); process.exit(2); }

const data = JSON.parse(readFileSync(input, "utf8"));
const students = Array.isArray(data) ? data : data.students;
if (!Array.isArray(students) || !students.length) { console.error("No students found in " + input); process.exit(2); }

const rows = [], skipped = [];
for (const s of students) {
  const no = normalizeNo(s.no), mobile = normalizeMobile(s.mobile ?? s.key ?? s.code);
  if (!no || mobile.length < 10 || mobile.length > 15) { skipped.push(no || "(blank)"); continue; }
  const record = { ...(s.record || {}) };
  for (const k of ["mobile", "key", "code", "contact", "phone"]) delete record[k];   // never upload the number
  if (JSON.stringify(record).includes(mobile)) throw new Error(`record for ${no} still contains the mobile number`);
  rows.push({ no, hmac: createHmac("sha256", secret).update(mobile).digest("hex"), record: JSON.stringify(record) });
}
if (!rows.length) { console.error("Nothing to import."); process.exit(1); }

// Upsert every row, then drop students no longer on the list (no window where the table is empty).
const statements = rows.map((r) => `INSERT OR REPLACE INTO students (no, mobile_hmac, record) VALUES (${sql(r.no)}, ${sql(r.hmac)}, ${sql(r.record)});`);
statements.push(`DELETE FROM students WHERE no NOT IN (${rows.map((r) => sql(r.no)).join(", ")});`);

const dir = mkdtempSync(join(tmpdir(), "md101-import-"));
const file = join(dir, "students.sql");
try {
  writeFileSync(file, statements.join("\n") + "\n", { mode: 0o600 });
  const target = flag("--local") ? "--local" : "--remote";
  execFileSync("npx", ["wrangler", "d1", "execute", opt("--db", "md101"), target, "--file", file, "--yes"], { cwd: here, stdio: "inherit" });
  console.log(`imported ${rows.length} students into D1 (${target.slice(2)})` + (skipped.length ? `; skipped (no usable mobile number): ${skipped.join(", ")}` : ""));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
