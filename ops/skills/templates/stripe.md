# {{name}} Stripe Review

Check payments, invoices, failed charges, and webhook health.

## Quick billing overview
```bash
STRIPE_SECRET_KEY=$(grep STRIPE_SECRET_KEY /path/to/repo/app/.env | cut -d= -f2)
# Recent payments (last 10)
curl -s "https://api.stripe.com/v1/payment_intents?limit=10" -H "Authorization: Bearer $STRIPE_SECRET_KEY"
# Open invoices (unpaid)
curl -s "https://api.stripe.com/v1/invoices?status=open&limit=20" -H "Authorization: Bearer $STRIPE_SECRET_KEY"
# Failed invoices
curl -s "https://api.stripe.com/v1/invoices?status=uncollectible&limit=10" -H "Authorization: Bearer $STRIPE_SECRET_KEY"
```

## Webhook health
Two endpoints configured:
1. `{{website}}/api/webhooks/stripe` — handles invoice.payment_succeeded, invoice.payment_failed, checkout.session.completed, customer.subscription.deleted
2. `{{id}}-agent.onrender.com/stripe/webhook` — handles checkout.session.completed only (equipment/product orders)

Both should be `status: enabled`. Test with invalid sig → should return 401.

## Billing rules
- ALL prices are one-time — NO subscriptions (policy: `billing.oneTimeInvoicesOnly`, `billing.noSubscriptions`)
- Invoice-based via Rounds
- {{taxRate}}% tax applied server-side on checkout only (not manual invoices)
- Double-billing guard: booking UID in invoice metadata

<!-- tenant-catalog: edit for your catalog -->
## Key SKUs and prices (GreenGuard example — replace with your own)
- TANK-REFILL: $50/tank, TANK-DELIVERY-FEE: $39 (auto-bundled), TANK-HOOKUP-MAINT: $10/tank
- BARRIER: $49.99, BAIT: $10, BG-SWEETSCENT: varies
- Trap rental: BG1 $159.99/mo, BG2 $266.99/mo, BG3 $399.99/mo

## Failed payment resurrection flow
Schedule: policy `billing.paymentResurrectionDays` (T+0 auto-email → nudge → admin alert → marked lost)

## Arguments: optional customer email to check their specific billing
$ARGUMENTS
