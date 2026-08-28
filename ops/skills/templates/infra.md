# {{name}} Infrastructure Reference

Quick reference for all system IDs, URLs, and deployment targets.

## Services
| Service | URL | Where code lives |
|---------|-----|-----------------|
| Portal | {{website}} (portal subdomain) | `app/` |
| Marketing (Astro) | {{website}} | `astro/src/` |
| Agent/Webhooks | {{id}}-agent.onrender.com | agent repo |

## Vercel project id
- Portal (`app`): `{{vercelProjectId}}`

## Render
- Active service: `{{renderServiceId}}`

## Git repos
- Main repo: your git host, SSH alias per `~/.ssh/config`
- Agent: same host, separate repo if applicable

## Env var locations
- Portal: `app/.env`
- Agent/Render: agent repo `.env` (has `RENDER_API_KEY`)
- Vercel CLI token: `~/Library/Application Support/com.vercel.cli/auth.json`

## Key integrations
- Billing (Stripe): invoice-based billing, one-time only (policy: `billing.oneTimeInvoicesOnly`)
- CRM (HubSpot): canonical customer config — see policy `data.crmCanonicalFor`
- Google Calendar ({{calendarId}}): source of truth for all appointments (policy: `data.calendarCanonicalFor`)
- Booking platform: customer-facing booking, syncs to GCal
- Transactional email: all customer-facing email
- cron-job.org: all non-Vercel cron jobs (no GitHub Actions for crons)

## Deploy commands
```bash
cd /path/to/repo
./scripts/deploy.sh portal   # Next.js portal
./scripts/deploy.sh astro    # Marketing site
./scripts/deploy.sh all      # Both
```
