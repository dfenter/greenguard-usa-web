# GreenGuard USA Portal — Developer Handoff

_Last updated: July 5, 2026. Companion to `CLAUDE.md` (codebase reference). This doc adds the operational
picture, a guided tour for a new developer, and the results of the July 2026 full code review._

---

## 1. What this system is

Customer portal + field-ops tool for a CO2 mosquito-control service in Austin, TX (~86 customers).
One Next.js app (`app/`, Pages Router, **JavaScript only, no TypeScript**) deployed to Vercel at
**portal.greenguard-usa.com**. Two humans use it daily:

- **Owner** (`admin@greenguard-usa.com`) — full admin: clients, quotes, invoices, analytics, route planning.
- **Tech** (`bruce@greenguard-usa.com`) — field view: today's route, rounds logging, navigation. Uses an
  **iOS home-screen PWA** (this matters — see Auth below).

Customers get a read-only dashboard (service history, billing, schedule).

**There is no application database.** All persistent state lives in third-party systems:

| State | System of record |
|---|---|
| Customers, payments, invoices | Stripe |
| System config (trap/tank counts, plan) | HubSpot contact custom properties |
| Appointments | Google Calendar (`admin@greenguard-usa.com`) |
| Session/rate-limit/single-use tokens | Vercel KV (Upstash Redis) |
| Route plans | JSON files committed to repo (`app/public/data/`) |

## 2. Architecture at a glance

```
Browser / iOS PWA
   │
   ▼
Vercel (iad1) — Next.js Pages Router
   ├─ pages/            UI (24 admin pages, 9 customer dashboard pages)
   ├─ pages/api/        108 serverless routes
   │    ├─ auth/        magic-link + 6-digit code login
   │    ├─ admin/       owner/tech operations (gated)
   │    ├─ cron/        13 scheduled jobs (3 Vercel crons + cron-job.org hits)
   │    └─ webhooks/    stripe, calcom, twilio
   ├─ lib/              ~60 service modules (stripe, gcal, hubspot, email, auth…)
   └─ middleware.js     edge — only matches '/' and '/api/auth/request-link'
```

Key deps: `stripe`, `googleapis`, `@hubspot/api-client`, `jose` (JWT), `resend` + `nodemailer` (email),
`@vercel/kv`, `recharts` (analytics UI), `@anthropic-ai/sdk` (admin chat assistant), `twilio`, `pg`.

## 3. Auth — read this before touching anything

Flow: enter email on `/login` → `POST /api/auth/request-link` (only sends if the email is an admin, a Stripe
customer, or in `GUEST_EMAILS`) → email contains **both** a magic link and a **6-digit code**.

- **Magic link** → `/api/auth/verify` → sets `gg_session` cookie (JWT, 90-day, httpOnly, SameSite=Lax,
  sliding refresh after 1 day) → `/auth-success` stores a backup token in `localStorage.gg_backup`.
- **6-digit code** → typed into `/login` → `POST /api/auth/verify-code`. **This exists because the iOS
  home-screen PWA has a cookie jar isolated from Safari** — tapping the emailed link opens Safari, and the
  cookie set there never reaches the installed app. The code completes login *inside* the PWA. Codes are
  hashed at rest in KV, single-use, 15-min TTL, 5-attempt lockout (`lib/auth.js`).
- **Restore**: if iOS evicts the cookie, `/login` silently POSTs `gg_backup` to `/api/auth/restore`.

Roles are baked into the session JWT: `owner` | `tech` | `customer` | `prospect`. Gate API routes with
`requireSession` / `requireAdmin` / `requireOwner` from `lib/auth.js` — never hand-roll.

Magic tokens and login codes are single-use via KV `SET NX` (`consumeJti`). The in-memory fallback when KV
is unset does NOT protect across lambda instances — KV must stay configured in prod.

## 4. Money paths (the code you must not break)

1. **Invoice-based billing — there are NO Stripe subscriptions.** Rounds (`/admin/rounds`) logs a service
   visit → generates a Stripe invoice. Double-billing guard: `cal_booking_uid` in invoice metadata.
2. **Quotes**: `lib/quote-pricing.js` is the **single source of truth** for all pricing. The public
   `POST /api/quote/create-link` recomputes every line server-side from enum selections + quantities —
   it never trusts client amounts. Quote approval → Stripe one-time checkout. Keep it this way; trusting
   client line items reintroduces a $0.01-checkout hole (fixed July 2026).
3. **Stripe webhook** (`/api/webhooks/stripe`): signature-verified, handles `invoice.payment_succeeded`/`failed`.
4. All Stripe search queries must escape user input via `escapeStripeSearch()` (query-DSL injection).

## 5. Scheduling

- Customer booking: `/book` on the marketing site → `POST /api/book/create` → GCal event + confirmation
  email + **admin notify email** (from `admin@`, logged SENT/FAILED — twice this missed silently before
  being hardened, July 2026) + HubSpot upsert + server-side ad conversions.
- Cal.com handles rescheduling links; Cal.com→GCal sync is automatic. The legacy Cal.com webhook route was
  removed; booking data now arrives through the supported calendar sync path.
- **Rounds reads live GCal only** — never the route-plan cache. The route plan JSON is for `/admin/route`
  display only. This rule exists because a cached plan once caused missed appointments.
- Earliest customer slot is 10 AM; 40-mile ZIP service-area gate on public booking (admin `/book` bypasses).

## 6. Crons & webhooks

Vercel crons (`app/vercel.json`): `payment-resurrection` 15:00 UTC, `quote-followup` 14:00 UTC,
`daily-summary` 22:00 UTC. The other ~10 jobs in `pages/api/cron/` are triggered by **cron-job.org** with a
shared `CRON_SECRET` (checked via `lib/cron-auth.js`). A separate Python email/scheduling agent runs on
Render (repo `dfenter/greenguard-agent`) — reminders, email drafting; not part of this app.

## 7. Deploy & dev

```bash
cd app && npm run dev            # local dev
cd app && npm test               # 7 jest suites (auth, checkout, stripe-webhook, sku-engine…)
./scripts/deploy.sh portal       # THE deploy command — build + deploy + alias
```

**Every change must be deployed explicitly** — nothing is live until `deploy.sh portal` runs. Env vars live
in Vercel (project `app`); local `.env` in `app/` has a subset. Never `vercel --prod` bare — use the script.

## 8. Integration gotchas (hard-won)

- **GCal**: all event ops use `sendUpdates:'none'` / `notificationLevel:'NONE'` unless the customer explicitly
  should be notified. Event titles: `"Name: ServiceType (GreenGuard USA)"` — parsers depend on this format.
  Two description formats exist in the wild (`Email:/Phone:/Location:` legacy and `Location\n====` block).
- **Cal.com**: API key is event-type-scoped — `getBookingsForEmail()` returns 0; match bookings to GCal by
  same-day date, not 5-minute tolerance.
- **Email**: Resend for transactional; **Gmail OAuth2 (nodemailer) for bulk** (Resend daily quota is low).
  `sendEmail()` auto-falls back to Gmail on any Resend failure. The booking admin-notify must send from
  `admin@` — the inbox email agent spam-filters `noreply@` senders.
- **HubSpot**: canonical for system config. Custom props: `system_type`, `trap_count`, `tank_count`,
  `plan_type`, `customer_status`, `payment_status`, `recurring_addons`. UI normalizes `system_type` casing
  (`systemKind()` in `CustomerPanel.js`) — values in HubSpot are inconsistently cased; don't exact-match.
- **iOS PWA rendering**: never combine `position:fixed` with `backdrop-filter` — the element detaches and
  floats mid-screen on scroll (bit the bottom dock, July 2026). Unprefixed `backdrop-filter` is ignored by
  iOS; adding `-webkit-` "turns on" latent bugs.
- **Timezone**: everything customer-facing is `America/Chicago`. Route optimizer depot: 1519 Parkway.

## 9. July 2026 full code review — confirmed findings

_A 4-reviewer agent team (security, correctness, performance, maintainability) swept the codebase; every
finding below survived an independent adversarial verification pass. Fix status as of July 5, 2026._

**Verification stats:** 34 unique findings from the review team → 33 confirmed real, 1 refuted
(a claimed session-replay in `restore.js` — the backup token grants nothing beyond the cookie itself).
Verifiers also adjusted severity on 8 findings (mostly downward where caches/fallbacks bound the impact).

### 9.1 HIGH — money paths (fix these first)

| # | Finding | Where |
|---|---|---|
| H1 | **`complete-visit` charges are silently lost.** It creates Stripe *pending* invoice items (no `invoice` param), but nothing ever pulls pending items onto an invoice (no subscriptions; `generate-invoice` attaches explicitly; Stripe's modern default is `pending_invoice_items_behavior: 'exclude'`). Every SKU billed through the "Complete Visit" flow is never charged. | `pages/api/admin/complete-visit.js:60` via `lib/stripe.js:77-85` |
| H2 | **Rounds "open" mode hides unbilled visits.** `findInvoicesForBookings` matches invoices to stops **by email only** (never `cal_booking_uid`/`service_date`), and drafts are fetched first so a stale draft always shadows. Any invoice from the past 45 days hides ALL of that customer's stops from the needs-invoicing list → silent revenue loss. | `lib/stripe.js:240-252` + `pages/admin/rounds.js:186-200` |
| H3 | **Draft-reuse can double-bill line items.** `generate-invoice` grabs `drafts.data[0]` with no metadata comparison and never writes the new visit's `cal_booking_uid` onto it, so the dedup checks can't see the second visit — a re-generate appends the items again. | `pages/api/admin/generate-invoice.js:99-100, 221-230` |
| H4 | **Map cached in Redis crashes rounds.** `findInvoicesForBookings` returns a `Map` through `cached()`; Upstash JSON-serializes it to `{}`, so a cross-instance cache hit makes `rounds.js` call `.get()` on a plain object → getServerSideProps 500. (hubspot.js:105 documents this exact pitfall and works around it.) | `lib/stripe.js:214` + `lib/cache.js:81,111-114` |

### 9.2 MEDIUM — correctness & robustness

| # | Finding | Where |
|---|---|---|
| M1 | `generate-invoice` dedup is check-then-act with no idempotency key or KV lock — concurrent submits (double-tap on LTE) can create duplicate invoices. The webhook path already has the KV SET-NX pattern; this money-writing path doesn't. | `pages/api/admin/generate-invoice.js:59-92` |
| M2 | Quote checkout can be paid twice: nothing marks a quote paid (webhook only writes a HubSpot note), and Stripe idempotency keys expire ~24h — after that the same emailed link mints a fresh payable session. | `pages/api/quote/checkout.js:152-158` + `webhooks/stripe.js:321-327` |
| M3 | Stripe webhook: `claimWebhook` runs before a long sequential chain; on lambda timeout the claim is never released, Stripe's retry gets `200 {duplicate:true}` and **stops retrying** — event permanently swallowed. | `pages/api/webhooks/stripe.js:171,450` + `lib/db-webhook-log.js` |
| M4 | Cal.com `rescheduleBooking` PATCHes a **non-existent v2 endpoint** (reschedule is `POST /v2/bookings/{uid}/reschedule` under version 2024-08-13). Every reschedule silently degrades to GCal-only; Cal.com keeps the old time and sends wrong reminders. | `lib/calcom.js:39-44` |
| M5 | HubSpot batch-contact cache key is truncated to 250 chars — large email sets collide and return the wrong customers' tank counts/notes in rounds. Fix: hash the key. | `lib/hubspot.js:115` |
| M6 | `/api/book/create` has no rate limiting (and CORS `*`) — scripted bookings can stuff the calendar (slots.js blocks occupied time), spam HubSpot/email. Add the same KV limiter as request-link. | `pages/api/book/create.js` |
| M7 | `customer-detail` serially awaits a Cal.com call **documented to always return []** (API key scope); with retries it can stall the panel up to ~24s. Delete the call. | `pages/api/admin/customer-detail.js:59-62` |
| M8 | `cal_booking_uid` double-billing guard is dead code — rounds never populates it on stops (`calBookingsByEmail = {}` is never filled), so only the service-date fallback protects. | `pages/admin/rounds.js:34-41,126,180` |
| M9 | Per-contact `getContactNotes` fan-out (2 HubSpot calls each) copy-pasted across the three hottest endpoints (home-data, tech-data, rounds SSR). | `home-data.js:75-87`, `tech-data.js:44-56`, `rounds.js:107-118` |
| M10 | `listAllInvoicesSince` caps at 100 invoices, no pagination — **the accounting revenue export and analytics silently undercount** (~5 weeks of data at current volume). | `lib/stripe.js:140-152` |
| M11 | `/admin/rounds` loads everything in getServerSideProps (GCal + contacts + notes + 45-day invoice scan) — blank screen on LTE cold loads; the lazy `home-data` pattern exists and should be reused. | `pages/admin/rounds.js:15-211` |
| M12 | `require('googleapis')` loads the entire 114 MB metapackage on every cold start of every route touching gcal. Swap to `@googleapis/calendar`. | `lib/gcal.js:9` |
| M13 | N+1 `customers.retrieve` per invoice in `findInvoicesForBookings` — `invoice.customer_email` already has the value. | `lib/stripe.js:230-237` |

### 9.3 LOW — worth fixing opportunistically

- **Display/price drift:** rounds shows tank delivery $39.99 but bills $39.00 (`rounds.js:623` vs `:637`); SKU_PRICES has TRAP-MAINT at 3× the real price (`lib/businesses/greenguard/sku-engine.js:33-34`). Billing itself is consistent (Stripe env price IDs win).
- **Hardcoded `-05:00` offset** in 3 files (`home-data.js`, `tech-data.js`, `pending-invoices.js`) — wrong during CST but only affects the empty 11 PM–midnight hour; use `_tzDayBounds` from gcal.js.
- **`payment_status` never resets** after successful payment — customers stay "failed" in HubSpot forever (`webhooks/stripe.js:176-223` has no upsert).
- **`clearStages()` doesn't clear** — Stripe metadata updates merge; deleting keys requires posting `''` (`lib/payment-resurrection.js:152-160`).
- **7 admin routes** interpolate email into Stripe search unescaped while `escapeStripeSearch` exists (admin-gated, so robustness not exploit): start-plan, invoice-items, client-profile, customer-detail, clients, execute-upgrade, generate-invoice.
- **`findOrCreateCustomer` in lib/stripe.js is dead code** (no callers) — delete it.
- **`/api/leads/subscribe`** unauthenticated + unthrottled → CRM pollution nuisance.
- **`consumeJti` silently degrades** to per-instance memory if KV env is lost (June 2026 env-wipe precedent) — add a startup warn.
- Misc perf: serial Distance Matrix chunks (`distances.js`), unbounded in-memory cache Map (`cache.js`), tier-2 cache re-freshening (staleness up to 3× TTL), `clients.js` CustomerPanel double-fetches via setState-in-render, tank-calendar serial SSR, `getAllContacts` cached per-limit (300/500/1000 = 3 cold fetches).

### 9.4 MAINTAINABILITY — for the next developer

- **`SKU_TO_ENV` map is copy-pasted into 4 places and has drifted:** `generate-invoice.js` (28 entries),
  `start-plan.js` (8), `execute-upgrade.js` (8), plus a 4th variant `SKU_TO_PRICE` in `lib/stripe.js`.
  The three route copies have different contents. Consolidate into one exported map in `lib/stripe.js`.
- **Auth pattern is inconsistent:** ~44 API routes hand-roll `getSessionFromRequest` + `isAdminEmail`
  checks instead of using the `requireAdmin`/`requireOwner`/`requireSession` gate helpers in `lib/auth.js`.
  They're not insecure (the checks are correct), but the inconsistency is a footgun — a new route author
  can easily forget the check. Standardize on the gate helpers.
- **No shared formatters:** date formatting is reimplemented across ~14 files (42 files call
  `toLocaleDateString`); `toFixed(2)` appears 96 times with no shared money formatter. A single
  `lib/format.js` would remove a lot of drift risk (this is how the $39.99/$39.00 kind of bug creeps in).
- **"No database" is not quite true:** `lib/db.js` is a Postgres (Neon) pool used by the bookkeeping
  features (`books-*` endpoints/pages, `event-notes`, webhook log). Everything else is genuinely
  DB-free. `DATABASE_URL` must be set for the books features to work; they fail lazily if it isn't.
- **Dead code to delete:** `findOrCreateCustomer` in `lib/stripe.js` (no callers). Audit the AI-client
  trio (`claude.js`/`gemini.js`/`llm.js`) and ad-client pair (`googleads.js`/`google-ads.js`) — likely
  only one of each is live; confirm with grep before removing.
- **Test coverage is thin on the money paths:** `quote/checkout.js` has a test (token validation only);
  `generate-invoice.js` and the rounds→invoice flow have **zero** coverage despite being where the H1–H4
  and M1–M3 bugs live. Add tests here before refactoring them.

## 10. Where to start as a new developer

1. Read `CLAUDE.md` (repo map + rules), then this doc.
2. Trace one booking end-to-end: `site/src/pages/book.astro` → `app/pages/api/book/create.js` → GCal →
   `/admin/rounds` → invoice generation → Stripe webhook. That path touches 80% of the architecture.
3. Trace one login on an iPhone PWA (section 3) — it explains most of the "weird" auth code.
4. Run the tests. They cover the money paths; extend them when you touch pricing or webhooks.
5. Rules that are absolute: Pages Router only, JavaScript only, no subscriptions, deploy via the script,
   rounds reads live GCal, quote pricing stays server-authoritative.
