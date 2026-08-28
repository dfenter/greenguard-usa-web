# {{name}} Security Audit

Periodic security checks — run monthly or after any suspected breach.

## Webhook secrets
```bash
STRIPE_SECRET_KEY=$(grep STRIPE_SECRET_KEY /path/to/repo/app/.env | cut -d= -f2)
# Verify both webhooks are active and using current secret
curl -s "https://api.stripe.com/v1/webhook_endpoints" -H "Authorization: Bearer $STRIPE_SECRET_KEY" \
  | python3 -c "import json,sys; [print(w['url'], w['status']) for w in json.load(sys.stdin)['data']]"
```

## Billing webhook test (must return 401, not 500)
```bash
curl -s -w "\nHTTP:%{http_code}" -X POST \
  {{website}}/api/webhooks/stripe \
  -H "Content-Type: application/json" -H "stripe-signature: t=fake,v1=bad" \
  -d '{"type":"test"}'
```

## Admin auth check
- Magic link tokens expire after 1 hour (set in `lib/auth.js` MAGIC_LINK_EXPIRY)
- Session cookies: 90 days, httpOnly, Secure, SameSite=Lax
- Admin emails: check `ADMIN_EMAILS` env var includes all current admins
- `JWT_SECRET` should be a long random string — rotate if compromised

## API key rotation checklist
If rotating a key:
1. `STRIPE_SECRET_KEY` → update in Vercel + test all webhook + invoice endpoints
2. `HUBSPOT_ACCESS_TOKEN` → update in Vercel + test `/admin/clients`
3. `GOOGLE_REFRESH_TOKEN` → update in Vercel + GitHub secrets
4. `CRON_SECRET` → update in Vercel + Render + ALL cron-job.org jobs + Cloudflare Worker
5. `RESEND_API_KEY` → update in Vercel + Render
6. `CHAT_DAEMON_SECRET` → update in Vercel/Render env AND the appliance daemon config

## Cron auth
All cron endpoints protected by `lib/cron-auth.js` — checks `x-cron-key` or `Authorization: Bearer`
against `CRON_SECRET`. If `CRON_SECRET` is ever leaked, rotate immediately and update all consumers.

## Rate limiting
`/api/cron/*` endpoints — protected by cron-auth (secret required)
`/api/webhooks/*` — signature verification (Stripe HMAC, booking-platform HMAC)
Render agent has rate limiting on checkout-creation endpoints (10/min per IP)

## PII files to keep out of git
`.env`, `customers.csv`, `*.json` containing customer data, `token.json`, `credentials.json`
These are in `.gitignore` — verify with `git status` before any commit.

## Known limitation (v1.0)
The chat daemon uses a single shared secret across all callers on that Mac
appliance. Do not reuse a `CHAT_DAEMON_SECRET` across tenants sharing the
same appliance without additional per-tenant scoping.

## Arguments: optional specific check (stripe/auth/keys/crons)
$ARGUMENTS
