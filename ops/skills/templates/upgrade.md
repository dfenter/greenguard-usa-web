# {{name}} Customer Upgrade / Upsell

Propose and execute a system upgrade for an existing customer.

## Upgrade page (admin)
{{website}}/admin/upgrade?email=CUSTOMER_EMAIL
Shows current plan, upgrade options, pricing delta, and an "Upgrade" button.

<!-- tenant-catalog: edit for your catalog -->
## Common upgrade paths (GreenGuard example — replace with your own)
- 1 trap → 2 traps: add TRAP-INSTALL + update `trap_count` in the CRM
- Add CO₂ timer: add TIMER-INSTALL, set `has_timer=true` in the CRM
- Add barrier treatment as recurring: set `recurring_addons="BARRIER"` in the CRM
- Rent → Own: charge one-time OWN-BG price, update `plan_type=own`

## Execute upgrade via API
POST `/api/admin/execute-upgrade` with:
```json
{
  "customerEmail": "...",
  "upgradeType": "add-unit|add-addon|rent-to-own",
  "quantity": 1
}
```

## Generate upgrade proposal
POST `/api/admin/generate-proposal` — creates a shareable upgrade proposal document
similar to the quote flow, but for existing customers.

## After upgrade
1. Book installation appointment if new hardware needed
2. Update CRM plan/config properties
   <!-- tenant-catalog: edit for your catalog -->
3. Ensure next invoice includes the new recurring add-on
4. Update customer's route stop notes so the tech knows what changed

## Recurring add-ons
Set `recurring_addons` in the CRM — the invoice generator automatically appends these
to every service visit invoice.

## Arguments: customer email and desired upgrade
$ARGUMENTS
