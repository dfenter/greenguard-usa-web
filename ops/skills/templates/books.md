# {{name}} Bookkeeping & Finance

Monthly close, daily ledger, and financial reporting.

## Daily books ingest
Cron runs automatically. Manual trigger:
```bash
CRON_SECRET=$(grep CRON_SECRET /path/to/repo/app/.env | cut -d= -f2)
curl -s -X POST -H "x-cron-key: $CRON_SECRET" {{website}}/api/cron/books-ingest
```
Pulls billing-platform transactions into the Postgres ledger.

## Daily brief
```bash
curl -s -X POST -H "x-cron-key: $CRON_SECRET" {{website}}/api/cron/books-daily
```

## Monthly close
```bash
curl -s -X POST -H "x-cron-key: $CRON_SECRET" {{website}}/api/cron/books-close
```

## Books UI
{{website}}/admin/books
- Upload CSV from bank/billing platform
- Categorize transactions (AI-assisted)
- Monthly close and P&L view
- Natural language chat: "What was revenue last month?"

## QuickBooks Online sync
- Status: GET `/api/admin/qbo-status`
- Sync: POST `/api/admin/qbo-sync`

## Revenue check (quick)
```bash
STRIPE_SECRET_KEY=$(grep STRIPE_SECRET_KEY /path/to/repo/app/.env | cut -d= -f2)
# This month's paid invoices
curl -s "https://api.stripe.com/v1/invoices?status=paid&limit=50&created[gte]=UNIX_TIMESTAMP" \
  -H "Authorization: Bearer $STRIPE_SECRET_KEY" | python3 -c "
import json,sys; d=json.load(sys.stdin)
total = sum(i['amount_paid'] for i in d['data'])
print(f'Month total: \${total/100:.2f} ({len(d[\"data\"])} invoices)')
"
```

## DB connection
`DATABASE_URL` is set in Vercel env. The `lib/db.js` pool handles idle-connection drops automatically.

## Arguments: optional month (YYYY-MM) for specific period report
$ARGUMENTS
