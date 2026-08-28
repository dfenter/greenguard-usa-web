# {{name}} Weekly Business Review

Weekly KPI snapshot — run every week per policy `rhythm.weeklyReview` (defaults to Monday).

## Revenue
```bash
STRIPE_SECRET_KEY=$(grep STRIPE_SECRET_KEY /path/to/repo/app/.env | cut -d= -f2)
python3 -c "
import urllib.request, json, time
sk = '$STRIPE_SECRET_KEY'
week_ago = int(time.time()) - 7*86400
req = urllib.request.Request(
  f'https://api.stripe.com/v1/invoices?status=paid&limit=50&created[gte]={week_ago}',
  headers={'Authorization': f'Bearer {sk}'})
d = json.loads(urllib.request.urlopen(req).read())
total = sum(i['amount_paid'] for i in d['data'])
print(f'Last 7 days: \${total/100:.2f} across {len(d[\"data\"])} invoices')
"
```

## Appointments this week
Use Google Calendar MCP: `list_events` from today to +7 days on `{{calendarId}}`.
Count by service type.

## Outstanding invoices
Check `/admin/invoice` or:
```bash
curl -s "https://api.stripe.com/v1/invoices?status=open&limit=20" -H "Authorization: Bearer $KEY"
```

## Quote pipeline
Check CRM notes for recent QUOTE-SENT with no QUOTE-PAID marker.
Run `/{{id}}-quote` to see follow-up status.

## New customers this week
CRM contacts created in last 7 days (check via `/admin/clients`, filter by date) —
this also feeds the weekly new-customer audit (policy: `rhythm.newCustomerAudit`).

## Cron health
Run `/{{id}}-crons` check — verify all jobs ran successfully.

## Actions if issues found
- Outstanding invoices > 7 days → send manual reminder or check payment resurrection cron
- Missing appointments → check calendar sync from booking platform
- Revenue below normal → check for failed payments in the billing platform

## Full dashboard
{{website}}/admin/home — Today's stops, KPIs, open invoices, revenue chart

## Arguments: optional date range (YYYY-MM-DD to YYYY-MM-DD)
$ARGUMENTS
