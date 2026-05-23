# GreenGuard USA — Codebase Reference

## Repo Layout

Two independent Vercel deployments share this repo:

```
/                     → greenguard-usa.com (static marketing site)
  vercel.json         → build: python3 _scripts/build_vercel.py → out/
  *.html / *.js       → Squarespace-style content fragments (input to build script)

app/                  → portal.greenguard-usa.com (Next.js customer portal)
  vercel.json         → framework: nextjs, region: iad1
  pages/              → Pages Router (NOT App Router)
  lib/                → service clients (stripe, hubspot, gcal, calcom, email)
  public/data/        → generated route plans (route_plan_YYYY-WW.json)
```

**Stack:** Next.js 14.2.29, React 18, JavaScript only (no TypeScript), no database.
All persistent state lives in Stripe, HubSpot, and Google Calendar.

---

## Services & Integration Map

### Stripe — `app/lib/stripe.js`
- Billing source of truth: subscriptions, invoices, customers
- 23 price IDs mapped in `PRICE_ID_MAP` (env vars `STRIPE_PRICE_*`)
- Webhook: `POST /api/webhooks/stripe` — handles `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.deleted`
- Subscription SKUs: BG1, BG2, BG3, MQ-RENT, MQ-SVC, OWN-BG, OWN-MQ
- One-time SKUs (invoice items): TANK*, ASSESS, CHK, TRAP-INSTALL, TRAP-MAINT-*, TIMER-INSTALL, BARRIER, BAIT, BG-SWEETSCENT, CO2-ADDON, WKD-SURCH

**Env vars:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, 23× `STRIPE_PRICE_*`
**MCP:** Stripe MCP (configured in `.claude/settings.json`)

### HubSpot — `app/lib/hubspot.js`
- CRM: every booking and payment creates/updates a contact
- Custom properties: `system_type`, `trap_count`, `tank_count`, `stripe_customer_id`, `calcom_booking_uid`, `payment_status`, `customer_status`
- `upsertContact()`, `addNote()`, `findContactByEmail()`, `countContactsByProperty()`

**Env vars:** `HUBSPOT_ACCESS_TOKEN`
**MCP:** HubSpot MCP at `https://mcp.hubspot.com` (OAuth)

### Cal.com — `app/lib/calcom.js` + `app/pages/api/webhooks/calcom.js`
- 13 event types defined in `app/lib/cal-event-types.json`
- Webhook: `POST /api/webhooks/calcom` — fires on `BOOKING_CREATED`, resolves SKUs, creates Stripe subscription/invoice, upserts HubSpot contact
- Admin booking: `POST /api/admin/book` (uses Cal.com v2 API — requires `CALCOM_API_KEY` in Vercel)
- Route optimizer also uses `CALCOM_API_KEY` (GitHub Actions secret)
- **IMPORTANT:** `app/.env.example` incorrectly says CALCOM_API_KEY is GitHub-only — it must be in Vercel too

**Env vars:** `CALCOM_API_KEY` (Vercel + GitHub), `CALCOM_WEBHOOK_SECRET` (Vercel only)
**MCP:** Cal.com MCP at `https://mcp.cal.com` (OAuth)

### Google Calendar — `app/lib/gcal.js`
- Calendar ID: `admin@greenguard-usa.com`
- Auth: OAuth2 refresh token (one-time setup via `_scripts/get-google-refresh-token.py`)
- `getUpcomingBookingsForEmail()`, `getPastBookingsForEmail()`, `getBookingsForWeek()`

**Env vars:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` (Vercel + GitHub)
**MCP:** Google Calendar MCP at `https://calendarmcp.googleapis.com` (OAuth)

### Google Places — `_scripts/fetch_reviews.py` (GitHub Actions)
- Place ID: `ChIJx8wLC4K11wwRbfe7hhZiHXs`
- Local env var: `GOOGLE_API_KEY` → GitHub secret name: `GOOGLE_PLACES_API_KEY` (different names — handled in env-sync.sh)
- Runs daily at 03:00 CST, commits `reviews.json`

**Env vars:** `GOOGLE_API_KEY` (local/Vercel) → `GOOGLE_PLACES_API_KEY` (GitHub secret name)

### Google Maps
- **Public embed key** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` → Vercel only, restricted to `portal.greenguard-usa.com/*`
- **Server-side Distance Matrix key** `GOOGLE_MAPS_API_KEY` → GitHub Actions secret only (route optimizer)

### Resend — `app/lib/email.js`
- Magic link auth email only: `sendMagicLink()`
- From: `PORTAL_FROM_EMAIL` (default: `noreply@greenguard-usa.com`)

**Env vars:** `RESEND_API_KEY`, `PORTAL_FROM_EMAIL`
**MCP:** Resend MCP (`resend-mcp` npm package)

### Auth — `app/lib/auth.js`
- Magic link + JWT session cookie (`gg_session`, 30-day, httpOnly, SameSite=Lax)
- Admin check: `session.email === process.env.ADMIN_EMAIL` (default: `admin@greenguard-usa.com`)
- Magic tokens: 15-min expiry; session tokens: 30-day expiry, HS256
- Generate secret: `openssl rand -hex 32`

**Env vars:** `JWT_SECRET` (min 32 chars), `ADMIN_EMAIL`, `NEXT_PUBLIC_APP_URL`

### GitHub Actions
- `.github/workflows/fetch-reviews.yml` — daily 03:00 CST, runs `_scripts/fetch_reviews.py`, commits `reviews.json`
- `.github/workflows/route-optimizer.yml` — Monday 09:00 CST, runs `_scripts/route_optimizer.py`, commits `app/public/data/route_plan_YYYY-WW.json`, opens GitHub issue for route approval

### Render
- Already in use — run `render services list` or use Render MCP to inspect
- Config: `render.yaml` (repo root) — update based on live service state
- Access token for Claude Code: `RENDER_API_KEY` (local `.env` only, never synced to Vercel/GitHub)

**MCP:** Render MCP at `https://mcp.render.com/mcp` (API token)

### Tidio (Chat Widget)
- Hardcoded key in `_scripts/build_vercel.py`: `2oaqyblfyjn6xy86vutzzvr1ykg9twav`
- Static marketing site only — not in portal
- Not a secret (public widget key)

### Google Analytics 4
- `NEXT_PUBLIC_GA_MEASUREMENT_ID` injected in `app/pages/_app.js`

---

## Environment Variables

### Vercel (portal.greenguard-usa.com)
```
STRIPE_SECRET_KEY          STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_BG1           STRIPE_PRICE_BG2          STRIPE_PRICE_BG3
STRIPE_PRICE_MQ_RENT       STRIPE_PRICE_MQ_SVC        STRIPE_PRICE_OWN_BG
STRIPE_PRICE_OWN_MQ        STRIPE_PRICE_MQ_INST       STRIPE_PRICE_MQ_TSHOOT
STRIPE_PRICE_TANK1         STRIPE_PRICE_TANK2         STRIPE_PRICE_TANK3
STRIPE_PRICE_TANK4         STRIPE_PRICE_TANK6         STRIPE_PRICE_TANK10
STRIPE_PRICE_BARRIER       STRIPE_PRICE_BAIT          STRIPE_PRICE_BG_SWEETSCENT
STRIPE_PRICE_CO2_ADDON     STRIPE_PRICE_TRAP_INSTALL  STRIPE_PRICE_TRAP_MAINT_1
STRIPE_PRICE_TRAP_MAINT_2  STRIPE_PRICE_TIMER_INSTALL STRIPE_PRICE_WKD_SURCH
HUBSPOT_ACCESS_TOKEN
CALCOM_WEBHOOK_SECRET      CALCOM_API_KEY
GOOGLE_CLIENT_ID           GOOGLE_CLIENT_SECRET       GOOGLE_REFRESH_TOKEN
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
JWT_SECRET                 ADMIN_EMAIL                CALENDAR_TIMEZONE
RESEND_API_KEY             PORTAL_FROM_EMAIL
NEXT_PUBLIC_APP_URL        NEXT_PUBLIC_GA_MEASUREMENT_ID
```

### GitHub Secrets (Actions workflows)
```
GOOGLE_CLIENT_ID  GOOGLE_CLIENT_SECRET  GOOGLE_REFRESH_TOKEN
GOOGLE_MAPS_API_KEY    (Distance Matrix — route optimizer)
GOOGLE_PLACES_API_KEY  (Places API — fetch reviews; local name is GOOGLE_API_KEY)
CALCOM_API_KEY
```

### Render (via env-sync.sh --render-only)
Inspect live service first (`render services list`), then sync relevant vars.
Minimum: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `HUBSPOT_ACCESS_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`

### Local-only (never synced)
```
RENDER_API_KEY   (Render CLI/MCP access)
VERCEL_TOKEN     (Vercel CLI/MCP access)
GITHUB_TOKEN     (GitHub CLI/MCP access — use `gh auth token`)
STRIPE_SECRET_KEY can be reused directly by Stripe MCP
```

---

## SKU System

**SKU resolution order** (`app/lib/sku-engine.js`):
1. `resolveByTitle(title)` — matches Cal.com event title against `app/lib/cal-event-types.json`
2. `resolveSKU(visit)` — fallback using `visitType`, `systemType`, `trapCount` fields

**`isSubscriptionSKU(sku)`** determines Stripe subscription vs invoice item.

To add a SKU:
1. Add price ID entry to `PRICE_ID_MAP` in `app/lib/stripe.js`
2. Add pricing to `SKU_PRICES` in `app/lib/sku-engine.js`
3. Add env var `STRIPE_PRICE_NEWSKU` to `app/.env.example`
4. Add event type to `app/lib/cal-event-types.json` if booking-driven

---

## Webhook Endpoints (configure in each service dashboard)
- **Stripe:** `https://portal.greenguard-usa.com/api/webhooks/stripe`
- **Cal.com:** `https://portal.greenguard-usa.com/api/webhooks/calcom`

---

## Common Tasks

| Task | Command / File |
|------|---------------|
| Run tests | `cd app && npm test` |
| Run linter | `cd app && npm run lint` |
| Build portal locally | `cd app && npm run build` |
| Build static site | `python3 _scripts/build_vercel.py` |
| Deploy portal | `./scripts/deploy.sh portal` |
| Deploy static site | `./scripts/deploy.sh site` |
| Deploy both | `./scripts/deploy.sh all` |
| Sync env vars | `./scripts/env-sync.sh` |
| Health check | `./scripts/health-check.sh` |
| New JWT secret | `openssl rand -hex 32` |
| Trigger route optimizer | `gh workflow run route-optimizer.yml` |
| Trigger review fetch | `gh workflow run fetch-reviews.yml` |
| List Render services | `render services list` |

---

## Rules — Don't Break These

- **Pages Router only** — all pages live in `app/pages/`. Never use `app/app/`.
- **JavaScript only** — no TypeScript, no `.ts`/`.tsx` files.
- **Keep `bodyParser: false`** in `app/pages/api/webhooks/calcom.js` — raw body needed for HMAC verification.
- **`CALCOM_API_KEY` goes in Vercel** — `app/.env.example` has an incorrect comment; the admin booking route reads it.
- **Google secret name mismatch** — local `GOOGLE_API_KEY` must be named `GOOGLE_PLACES_API_KEY` in GitHub Secrets (handled by `env-sync.sh`).
- **Depot address** in `_scripts/route_optimizer.py` line ~19: `1519 Parkway, Austin, TX 78703` — update here if depot moves.

---

## Data Flow

```
Cal.com booking → BOOKING_CREATED webhook
  → SKU resolution (cal-event-types.json + sku-engine.js)
  → Stripe: createSubscription() or addInvoiceItems()
  → HubSpot: upsertContact() + addNote()
  → Google Calendar: event already synced by Cal.com

Stripe payment event → invoice.payment_succeeded webhook
  → HubSpot: addNote() with payment details

GitHub Actions (Monday) → route_optimizer.py
  → Google Calendar: read week's bookings
  → Google Maps: optimize route
  → Cal.com API: reschedule if needed
  → Commit route_plan_YYYY-WW.json
  → Open GitHub issue for approval
```
