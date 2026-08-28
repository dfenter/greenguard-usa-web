# {{name}} Environment Variables

Add, update, or audit environment variables across all services.

## Where env vars live
- **Portal (Vercel)**: managed via `vercel env` CLI or Vercel dashboard — `app/` project
  - Local read: `app/.env` (DO NOT use `vercel env pull` — returns empty strings)
- **Render (agent)**: managed via Render API — PUT replaces entire list, must pull first
  - Local reference: agent repo `.env`

## Add/update a Vercel env var
```bash
cd /path/to/repo/app
vercel env add VAR_NAME production  # interactive, prompts for value
# Or to update:
vercel env rm VAR_NAME production && vercel env add VAR_NAME production
```

## Add/update a Render env var (MUST pull all first, then PUT back)
```bash
RENDER_API_KEY=$(grep RENDER_API_KEY /path/to/agent-repo/.env | cut -d= -f2)
SVC="{{renderServiceId}}"
# 1. Pull current vars
CURRENT=$(curl -s "https://api.render.com/v1/services/$SVC/env-vars" -H "Authorization: Bearer $RENDER_API_KEY")
# 2. Add new var to the JSON array and PUT back
# 3. PUT the full updated array
curl -s -X PUT "https://api.render.com/v1/services/$SVC/env-vars" \
  -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
  -d '[...full array with new var added...]'
```
**Warning: PUT replaces ALL env vars. Always pull first.**

## Key shared secrets
- `CRON_SECRET` — shared across Vercel + Render + Cloudflare Worker + cron-job.org
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — in Vercel only
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` — in Vercel + GitHub
- `HUBSPOT_ACCESS_TOKEN` — in Vercel only
- `RESEND_API_KEY` — in Vercel only; Render has its own copy
- `BUSINESS_ID` / `NEXT_PUBLIC_BUSINESS_ID` — set to `{{id}}` in Vercel
- `CHAT_DAEMON_URL` / `CHAT_DAEMON_SECRET` — Tailscale Funnel URL + shared secret for the local inference appliance

## Audit all Vercel env vars
```bash
cd /path/to/repo/app && vercel env ls
```

## Arguments: VAR_NAME to check or add, with service (portal/render)
$ARGUMENTS
