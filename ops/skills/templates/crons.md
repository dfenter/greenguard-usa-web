# {{name}} Cron Jobs

Check, trigger, or debug scheduled jobs.

## Cron inventory
- **Vercel crons** (in `app/vercel.json`, fires ~1/day each, up to 30 min late):
  - `/api/cron/quote-followup` (quote follow-up sequence)
  - `/api/cron/payment-resurrection` (failed payment follow-up schedule)
  - `/api/cron/daily-summary`

- **Cloudflare Worker** (fast-tier agent crons):
  - Every 5 min → `POST /cron/email-agent` (Render)
  - Every 15 min → `POST /api/cron/books-ingest` (Vercel) + site health

- **cron-job.org** (misc jobs): billing-warn, billing-run, books-daily, books-close, daily-route, post-appointment, review-followup, appointment-reminders, route-optimizer

## Manually trigger any cron
```bash
CRON_SECRET=$(grep CRON_SECRET /path/to/repo/app/.env | cut -d= -f2)
curl -s -X POST -H "x-cron-key: $CRON_SECRET" {{website}}/api/cron/ENDPOINT
# Or for the Render agent:
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" https://{{id}}-agent.onrender.com/cron/ENDPOINT
```

## Vercel cron firing late
Normal — Hobby tier can be up to 30 minutes late. Sentry monitors configured with `checkinMargin: 30`. If it misses by more than 30 min, investigate.

## Auth
All cron endpoints use `lib/cron-auth.js` — checks `x-cron-key` header or `Authorization: Bearer` against `CRON_SECRET`.

## Adding a new cron
Use cron-job.org (free, any schedule) — do NOT use GitHub Actions. Add endpoint with `Authorization: Bearer CRON_SECRET` header.

## Arguments: optional cron name to trigger manually
$ARGUMENTS
