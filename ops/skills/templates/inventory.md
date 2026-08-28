# {{name}} Equipment / Consumables Inventory

Daily inventory logging, stock-level tracking, and shortage alerts.

## Daily inventory page
{{website}}/admin/inventory (Daily Rounds)
Log: units on hand, units deployed, equipment counts.
Prefills from last known values — only change what's different.

## Demand calendar
{{website}}/admin/tank-calendar
Shows projected demand for the next 30 days based on booked appointments.
Flags shortage days in red. Used to plan restock orders.

## Save inventory reading
POST `/api/admin/save-inventory` with `{ ...counts }`
Stores reading in the CRM as an inventory-log note on the admin contact.

## Check current levels
```bash
CRON_SECRET=$(grep CRON_SECRET /path/to/repo/app/.env | cut -d= -f2)
curl -s -H "x-cron-key: $CRON_SECRET" \
  "{{website}}/api/admin/inventory"
```

<!-- tenant-catalog: edit for your catalog -->
## Consumable SKUs and pricing (GreenGuard example — replace with your own)
- TANK-REFILL: $50/tank
- TANK-DELIVERY-FEE: $39 per appointment (auto-bundled with refill)
- TANK-HOOKUP-MAINT: $10/tank (opt-in per stop)
- In post-visit email: all three rolled up into one "CO₂ Tank Service" line

## When to order more stock
Check the demand calendar for the next shortage day. Order when projected supply < 0 within 7 days.

## Arguments: optional date to check projected levels
$ARGUMENTS
