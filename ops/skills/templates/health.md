# {{name}} System Health Check

Full end-to-end health check across all services. Run this when something seems wrong or as a weekly check-in.

## What to check

### 1. Portal ({{website}})
- GET {{website}} — expect 200 or 307
- POST {{website}}/api/webhooks/stripe with fake sig — expect 401 (not 500)
- GET {{website}}/admin/rounds — expect 307 to /login (not 500)

### 2. Render agent
- GET https://{{id}}-agent.onrender.com/health — expect 200
- Check deploy status via Render API (suspended state + latest deploy status):
  ```
  RENDER_API_KEY=$(grep RENDER_API_KEY /path/to/agent-repo/.env | cut -d= -f2)
  curl -s "https://api.render.com/v1/services/{{renderServiceId}}" -H "Authorization: Bearer $RENDER_API_KEY" | python3 -c "import json,sys; d=json.load(sys.stdin); print('suspended:', d.get('suspended'))"
  curl -s "https://api.render.com/v1/services/{{renderServiceId}}/deploys?limit=1" -H "Authorization: Bearer $RENDER_API_KEY" | python3 -c "import json,sys; d=json.load(sys.stdin); dep=d[0]['deploy']; print('latest deploy:', dep['status'], dep['createdAt'][:16])"
  ```
  - Expect: `suspended: not_suspended`, latest deploy status `live`
  - If status is `update_failed`: check Render dashboard logs

### 3. Marketing site
- GET the marketing site root — expect 200
- Validate JSON-LD: fetch homepage, extract `<script type="application/ld+json">` blocks, parse each as JSON

### 4. Billing webhooks
- Fetch webhook endpoints: `STRIPE_SECRET_KEY` from `app/.env`
- `curl -s "https://api.stripe.com/v1/webhook_endpoints" -H "Authorization: Bearer $KEY"` — both should be `status: enabled`

### 5. Cron jobs
- Manually trigger quote-followup: `curl -s -X POST -H "x-cron-key: $CRON_SECRET" {{website}}/api/cron/quote-followup`
- Should return `{"scanned":N,...}` with no errors array items
- `CRON_SECRET` is in `app/.env`

### 6. Recent Vercel errors
- Use Vercel MCP tool: `get_runtime_logs` with `level: ["error"]`, `since: "24h"`, project `{{vercelProjectId}}`

## Output
Report each check as PASS or FAIL with details. Flag anything that needs attention.
