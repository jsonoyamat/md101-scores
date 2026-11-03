// MD 101 score portal API — Cloudflare Worker + D1.
//
// POST /api/scores  { "no": "<student number>", "code": "<mobile number>" }
//   200  the student's record JSON (no mobile number in it)
//   401  generic "no match" (same response whether or not the student exists)
//   429  too many attempts (8 per student number, 40 per IP, per 15 minutes), with Retry-After
//
// Secrets / bindings:
//   SERVER_SECRET    wrangler secret put SERVER_SECRET   (HMAC key for mobile numbers; never in the repo)
//   DB               D1 binding (see wrangler.toml)
//   ALLOWED_ORIGINS  comma-separated list, default https://jsonoyamat.github.io

const WINDOW_SECONDS = 15 * 60;
const LIMIT_PER_NO = 8;
const LIMIT_PER_IP = 40;
const NO_MATCH = "No record matches that student number and mobile number.";
const DUMMY_HMAC = "0".repeat(64);
const enc = new TextEncoder();

export function normalizeNo(v) {
  return String(v ?? "").trim().toUpperCase();
}

export function normalizeMobile(v) {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("63")) d = "0" + d.slice(2);
  return d;
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time comparison of two hex strings (every byte is always examined).
function safeEqual(a, b) {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0, n = Math.max(x.length, y.length); i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// Count one attempt against `id` inside a fixed 15-minute window; returns { count, reset_at }.
async function countAttempt(db, id, now) {
  return db
    .prepare(
      `INSERT INTO attempts (id, count, reset_at) VALUES (?1, 1, ?2)
       ON CONFLICT(id) DO UPDATE SET
         count    = CASE WHEN attempts.reset_at <= ?3 THEN 1  ELSE attempts.count + 1 END,
         reset_at = CASE WHEN attempts.reset_at <= ?3 THEN ?2 ELSE attempts.reset_at  END
       RETURNING count, reset_at`
    )
    .bind(id, now + WINDOW_SECONDS, now)
    .first();
}

function corsHeaders(env, origin) {
  const allowed = String(env.ALLOWED_ORIGINS || "https://jsonoyamat.github.io").split(",").map((s) => s.trim()).filter(Boolean);
  const h = { Vary: "Origin" };
  if (origin && allowed.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(env, origin);
    const reply = (status, body, extra = {}) =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...cors, ...extra },
      });

    if (url.pathname !== "/api/scores") return reply(404, { error: "Not found." });
    if (origin && !cors["Access-Control-Allow-Origin"]) return reply(403, { error: "Origin not allowed." });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply(405, { error: "Method not allowed." }, { Allow: "POST, OPTIONS" });
    if (!env.SERVER_SECRET || !env.DB) return reply(500, { error: "The score service is not configured yet." });

    let body;
    try {
      if (Number(request.headers.get("Content-Length") || 0) > 2048) throw new Error("too large");
      body = await request.json();
    } catch {
      return reply(400, { error: "Invalid request." });
    }
    const no = normalizeNo(body?.no);
    const code = normalizeMobile(body?.code);
    if (!no || no.length > 32 || code.length < 10 || code.length > 15) return reply(401, { error: NO_MATCH });

    // Rate limit before touching the student table, so a locked-out number learns nothing more.
    const now = Math.floor(Date.now() / 1000);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const [byNo, byIp] = await Promise.all([countAttempt(env.DB, "no:" + no, now), countAttempt(env.DB, "ip:" + ip, now)]);
    const overNo = byNo.count > LIMIT_PER_NO, overIp = byIp.count > LIMIT_PER_IP;
    if (overNo || overIp) {
      const wait = Math.max(1, overNo ? byNo.reset_at - now : 0, overIp ? byIp.reset_at - now : 0);
      return reply(429, { error: "Too many attempts. Wait a few minutes and try again.", retry_after: wait }, { "Retry-After": String(wait) });
    }

    // Occasionally clear out expired attempt rows.
    if (Math.random() < 0.02) ctx.waitUntil(env.DB.prepare("DELETE FROM attempts WHERE reset_at < ?1").bind(now - 86400).run());

    const row = await env.DB.prepare("SELECT mobile_hmac, record FROM students WHERE no = ?1").bind(no).first();
    const given = await hmacHex(env.SERVER_SECRET, code);
    const matches = safeEqual(given, row ? row.mobile_hmac : DUMMY_HMAC);
    if (!row || !matches) return reply(401, { error: NO_MATCH });
    return reply(200, row.record);
  },
};
