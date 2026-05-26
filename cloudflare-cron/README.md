# greenguard-cron — Cloudflare Workers Cron

Replaces all `.github/workflows/cron-*` jobs. GitHub suspended @greenguard-usa
for "using Actions to interact with 3rd-party APIs"; this stack runs the
same schedules from Cloudflare instead, free tier, no GitHub Actions usage.

## Architecture — 3 Workers (Free plan)

Cloudflare Workers Free caps each Worker at 5 cron triggers. We split into
three so we never need Workers Paid:

| Worker | Triggers | Targets |
|---|---|---|
| `portal/`       | 5 | Vercel portal `/api/cron/*` |
| `agent-daily/`  | 4 | Render webhook `/cron/*` (daily) |
| `agent-fast/`   | 2 | email-agent (5m) + books-ingest + inline site-health (15m) |

Total: 11 cron patterns covering everything from the old workflows except
fetch-reviews and route-optimizer (those commit JSON back to the repo and
need a different migration — see TODO at bottom).

## Deploy

```bash
cd cloudflare-cron
npm install                          # installs wrangler

# One-time: log in
npx wrangler login

# Deploy each worker
cd portal      && npx wrangler secret put CRON_SECRET             && npx wrangler deploy && cd ..
cd agent-daily && npx wrangler secret put CRON_SECRET             && npx wrangler deploy && cd ..
cd agent-fast  && npx wrangler secret put CRON_SECRET             \
               && npx wrangler secret put RESEND_API_KEY          \
               && npx wrangler secret put VERCEL_SITE_DEPLOY_HOOK \
               && npx wrangler deploy && cd ..
```

All three Workers use the **same `CRON_SECRET`** as Render + Vercel.

## Smoke test

Each Worker exposes `/run?name=<jobname>`:

```bash
curl https://greenguard-cron-portal.<sub>.workers.dev/run?name=billing-warn
curl https://greenguard-cron-agent-daily.<sub>.workers.dev/run?name=daily-route
curl https://greenguard-cron-agent-fast.<sub>.workers.dev/run?name=site-health
```

Tail live logs while crons fire:

```bash
cd portal && npx wrangler tail
```

## Targets

### Vercel portal — already set up

The portal's `lib/cron-auth.js` accepts both `Authorization: Bearer` and
`x-cron-key` headers — Worker sends both. The portal has `CRON_SECRET` in
its Production env vars; **it currently shows as empty when pulled via
CLI; verify it's actually set and matches the value used here**.

### Render webhook — needs CRON_SECRET (done) + agent env vars (NOT done)

CRON_SECRET has been added via the Render API. But the new agent-* cron
endpoints in `webhook_server.py` import `appointment_reminder`, `main`,
`daily_route` etc., which require the Gmail/Twilio/etc. env vars the
Render service currently lacks. See the user-action list outside this
README.

## Still on GitHub Actions (TODO)

| Workflow | Reason | Plan |
|---|---|---|
| `fetch-reviews.yml`   | Commits `reviews.json` back to repo | Rewrite `astro/src/lib/reviews.ts` to fetch from Places at build time; Cloudflare pings deploy hook daily |
| `route-optimizer.yml` | Commits weekly route plan JSON to repo | Copy script into greenguard_agent, add `/cron/route-optimizer`, store result in DB, portal reads via HTTP |

Both are low-volume (1×/day and 1×/week) so unlikely to retrigger the
suspension on their own.

## Rollback

```bash
npx wrangler delete greenguard-cron-portal
npx wrangler delete greenguard-cron-agent-daily
npx wrangler delete greenguard-cron-agent-fast
```

The `.github/workflows/cron-*.yml` files are still in the repo; remove
their `.disabled` suffix (if we add one) or `git revert` the delete commit
to re-enable.
