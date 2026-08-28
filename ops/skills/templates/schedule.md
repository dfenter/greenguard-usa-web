# {{name}} Appointment Scheduling

Reschedule, cancel, or book an appointment for a customer.

## Reschedule an existing appointment
Use the CustomerPanel in the portal:
1. Go to {{website}}/admin/clients, find the customer
2. Open their panel → click the Next Appointment card → DetailDock opens
3. Click "Edit appointment time" → enter new time → Save

Via Google Calendar MCP (fastest for simple reschedules):
1. Find the event: `mcp__claude_ai_Google_Calendar__list_events` with `fullText: "CustomerName"` for today's date range
2. Update: `mcp__claude_ai_Google_Calendar__update_event` with new `startTime`/`endTime`, `timeZone`, `notificationLevel: "NONE"` (default, per policy `notifications.adminCalendarOps`) or "ALL" if customer should be notified

## Cancel an appointment
Use `/api/admin/cancel-booking` endpoint or the DetailDock Cancel button.

## Book a new appointment
- Admin booking page: {{website}}/admin/booking
- Pre-fill via URL params: `?email=X&name=Y&phone=Z&address=A`
- For recurring appointments: use `/admin/book` API endpoint (bypasses 24h restriction for admins)

## Key rules
- All appointments live in Google Calendar `{{calendarId}}`
- The booking platform syncs into GCal automatically — don't double-book
- `sendUpdates: 'none'` on all GCal operations unless customer notification explicitly requested
- Earliest appointment hour is set in policy `scheduling.earliestAppointmentHour`; no-Saturday rule in policy `scheduling.noSaturdays`
- Admin booking bypasses the 24h minimum booking notice

## Arguments: customer name, new date/time, or "cancel"
$ARGUMENTS
