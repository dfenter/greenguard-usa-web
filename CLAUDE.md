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

**Stack:** Next.js 15, React 18, JavaScript only (no TypeScript), no database.
All persistent state lives in Stripe, HubSpot, and Google Calendar.

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
