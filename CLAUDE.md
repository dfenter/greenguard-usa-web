# GreenGuard USA — Codebase Reference

## Repo Layout

Two independent Vercel deployments share this repo:

```
/                     → greenguard-usa.com (static marketing site)
  vercel.json         → build: python3 _scripts/build_vercel.py → out/
  *.html / *.js       → static content fragments

app/                  → portal.greenguard-usa.com (Next.js customer portal)
  vercel.json         → framework: nextjs, region: iad1
  pages/              → Pages Router (NOT App Router)
  lib/                → service clients (stripe, hubspot, gcal, calcom, email)
  public/data/        → generated route plans (route_plan_YYYY-WW.json)

site/                 → new.greenguard-usa.com (Astro marketing site)
  src/pages/          → index, services, traprental, pricing, faq, about, book, why-co2...
```

**Stack:** Next.js 15, React 18, JavaScript only (no TypeScript).
Customer/billing state lives in Stripe, HubSpot, and Google Calendar. A Neon
Postgres database (`DATABASE_URL`, pooled via `app/lib/db.js`) backs the
bookkeeping ledger and payroll — see the migration scripts in `app/_scripts/`.

---

## Booking & Billing Flow (CURRENT)

```
Customer books via Cal.com → appointment in Google Calendar
  ↓
Tech does service visit → logged in Customer Rounds (/admin/rounds)
  ↓
Admin generates invoice from rounds → Stripe invoice sent to customer
  ↓
Customer pays invoice → done

OR for new customers:
Admin builds quote (/admin/quote) → sends shareable link
  ↓
Customer approves quote → Stripe one-time checkout (first month + one-time items)
  ↓
Customer picks installation time via Cal.com embed at end of quote flow
```

**No subscriptions are created automatically.** Billing is invoice-based, generated per service visit via Customer Rounds. `createSubscription()` in stripe.js is unused and will be removed.

**All scheduling goes through Cal.com.** Older Google Calendar events may still use the legacy description format (Email:/Phone:/Location:) — gcal.js parses both formats.

---

## Services & Integration Map

### Stripe — `app/lib/stripe.js`
- Invoices are the billing unit — created per service visit from Customer Rounds
- Double-billing guard: `cal_booking_uid` stored in invoice metadata
- Webhook: `POST /api/webhooks/stripe` — handles `invoice.payment_succeeded`, `invoice.payment_failed`
- One-time SKUs (invoice items): TANK*, ASSESS, TRAP-INSTALL, TRAP-MAINT-*, TIMER-INSTALL, BARRIER, BAIT, BG-SWEETSCENT, CO2-ADDON, WKD-SURCH
- Quote checkout: `mode: 'payment'` only — no subscriptions

**Env vars:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, 23× `STRIPE_PRICE_*`

### HubSpot — `app/lib/hubspot.js`
- CRM: contacts created/updated when customers are added or invoice paid
- Custom properties: `system_type`, `trap_count`, `tank_count`, `payment_status`, `customer_status`
- `upsertContact()`, `addNote()`, `findContactByEmail()`, `getAllContacts()`, `countContactsByProperty()`

**Env vars:** `HUBSPOT_ACCESS_TOKEN`

### Cal.com — `app/lib/calcom.js`
- All new customer bookings go through Cal.com
- Cal.com v2 API: `https://api.cal.com/v2`, header `cal-api-version: 2024-06-14`
- `getBookingsForEmail()` — note: API key only has event-type scope, returns 0 bookings
- Reschedule links: extracted from Google Calendar event description (`cal.com/reschedule/UID`)
- **Cal.com webhook was removed** — bookings flow through Google Calendar sync instead

**Env vars:** `CALCOM_API_KEY` (Vercel + GitHub)

### Google Calendar — `app/lib/gcal.js`
- Calendar ID: `admin@greenguard-usa.com`
- Source of truth for all appointments (Cal.com syncs here automatically)
- Event title format: `"CustomerName: ServiceType (GreenGuard USA)"`
- `customerName` parsed from title prefix, `serviceType` from title suffix
- `rescheduleUrl` parsed from event description (Cal.com booking/reschedule URLs)
- `getBookingsForDate()`, `getTodaysBookings()`, `getAllUpcomingBookings()`

**Env vars:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`

### Google Places — `_scripts/fetch_reviews.py` (GitHub Actions)
- Place ID: `ChIJx8wLC4K11wwRbfe7hhZiHXs`
- Runs daily at 03:00 CST, commits `reviews.json`

**Env vars:** `GOOGLE_API_KEY` (local) → `GOOGLE_PLACES_API_KEY` (GitHub secret — different names)

### Google Maps
- **Public embed key** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` → Vercel only
- **Server-side Distance Matrix key** `GOOGLE_MAPS_API_KEY` → GitHub Actions only

### Resend — `app/lib/email.js`
- Magic link auth + admin send-message (`/api/admin/send-message`)

**Env vars:** `RESEND_API_KEY`, `PORTAL_FROM_EMAIL`

### Payroll & timesheets — `app/lib/payroll.js` + `app/lib/payroll-store.js`
- **In-house payroll.** No third-party payroll provider; the portal computes gross, taxes and net.
- `lib/payroll.js` is PURE math (no I/O): FLSA weekly overtime on the blended regular rate,
  minimum-wage makeup, IRS Pub 15-T percentage-method withholding, FICA with wage-base caps,
  employer FUTA/TX SUTA, non-taxable mileage up to the IRS rate. Unit-tested in `__tests__/payroll.test.js`.
- `lib/payroll-store.js` owns every SQL statement (employees, timesheet_entries, payroll_runs,
  payroll_items, payroll_settings) and the invariants: only *approved* entries are payable,
  finalizing claims them as *paid*, overlapping periods are refused, a void releases the hours and
  reverses the book entries in the original period.
- Schema: `node _scripts/db-migrate-payroll.js` (idempotent). Finalized paystubs are frozen by a
  trigger; the `payroll.allow_purge` session GUC is a maintenance-only escape hatch.
- End-to-end DB check: `node _scripts/payroll-selftest.js` (creates and removes a throwaway employee).
- **Update `TAX_YEARS` in lib/payroll.js every January** (Pub 15-T, SS wage base, IRS mileage rate).
  A pay date in a year with no tables warns in the UI rather than silently using another year's.
- Authorization: `/admin/payroll`, `/api/admin/payroll-*` are OWNER-only (`requireOwner`);
  `/admin/timesheet` + `/api/admin/timesheet*` are any admin but scoped to the caller's own
  employee record — a tech can never read another person's rates, W-4 data, or the business EIN.
- Finalized runs post to the books ledger as `Expense:Payroll:{Wages,EmployerTaxes,Contractors,Reimbursement}`.
- **Filings & Deposits tab** (`lib/payroll-filings.js` pure rollups + `lib/payroll-941-pdf.js` +
  `/api/admin/payroll-filings`): EFTPS monthly deposit schedule, per-quarter 941 figures with a
  pre-filled official Form 941 PDF download, Form 940 worksheet, W-2 box worksheet (typed into SSA BSO).
  The vendored form lives at `lib/forms/f941-<year>.pdf` — **when vendoring a new year's PDF, re-verify
  the AcroForm field map** (sentinel-fill + render; map documented in `lib/payroll-941-pdf.js`) and note
  `outputFileTracingIncludes` in next.config.js ships the form to the lambda. Finalizing a run emails
  the owner the exact EFTPS deposit amount and due date (`sendDepositReminder` in `api/admin/payroll-run.js`).
  The portal still transmits nothing: deposits, mailing the signed 941, TWC reports, 940 and W-2s stay manual.

**Expenses / receipts** (`expense_claims`, `/admin/expenses`, `/api/admin/expenses`):
- Receipt images go to Vercel Blob via `/api/admin/expense-receipt` (`BLOB_READ_WRITE_TOKEN`, photos + PDF, 12 MB cap).
- Approving a claim books the expense at ITS OWN category (`transactions`, `source='expense-claim'`,
  `external_id='expense-claim-<id>'`, dated `incurred_on`). Rejecting or deleting a booked claim reverses it.
- `payment_method='personal'` also queues a NON-TAXABLE reimbursement on the next payroll run
  (`payroll_items.expense_reimbursement_cents`); `'company'` is booked only (status `recorded`).
- **The payroll reimbursement is deliberately NOT booked again** — `postRunToBooks()` posts only the mileage
  portion, otherwise the same receipt would hit the P&L twice.
- Claims are claimed/locked by a run exactly like timesheet entries: approved → paid, released on void.

**Time-card audit trail** (`timesheet_revisions`):
- A DB trigger on `timesheet_entries` writes a revision row for EVERY insert/update/delete — app code
  and hand-run SQL alike. `timesheet_revisions` is append-only (a second trigger refuses UPDATE/DELETE).
- Deletes are SOFT (`deleted_at`/`deleted_by`); the unique day/open-clock indexes are partial on
  `deleted_at IS NULL`, so a removed day can be re-entered as a new row. Live reads filter deleted rows,
  and `ON CONFLICT (employee_id, work_date) WHERE deleted_at IS NULL` matches the partial index.
- Attribution comes from `payroll.actor_email`, set with `set_config(..., true)` (transaction-local)
  by `withActor()` in payroll-store — pooled connections make a plain SET unsafe. A write that skips
  it is still recorded, attributed to `system`.
- Read it via `listEntryRevisions()` or `GET /api/admin/timesheet?revisionsFor=<entryId>` (owner: any
  employee; crew: their own). Shown on each day card and in the Approve Time queue.
- Retention: FLSA §11(c) / 29 CFR 516 — payroll records 3 years, time cards 2 years.

**Env vars:** `DATABASE_URL` (shared with the bookkeeping ledger), `CALENDAR_TIMEZONE` (business day + workweek).

### Auth — `app/lib/auth.js`
- Magic link + JWT session cookie (`gg_session`, 90-day, httpOnly, SameSite=Lax)
- Multi-admin: `ADMIN_EMAILS` env var (comma-separated)
- Owner (`admin@greenguard-usa.com`) → lands on `/admin/home`
- Tech (`bruce@greenguard-usa.com`) → lands on `/admin/tech`
- Customers → `/dashboard`
- Prospects (no Stripe record) → `/prospect`

**Env vars:** `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_EMAILS`, `NEXT_PUBLIC_APP_URL`

### GitHub Actions
- `fetch-reviews.yml` — daily 03:00 CST
- `route-optimizer.yml` — Monday 09:00 CST, commits route plan JSON, opens issue

### GitHub Token
- `GITHUB_TOKEN` — needed in Vercel for "Run Route Optimizer Now" button in Route Plan

---

## Admin Portal Pages

| Page | Route | Purpose |
|------|-------|---------|
| Home | `/admin/home` | Owner landing — today's stops, KPIs, open invoices |
| Tech Dashboard | `/admin/tech` | Bruce's view — today's route, navigate, text |
| Customer Rounds | `/admin/rounds` | Log service visits, generate invoices |
| Daily Rounds | `/admin/inventory` | Tank & equipment inventory |
| Clients | `/admin/clients` | Customer list + prospect list (HubSpot) |
| Quote Builder | `/admin/quote` | Build quotes, approve & pay, share link |
| Invoice | `/admin/invoice` | Search by name, manage Stripe invoices |
| Route Plan | `/admin/route` | Calendar view of weekly route |
| Analytics | `/admin/analytics` | Revenue, Traffic, Map, Social, Finance, Accounting, Health |
| Timesheet | `/admin/timesheet` | Crew clock in/out + own hours (any admin login) |
| Payroll | `/admin/payroll` | Approve time, run payroll, crew & tax settings (OWNER only) |
| Paystub | `/admin/paystub` | Printable earnings statement |
| Expenses | `/admin/expenses` | Receipt upload (crew) + approval queue (owner) |

---

## Environment Variables

### Vercel (portal.greenguard-usa.com)
```
STRIPE_SECRET_KEY          STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_BG1 … STRIPE_PRICE_WKD_SURCH  (23 price vars)
HUBSPOT_ACCESS_TOKEN
CALCOM_API_KEY
GOOGLE_CLIENT_ID           GOOGLE_CLIENT_SECRET       GOOGLE_REFRESH_TOKEN
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
JWT_SECRET                 ADMIN_EMAIL                ADMIN_EMAILS
CALENDAR_TIMEZONE          RESEND_API_KEY             PORTAL_FROM_EMAIL
NEXT_PUBLIC_APP_URL        NEXT_PUBLIC_GA_MEASUREMENT_ID
GITHUB_TOKEN               (for route optimizer trigger)
```

### GitHub Secrets
```
GOOGLE_CLIENT_ID  GOOGLE_CLIENT_SECRET  GOOGLE_REFRESH_TOKEN
GOOGLE_MAPS_API_KEY    (Distance Matrix)
GOOGLE_PLACES_API_KEY  (Places API — local name is GOOGLE_API_KEY)
CALCOM_API_KEY
```

---

## Common Tasks

| Task | Command |
|------|---------|
| Deploy portal | `./scripts/deploy.sh portal` |
| Deploy static site | `./scripts/deploy.sh site` |
| Deploy both | `./scripts/deploy.sh all` |
| Build portal locally | `cd app && npm run build` |
| Trigger route optimizer | `gh workflow run route-optimizer.yml` |
| Add HubSpot contact | Use Clients → manual or via cal.com booking |

---

## Rules — Don't Break These

- **Pages Router only** — all pages in `app/pages/`. Never use `app/app/`.
- **JavaScript only** — no TypeScript.
- **No subscription creation** — billing is invoice-based via Customer Rounds.
- **All scheduling via Cal.com.**
- **Cal.com UID matching** — use same-day date matching (not 5-min tolerance) since GCal and Cal.com times may differ.
- **Depot address** in `_scripts/route_optimizer.py` line ~19: `1519 Parkway, Austin, TX 78703`.
- **Always deploy after portal changes** — run `./scripts/deploy.sh portal` after any edit to `app/`. Changes are not live until deployed; never assume a code change took effect without deploying.
- **Rounds reads live GCal only** — `/admin/rounds` must never read from the route plan cache. The route plan (`getLatestRoutePlan`) is for `/admin/route` only. Rounds always calls `getTodaysBookings()` / `getBookingsForDate()` directly so new appointments are never missed.

---

## Data Flow

```
Cal.com booking → Google Calendar (auto-synced)
  → Customer Rounds reads GCal for today's stops
  → Tech logs visit → invoice generated → customer pays

Quote flow:
  Admin builds quote → shares link → customer approves
  → Stripe one-time payment (first month + setup fees)
  → Customer books installation via Cal.com embed
```

---

## ⚠ Two-session coordination (prototype showcase)

Two Claude Code sessions run across this repo + `/Users/lucille/Trap Design`.
They share only the filesystem — respect lanes + locks. Full detail:
`/Users/lucille/Trap Design/CLAUDE.md` and `Trap Design/CFD/SESSIONS.md`.

- **Lanes — never edit another lane's files.** Halo Garden + Monolith family
  (`astro/public/render.html`, `render-mini.html`, `monolith-bf.html`, `titan.html`,
  `halo-*.html`, `cutsheet-*.html`) = Session A. Aria (`aria.html`, `aria-tests.html`,
  `aria-*.html`) = Session B.
- **`astro/public/prototypes.html` is SHARED — single-writer.** Before editing:
  `bash "/Users/lucille/Trap Design/CFD/lock.sh" acquire prototypes`, then re-READ and
  INSERT only your product block (never rewrite the file), then `... release prototypes`.
- **Deploy:** either session may `./scripts/deploy.sh astro`, but re-read prototypes.html first.
- **CFD/render builds:** one at a time via `Trap Design/CFD/cfd_queue.sh` (see CFD/QUEUE.md).
