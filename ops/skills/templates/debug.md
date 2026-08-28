# {{name}} Debug / Error Investigation

Diagnose a Sentry alert, Vercel error, or system failure.

## Step 1: Identify the service
- Portal errors → check Vercel runtime logs (Vercel MCP `get_runtime_logs`, project `{{vercelProjectId}}`)
- Render errors → check the agent service logs via Render API (service `{{renderServiceId}}`)
- Cron missed check-in → Vercel Hobby crons fire up to 30 min late; manually trigger to test

## Step 2: Common failure patterns
- **Webhook 500** → bare DB/network call before res.status(200) — wrap in try/catch
- **CRM lookup "not a function"** → wrong import name, check the exported function name
- **DB drops connection** → the pool client re-raises; callers need try/except
- **JSON-LD parse error** → `{JSON.stringify()}` in an Astro script tag needs `set:html=` directive
- **Stripe webhook 401** → `STRIPE_WEBHOOK_SECRET` env var, or signature verification failing
- **Cron "missed check-in"** → Vercel late by up to 30 min; not a real failure; check logs

## Step 3: Check the code
- Portal: `app/`
- Render agent: agent repo
- Marketing site: `astro/src/`

## Step 4: Deploy the fix
Use `/{{id}}-deploy` after fixing.

## Env var locations
- Portal env: `app/.env`
- Render/agent env: agent repo `.env`
- Vercel CLI token: `~/Library/Application Support/com.vercel.cli/auth.json`

## Arguments: paste the error message or Sentry issue description
$ARGUMENTS
