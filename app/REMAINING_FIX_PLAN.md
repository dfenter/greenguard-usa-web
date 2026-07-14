# Remaining Review Fixes — plan v2 (post Sol review; all batches revised)

Four sequential batches R1-R4. Each: implement -> `cd app && npm run build` passes ->
self-audit -> STOP (orchestrator commits). Global rules at bottom.

## R1 — Notification truthfulness + fire-and-forget

R1.1 (#9) lib/notify-queue.js backup path (~:158-170) — explicit state machine (Sol #1):
- `claimForBackup(id)` returns `removed === 1` and THROWS on KV errors.
- claim === true -> send via backup (we own it).
- claim === false -> read job status: `sent-by-local` -> return local result;
  `failed-by-local` -> send via backup; `pending`/`claimed-by-local` -> sleep-poll (use the
  existing `sleep()`, no poll helper exists) up to 3s for a terminal state; if still owned,
  return `{ queued: true, sentBy: 'daemon-pending' }` — do NOT double-send.
- claim THROWS (KV error) -> send via backup (availability wins; claims impossible anyway).
  Isolate claim errors from post-claim status-READ errors: a status-read error after
  claim===false must NOT trigger a backup send (daemon may own it) — return queued outcome.
- Caller safety (Sol #2): pages/api/book/create.js:160-163 logs any fulfilled result as
  "SENT" — update that log to check the returned shape (`sentBy`/`queued`) honestly.

R1.2 (#12) Verified-send helper + full coverage (Sol #3):
- Add `assertSendOk(result)` in lib/email.js (or a small lib/send-verify.js): throws/returns
  false when Resend result has `.error` or is missing an id. Apply at ALL unchecked sends:
  lib/payment-resurrection.js:59,87,137; lib/quote-followup.js:84,147;
  lib/purchase-notify.js:103,203,279,323 (this file has an UNCOMMITTED owner edit — build on
  current tree, never revert it).
- Helpers return explicit channel booleans; the T+7 helpers (payment-resurrection.js:123-144,
  quote-followup.js:95-153) must return sent:false when no channel confirmed.
- Cron markers: pages/api/cron/quote-followup.js (~:175) and payment-resurrection.js (~:61)
  write stage markers ONLY on a confirmed channel; else record in results.errors, no marker.

R1.3 (#13) Strict cron claims (Sol #4): `claimOnce` does not exist. Add
`consumeJtiStrict(jti, ttlSeconds)` to lib/auth.js: same SET-NX semantics but THROWS when KV
is unconfigured or errors (no memory fallback — crons need cross-instance safety). Use it for
per-stage claims `cron:<job>:<id>:<stage>` (ttl 6h) in both crons; claim false -> skip; claim
throws -> skip + record error (fail closed for dup-risk sends).

R1.4 (#19) pages/api/admin/invoice-items.js:277/305 — await notifyAdminInvoiceSent in
try/catch; response gains `notifyFailed: true` on failure. pages/api/admin/upload-media.js:43
— await assessPhoto and CHECK `result.ok` (it catches internally and returns {ok:false}, it
does not throw — Sol #5); respond `qa: { queued: false, error: true }` on !ok or throw.

R1.5 (#32) lib/notify-queue.js:106-107 — LOCAL_GRACE_MS 5000 -> 1500, LOCAL_POLL_MS 300 -> 500;
update comment math.

## R2 — Outage honesty + integration hardening

R2.1 (#14) Outages never render as empty:
- pages/api/cron/daily-route.js:135 — on getBookingsForDate throw: send admin ALERT email
  ("route unavailable: <err>"), return 500, do NOT send an empty route email.
- pages/api/cron/daily-summary.js:151 — track sources separately; on GCal/Stripe failure
  prepend a "DATA INCOMPLETE: <sources>" banner line to the email and include in JSON result.
- daily-summary.js:28 — Chicago-midnight Stripe boundary via tzDayBoundsISO (exists in the
  cron/lib tz helpers — grep and reuse), not `new Date(todayCT() + 'T00:00:00')`.
- pages/admin/calendar.js — current props are only `{today, initialBookings}` and there is NO
  existing error UI (Sol #6): add `gcalError` prop from SSR catch, render a new small error
  banner + Retry button (Clarity tokens), and make the initial-date effect refetch when
  gcalError is set.
- pages/admin/rounds.js (~:30 open-mode) — populate the single-day branch's existing gcalError
  prop instead of `catch {}`.

R2.2 (#15) lib/hubspot.js — `_fetchContactsByEmails` chunk failure: THROW (so cached() skips
storing partial). getAllContacts non-OK page: THROW. Sol verified all 8 + 6 callers tolerate
throws. Do not change return shapes on success.

R2.3 (#10) lib/db-webhook-log.js — production (process.env.VERCEL): claimWebhook THROWS when
KV unavailable (no memory fallback); confirmed TTL 24h -> 96h. ALSO (Sol #7): confirmWebhook
must THROW on KV failure in production, and pages/api/webhooks/stripe.js:463-465 must NOT
swallow it (let outer catch release + 500 so Stripe retries a webhook whose confirmation never
persisted). Keep memory fallback for local dev only.

R2.4 (#11) lib/auth.js:153 area — atomic login-code consumption via `kv.getdel(key)`
(@vercel/kv 3.0 exposes lowercase getdel — Sol verified). Keep attempt-counter semantics; on
compare-fail after getdel, restore with remaining TTL only if attempts remain (document the
small race).

R2.5 (#21) pages/api/cron/gcal-hubspot-sync.js:36 — follow nextPageToken (safety cap 2000;
REACHING the cap is an explicit failure in the job result, not a silent partial — Sol risk),
dedupe by normalized email before upsert.

R2.6 (#22) Timeouts (fetchWithTimeout lives in lib/http.js — reuse, no export changes):
- lib/notify-queue.js kv(): AbortSignal.timeout(5000); retry once ONLY idempotent commands
  (GET/SET-nx/LRANGE); RPOP and LPUSH are NOT retried (Sol #8).
- lib/tank-data.js:57 — fetchWithTimeout from lib/http.js; skip caching on failure.
- components/useLazyData.js:12 — AbortController, 15s, abort on unmount, timeout -> existing
  error/retry state.

R2.7 (#16) pages/api/health.js split WITHOUT breaking consumers (Sol #9):
- Default GET: cheap liveness, no external calls, Cache-Control 60s.
- `?deep=1` runs the current checks, gated by: valid admin session OR the repo's existing cron
  auth forms (Bearer CRON_SECRET or x-cron-key header per lib/cron-auth.js:18-23 — reuse that
  helper, do NOT invent x-cron-secret).
- Update callers: pages/api/cron/health.js:20-24 -> `/api/health?deep=1` with
  `Authorization: Bearer ${CRON_SECRET}`; pages/admin/health.js:63 and
  pages/admin/analytics.js:1034 -> `?deep=1` (session cookie covers auth).
- Every deep check bounded: AbortSignal.timeout(8000) where fetch; Promise.race timeout
  wrapper for SDK calls that take no signal.

## R3 — Performance batch

R3.1 (#23) pages/api/admin/visits-due.js:72 — add a PAGINATED range variant to lib/gcal.js
(follows nextPageToken, cap 5000 with explicit failure at cap — current
getBookingsForDateRange is capped 250 silently, Sol #10). visits-due uses ONE paginated
past-window fetch + ONE future-window fetch, grouped by normalized email. NOTE the current
per-customer past lookup spans 18 months; preserve the decision inputs (last visit date,
upcoming appointment) — an 18-month single range for all customers is acceptable (cap-guarded)
since events/customer/18mo ≈ 20 and total ≈ 1.7K < 5K cap.

R3.2 (#24) lib/hubspot.js — add `getClientNotesBatch(contactIds)` reusing the association +
batch-read pattern, concurrency 4; identical per-contact output. Use in rounds SSR (~:103).

R3.3 (#25) pages/admin/calendar.js:
- /api/admin/bookings: keep `{date}` -> `{date,bookings}` contract EXACTLY; add `start`+`end`
  mode (validate ISO dates, max 45-day span) returning `{start,end,bookings}` where bookings
  are normalized so `customerName` is populated (range records currently expose `name` —
  Sol #11). Calendar week/month views use ONE range call.
- /api/admin/distances: keep `{origin,addresses}` -> root-map contract untouched (6 callers).
  Add `legs` mode: `{stops: [ordered addresses]}` -> server computes adjacent legs with
  bounded concurrency (3) against the same Distance Matrix helper, response
  `{legs: [{from,to,miles,duration}]}`. Calendar uses one legs call.

R3.4 (#26) pages/admin/tech.js — getServerSideProps (copy home.js auth/redirect pattern)
returns a FULL fallback shape (Sol #12): `{ adminEmail, todayStr, tomorrowStr, initialStops }`
where initialStops are today's GCal bookings serialized to the tech-data stop contract
(gcalEventId/title/serviceType/startTime/endTime/address/email/phone/tanks:null/
appointmentNotes/clientNotes:[] — reuse the serialize shape from tech-data.js:50-68, HubSpot
fields empty). Page renders fallback immediately; useLazyData result replaces it; lazy ERROR
with fallback present shows fallback + retry banner instead of full-page error.

R3.5 (#27) pages/admin/quote.js — new admin-gated /api/admin/customer-search?q= (min 2 chars,
max 10 results) searching name, EMAIL, ADDRESS, and PHONE (parity with current client filter
at quote.js:170-178 — Sol #13) across the same Stripe+HubSpot data (server-side, cached 60s).
Quote page: debounced (300ms) autocomplete; REMOVE listAllCustomers/getAllContacts from SSR
but KEEP `mapsKey` in props (Sol).

R3.6 (#28) components/CustomerMap.js:17 — IntersectionObserver one-shot mount for Maps script
+ geocoding; localStorage geocode cache keyed by address hash, 30-day TTL.
pages/quote/new.js:495 — drop unused libraries from the Maps URL (grep drawing/geometry usage
in that page first; keep any that are used).

R3.7 (#29) pages/admin/clients.js:207-227 — delete BOTH mount-fetch hacks; single
`useEffect(() => { fetchDetail() }, [fetchDetail])` and give fetchDetail a correct useCallback
dependency list (it reads more than customer.id — Sol).

R3.8 (#30) lib/books-ingest.js:77 — storage is PostgreSQL via lib/db.js (NOT sqlite): preload
category-rule maps once, then per Stripe page one parameterized multi-row
`INSERT ... ON CONFLICT DO NOTHING`. lib/qbo.js:98 — set `DocNumber = stripeInvoiceId` on
create and pre-query QBO by DocNumber when stripeInvoiceId exists; return existing invoice.

## R4 — Webhook chain + stragglers

R4.1 (#17) pages/api/webhooks/stripe.js — cover BOTH serial chains: invoice-payment
(:182-234) and checkout/quote (:302-465 incl. welcome email + HubSpot attribution :347-408).
Order: (1) money-critical writes awaited serially (markQuotePaid, HubSpot payment status);
(2) independent side effects (admin notify, receipts, welcome email, GA4/Meta/Ads conversions)
in bounded `Promise.allSettled` groups, each wrapped in a Promise.race 8s timeout (SDKs accept
no AbortSignal — Sol #14). Log settled failures. Handler must respond well under the function
limit with one hung provider.

R4.2 (#18) DELETE pages/api/webhooks/calcom.js (no vercel.json rewrite exists — Sol). Update
HANDOFF.md:85 which claims it fails closed; CLAUDE.md already says removed.

R4.3 (#20) pages/api/book/create.js:77 — claim `book:<email>:<slotISO>` via consumeJti
(ttl 600) before events.insert; claim=false -> 409; claim throws -> proceed (public booking,
availability wins). Then re-check slot freeness with a targeted GCal query before insert.

R4.4 (#33) pages/api/cron/acuity-leak.js:53 — claim `acuity-leak:<eventId>` (consumeJti,
ttl 7 days) before alerting; claim error -> send anyway (alerting wins).

R4.5 (#34) Extract `verifyAndSanitizeQuoteToken(token)` into lib/quote-link.js from the logic
embedded in pages/api/admin/quote-link.js:37-46; it returns ONLY an allowlist of customer
fields (quote lines, prices, customer name/email/address, expiry) and EXCLUDES jti, type, iat,
exp, source (Sol #15). API route AND new pages/quote/[token].js getServerSideProps both use
it; SSR renders the quote immediately; client fetch stays as refresh only.

R4.6 Documentation-only: cache.js stale-refresh comment (finding 31); TODO at analytics.js:9
re recharts modular imports (finding 35).

## Global rules
1. Build on the CURRENT working tree — lib/purchase-notify.js (+ its test) carries an
   intentional uncommitted owner edit; preserve it.
2. No new dependencies. No TypeScript. Pages Router only. Reuse lib/http.js fetchWithTimeout,
   cached(), consumeJti family, tz helpers, cron-auth helper.
3. Public-facing behavior identical except where specified (error banners, honest failures).
4. `cd app && npm run build` must pass per batch. Do NOT git commit.
5. Self-audit per batch: finding ID -> file:line of fix; justify any remaining swallowed catch
   in touched files; confirm no consumer contract changed (bookings/date, distances/origin,
   health cron caller, sendEmail return shapes).
