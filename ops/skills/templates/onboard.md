# {{name}} New Customer Onboarding

Full end-to-end checklist for onboarding a new customer.

## Step 1: CRM contact
Create or verify contact exists:
- `upsertContact({ email, name, phone })` via `lib/hubspot.js`
- Set system properties for the customer's plan/config
  <!-- tenant-catalog: edit for your catalog -->
- Set `address` for route planning
- Set `recurring_addons` if customer has ongoing add-ons

## Step 2: Send quote (if not already paid)
Use `/{{id}}-quote` workflow or direct link from `/admin/quote`

## Step 3: Book installation appointment
- Use admin booking page: {{website}}/admin/booking
- Pre-fill: `?email=X&name=Y&phone=Z&address=A`
<!-- tenant-catalog: edit for your catalog -->
- Book the correct install/setup event type for the customer's plan
- Admin bookings skip the 24h minimum notice restriction

## Step 4: Send booking confirmation
- The booking platform sends its own confirmation email
- If the customer should also receive a welcome email: it's auto-sent after quote checkout
- For manual bookings: send a post-visit summary after the install via `/admin/rounds`

## Step 5: Verify CRM after installation
- Note should be added: `Payment received: $X — Invoice Y`
- Set `service_start_date` to installation date
- Check plan counts match what was installed

## Step 6: Add to recurring schedule
- Book next service appointment (cadence: policy `scheduling.recurringCadenceDays`)
- Use recurring scheduling: book via `/admin/book` API with `notify=false` for subsequent appointments
- Booking-platform event type IDs in `app/lib/cal-event-types.json`

<!-- tenant-catalog: edit for your catalog -->
## Key CRM properties (GreenGuard example — replace with your own)
`system_type`, `plan_type`: rent | own
`tank_count`, `trap_count`: integer
`recurring_addons`: comma-separated SKUs
`customer_status`: active | churned

## Arguments: customer name, email, system type, address
$ARGUMENTS
