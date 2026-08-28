# {{name}} Invoice Management

Generate, check, or manage invoices for a customer.

## Check invoices for a customer
```bash
STRIPE_SECRET_KEY=$(grep STRIPE_SECRET_KEY /path/to/repo/app/.env | cut -d= -f2)
curl -s "https://api.stripe.com/v1/customers/search?query=email:\"EMAIL\"" -H "Authorization: Bearer $STRIPE_SECRET_KEY"
# Then:
curl -s "https://api.stripe.com/v1/invoices?customer=CUST_ID&limit=10" -H "Authorization: Bearer $STRIPE_SECRET_KEY"
```

## Generate invoice from Rounds
1. Go to {{website}}/admin/rounds
2. Find the customer stop → log services → click "Generate Invoice"
3. The portal auto-creates a draft invoice with the right line items

## Invoice Admin UI
- {{website}}/admin/invoice — search by name, view/send/void
- Open invoices = awaiting payment; Draft = not sent yet
- "Send" finalizes and emails the customer their hosted invoice link

## Billing rules
- All billing is one-time (invoice-based) — NO subscriptions (policy: `billing.noSubscriptions`)
- Tax: {{taxRate}}% applied server-side on portal checkout, not on invoices (billing platform handles separately)
- Double-billing guard: booking UID stored in invoice metadata
<!-- tenant-catalog: edit for your catalog -->
- SKUs: see `lib/businesses/{{id}}/catalog.js`

## Failed payment follow-up
- Webhook fires `invoice.payment_failed` → T+0 email sent automatically
- Follow-up schedule: policy `billing.paymentResurrectionDays`
- Check `/api/cron/quote-followup` results for outstanding quotes

## Arguments: customer name or email
$ARGUMENTS
