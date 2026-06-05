# GreenGuard USA — Architecture & Runbooks

> Companion to `CLAUDE.md`. Covers deployment topology, full API reference, and operational runbooks.

---

## Deployment Topology

Three independent Vercel deployments share this repo, plus one Render service in a separate repo.

```
greenguard-usa-web (git repo)
│
├── /                        → greenguard-usa.com        (static marketing, Python build)
├── app/                     → portal.greenguard-usa.com (Next.js portal, iad1)
└── astro/                   → www.greenguard-usa.com    (Astro marketing site)

greenguard-agent (separate repo: dfenter/greenguard-agent)
└── webhook_server.py        → greenguard-agent-new.onrender.com  ← ACTIVE
                               greenguard-agent-tmw2.onrender.com ← legacy, still live
```

### Canonical Data Ownership

| Domain | Owner | Access |
|---|---|---|
| Customers, invoices, payments | Stripe | `app/lib/stripe.js` |
| CRM contacts, notes, lead status | HubSpot | `app/lib/hubspot.js` |
| Appointments | Google Calendar (`admin@greenguard-usa.com`) | `app/lib/gcal.js` |
| Booking creation/cancellation | Cal.com (syncs to GCal) | `app/lib/calcom.js` |
| Quote tokens | Signed JWTs (HS256, 30d, `JWT_SECRET`) | `app/lib/auth.js` |
| Weekly route plans | Render SQLite → Supabase PostgreSQL | `app/lib/route-plan.js` |
| Email delivery | Resend | `app/lib/email.js`, `app/lib/purchase-notify.js` |
| SMS | Twilio | `app/lib/sms.js` |

---

## Critical Data Flows

### Invoice flow (recurring service)
```
Tech logs visit → /admin/rounds
  → POST /api/admin/generate-invoice
    → Double-bill guard (cal_booking_uid + service_date metadata)
    → Stripe draft invoice, billing_date = service_date + 5 days
  → Vercel cron billing-run (daily) finalizes + charges/sends
  → Stripe fires invoice.payment_succeeded → /api/webhooks/stripe
    → HubSpot note, admin email+SMS, customer receipt via Resend
```

### Quote flow (new customer)
```
Admin builds quote → POST /api/admin/quote-link → signed JWT
Customer opens /quote/[token] → clicks Pay
  → POST /api/quote/checkout
    → JWT verified + JTI revocation check
    → TX 8.25% tax applied server-side (on services/products only, not shipping)
    → Stripe Checkout Session (mode: payment)
  → checkout.session.completed → /api/webhooks/stripe
    → Admin notified, customer receipt sent
    → Customer redirected to Cal.com embed to book installation
```

### Route optimizer flow
```
Cloudflare Cron (Mon 9am CT) or admin "Run Now" button
  → POST /api/admin/trigger-route (portal) → forwards to Render
  → Render: weekly_route_optimizer.main() in BackgroundTasks
    1. OAuth token refresh → Google Calendar query (Mon–Sat, "GreenGuard USA")
    2. Group by date, parse address + service duration
    3. Farthest-first + nearest-neighbor via Google Maps Distance Matrix
    4. Compute optimized arrival times starting 9am CT
    5. Persist to Supabase (route_plan:<YYYY-WNN> + route_plan:latest_week)
    6. Email route summary to admin via Resend
  → Portal reads via GET /route-plans/latest (90s TTL module cache)
    Fallback: app/public/data/route_plan_*.json (most recent past week)
```

### Booking source detection
Each GCal event is stamped with `booking_source` when the optimizer runs:
- `calcom` — description contains `cal.com/reschedule` or `cal.com/booking`
- `legacy` — description contains `AcuityID=`, `Acuity Scheduling`, or `squarespace.com`

The route plan and rounds pages use this to show the correct action:
- Cal.com → "Reschedule" link (cal.com/reschedule/{uid})
- Legacy → "Edit in GCal" link (direct Google Calendar event URL)

---

## API Reference

### Authentication

| Type | Where | How |
|---|---|---|
| `gg_session` JWT cookie | Portal pages/API | `requireAdmin` / `requireOwner` / `getSessionFromRequest` |
| `Authorization: Bearer <CRON_SECRET>` | Cron routes (portal + Render) | Header match on env var |
| HTTP Basic (`ADMIN_PASSWORD`) | Render `/billing/run`, `/admin/*` | FastAPI HTTPBasic |
| Stripe HMAC signature | `/api/webhooks/stripe` (portal + Render) | `stripe.webhooks.constructEvent` |
| Twilio HMAC signature | `/api/webhooks/twilio` | `twilio.validateRequest` |

### Next.js Portal — Key Routes

#### Quote
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/admin/quote-link` | Generate signed quote JWT + shareable URL |
| POST | `/api/quote/checkout` | Create Stripe Checkout from quote JWT; applies TX 8.25% tax |
| POST | `/api/admin/revoke-quote` | Invalidate a quote JTI |

#### Invoicing
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/admin/generate-invoice` | Create/find Stripe draft invoice with double-bill guard |
| POST | `/api/cron/billing-run?mode=run` | Finalize + charge/send all invoices due today |
| POST | `/api/cron/billing-run?mode=warn` | Email admin preview of tomorrow's invoices |

#### Route
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/admin/trigger-route` | Forward to Render `/cron/route-optimizer` (owner only) |

#### Webhooks
| Method | Path | Events |
|---|---|---|
| POST | `/api/webhooks/stripe` | `invoice.payment_succeeded/failed`, `checkout.session.completed`, `customer.subscription.deleted` |
| POST | `/api/webhooks/twilio` | Inbound SMS → HubSpot note |

### Astro Site — API Routes

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/lead-capture` | Create HubSpot contact; validates email (must contain `@` and `.`, 5–254 chars) |
| POST | `/api/checkout` | Stripe Checkout for shop cart; TX 8.25% tax on subtotal, shipping added after (exempt) |

### Render Agent — Key Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST/GET | `/cron/route-optimizer` | CRON_SECRET | Weekly route plan generation + persistence |
| POST/GET | `/cron/email-agent` | CRON_SECRET | Process Gmail inbox via AI agent |
| POST/GET | `/cron/appointment-reminders` | CRON_SECRET | T-2 day appointment reminders |
| POST/GET | `/cron/post-appointment` | CRON_SECRET | Post-visit thank-you messages |
| POST/GET | `/cron/review-followup` | CRON_SECRET | Google review request 5 days post-visit |
| GET | `/route-plans/latest` | CRON_SECRET | Current week's optimized route plan |
| POST | `/stripe/webhook` | Stripe HMAC | Shop order: admin email + customer confirmation |
| GET | `/health` | None | `{"status":"ok"}` |

---

## Runbooks

### Cancel an appointment

**Cal.com booking (all bookings since mid-2024):**
1. In `/admin/rounds`, click Cancel on the stop card. The portal calls `POST /api/admin/cancel-booking` which cancels via Cal.com API (notifies customer) and voids/deletes any open Stripe invoice.
2. Verify the GCal event disappears within ~30 seconds.

**Legacy Acuity booking (shows "Legacy" badge in route plan):**
1. Delete the GCal event directly in Google Calendar (`admin@greenguard-usa.com`).
2. Manually void the Stripe invoice in Stripe Dashboard if one exists.
3. Notify customer via `/api/admin/send-message` or direct email — no automatic notification.

To identify which type: open `/admin/route`, look for the gold "Legacy" badge. Or check the GCal event description — legacy events contain `AcuityID=`.

---

### Manually trigger route optimizer

```bash
# Via CLI
curl -X POST https://greenguard-agent-new.onrender.com/cron/route-optimizer \
  -H "Authorization: Bearer $CRON_SECRET"
# Returns: {"queued":"route-optimizer"}
```

Or click "Run Route Optimizer Now" in `/admin/route` (owner login required).

**Verify (wait ~2 min):**
```bash
curl -s https://greenguard-agent-new.onrender.com/route-plans/latest \
  -H "Authorization: Bearer $CRON_SECRET" | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('week:', d.get('week'))
for day in d.get('days',[]): print(f'  {day[\"date\"]}: {len(day.get(\"stops\",[]))} stops')
"
```

If the portal still shows a stale plan after 2 minutes, check Render logs. The 90s module cache means a forced refresh requires a portal cold start or 90s wait.

---

### Add a new product SKU

1. **Stripe Dashboard** — create product + one-time price, copy price ID.
2. **Vercel env** — add `STRIPE_PRICE_<SKU>=price_1...` to portal project.
3. **`app/lib/catalog.js`** — add entry to `ADDONS` or `PRODUCTS` array with `sku`, `label`, `price`, `surfaces`, `quoteCategory`. Add `shipping` if physical.
4. **`app/pages/api/admin/generate-invoice.js`** — add `'MY-SKU': 'STRIPE_PRICE_MY_SKU'` to `SKU_TO_ENV` map.
5. **Verify** — open Rounds, confirm item appears. Generate test invoice, confirm line item and price.

Items with `sku: null` use catalog price directly without a Stripe price object.

---

### Diagnose missing webhook notification

1. **Stripe Dashboard → Developers → Webhooks** — find the relevant endpoint, check "Recent deliveries". Non-200 response = portal or Render error.
2. **Vercel logs** — portal → Functions → `/api/webhooks/stripe`. Look for `Webhook signature failed` (wrong `STRIPE_WEBHOOK_SECRET`) or `purchase notify` errors.
3. **Required env vars** for notifications: `RESEND_API_KEY`, `PORTAL_FROM_EMAIL`, `STRIPE_WEBHOOK_SECRET`. Missing `RESEND_API_KEY` silently skips email without throwing.
4. **Shop orders** route through Render `/stripe/webhook`, not the portal. Check Render logs separately. The Stripe webhook endpoint must point to `greenguard-agent-new.onrender.com/stripe/webhook`.
5. **Re-send** — Stripe Dashboard → click event → Resend. Portal webhook is safe to replay (notifications are not deduped internally).

---

### Deploy

```bash
./scripts/deploy.sh portal   # portal.greenguard-usa.com (Next.js)
./scripts/deploy.sh astro    # www.greenguard-usa.com (Astro) ← use this for astro/ changes
./scripts/deploy.sh site     # greenguard-usa.com (static Python build)
./scripts/deploy.sh all      # all three in sequence
```

**Render agent** — push to `dfenter/greenguard-agent` on GitHub. Render auto-deploys on new commits. Verify at `https://greenguard-agent-new.onrender.com/health`.

**Env var changes on Render** — use Render API (pull all vars, append, PUT back). Never edit directly via dashboard for shared vars — pull first to avoid overwriting others.

---

## Known Quirks

- **Cal.com API key scope** — only has event-type scope; `getBookingsForEmail()` always returns `[]`. Booking UIDs come from the route optimizer matching by date/email against Cal.com bookings, not from a direct lookup. The Cal.com fan-out in `route.js` was removed for this reason.
- **Stripe receipt emails** — account-level "email customers" is OFF. All customer receipts sent via Resend in webhook handlers. Never assume Stripe emailed the customer.
- **Render free tier** — spins down after 15 min inactivity; first request after spin-down takes ~30s. Route plan fetches use a 90s module-level cache in `route-plan.js` to reduce cold-start hits.
- **Tax** — TX 8.25% applied server-side to all quote and shop checkouts. Applied to services/products only; TX separately-stated delivery charges are exempt and added after tax.
- **Legacy bookings** — Acuity/Squarespace events in GCal have no Cal.com UID. Stamped `booking_source: 'legacy'` by the route optimizer. Cancel/reschedule via GCal directly, not Cal.com API.
