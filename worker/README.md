# MD 101 score API (Cloudflare Worker + D1)

`POST /api/scores` with `{ "no": "<student number>", "code": "<mobile number>" }` returns that one student's record, a generic 401 on any mismatch, or 429 with `Retry-After` after 8 attempts per student number or 40 per IP in 15 minutes. Only `https://jsonoyamat.github.io` may call it from a browser.

Nothing private lives in this repository. Mobile numbers and full records stay on the instructor's Mac in `~/Desktop/MD101/Class Records/Portal Codes/`; D1 receives only an HMAC of each number plus the record without the number.

## One-time setup

Run from this `worker/` folder. `npx wrangler login` first if you have not signed in to Cloudflare.

```bash
npm install
npx wrangler d1 create md101                      # paste the printed database_id into wrangler.toml
npx wrangler d1 execute md101 --file schema.sql --remote
openssl rand -hex 32 > "$HOME/Desktop/MD101/Class Records/Portal Codes/server_secret.txt"
npx wrangler secret put SERVER_SECRET < "$HOME/Desktop/MD101/Class Records/Portal Codes/server_secret.txt"
node import.mjs "$HOME/Desktop/MD101/Class Records/Portal Codes/portal_records.json"
npx wrangler deploy                               # prints the Worker URL
```

Then put `<Worker URL>/api/scores` in `API_URL` near the top of the script in `../index.html`, commit and push.

`import.mjs` reads the secret from `$SERVER_SECRET` or `server_secret.txt` (same folder as the records). It must be the same value you gave `wrangler secret put`. If you ever change the secret, re-run the import.

## After every score update

`~/Desktop/MD101/tools/publish_portal.sh` rebuilds the records, imports them into D1, and pushes the public `analytics.json`.

## Local testing

```bash
printf 'SERVER_SECRET=%s\nALLOWED_ORIGINS=http://127.0.0.1:8765\n' "$(openssl rand -hex 32)" > .dev.vars
npx wrangler d1 execute md101 --file schema.sql --local
SERVER_SECRET=<same value> node import.mjs <records.json> --local
npx wrangler dev
```
