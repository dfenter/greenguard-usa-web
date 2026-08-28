# {{name}} Daily Rounds Prep

Pull today's service stops, check for issues, and prep for the day.

## Daily rounds page
{{website}}/admin/rounds

Shows today's stops in order with:
- Customer name, address, service type, plan-specific counts
- Existing invoice status (prevents double-billing)
- Check-in/check-out, photo, signature capture
- AI-drafted post-visit email

## Morning check (run this at start of day)
1. Open rounds page — verify all today's stops loaded from GCal
2. Check for any stops missing email (can't invoice without email)
3. Verify inventory is sufficient for today's stops
4. Check for any "already invoiced" stops (existingInvoice badge)

## Tech dashboard
{{website}}/admin/tech

## Key rules
- Rounds reads LIVE Google Calendar only — never the route plan cache (policy: `scheduling.readLiveCalendarOnly`)
- `getTodaysBookings()` / `getBookingsForDate()` are the correct functions
<!-- tenant-catalog: edit for your catalog -->
- Post-visit email rolls up related consumable line items into one clean line
- Opt-in add-ons are checked per-stop via checkbox

## If a stop is missing
The GCal event might not have an email in the description. Fix: open the event in GCal, add `Email: customer@email.com` to the description, or look up in the CRM and link via the admin booking page.

## After completing a stop
- Log services → Generate Invoice → Send post-visit email (or skip)
- Invoice goes to the billing platform as a draft, then admin sends it via `/admin/invoice`

## Arguments: optional date (YYYY-MM-DD), defaults to today
$ARGUMENTS
