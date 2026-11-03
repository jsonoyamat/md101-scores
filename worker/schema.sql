-- MD 101 score portal: D1 schema.
-- npx wrangler d1 execute md101 --file schema.sql --remote

-- One row per student. record = the student's JSON record (name, scores, rubric, notes) with NO mobile number.
-- mobile_hmac = hex HMAC-SHA256(SERVER_SECRET, normalized mobile number).
CREATE TABLE IF NOT EXISTS students (
  no          TEXT PRIMARY KEY,
  mobile_hmac TEXT NOT NULL,
  record      TEXT NOT NULL
);

-- Rate-limit counters. id = "no:<student number>" or "ip:<address>"; fixed 15-minute windows.
CREATE TABLE IF NOT EXISTS attempts (
  id       TEXT PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
