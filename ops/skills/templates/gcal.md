# {{name}} Google Calendar Operations

View, create, and manage appointments in the primary calendar.

## Calendar: {{calendarId}}
This is the source of truth for ALL appointments. The booking platform syncs into it automatically.

## Via MCP tools (fastest for one-off operations)
```
mcp__claude_ai_Google_Calendar__list_events — list events for a date range
mcp__claude_ai_Google_Calendar__update_event — reschedule or edit an event
mcp__claude_ai_Google_Calendar__create_event — create a new appointment
mcp__claude_ai_Google_Calendar__delete_event — remove an event
```

## Key rules
- `sendUpdates: 'none'` on ALL creates/patches unless customer notification explicitly requested (policy: `notifications.adminCalendarOps`)
- Event title format: `"CustomerName: ServiceType ({{bookingTag}})"` (policy: `scheduling.calendarTitleFormat`)
- Email in description (parsed by gcal.js): `Email: customer@email.com` or the booking platform's format
- Reschedule URL in description (parsed for self-reschedule link)
- Never return reschedule URLs from a retired/legacy booking system — filter them out

## GCal event ID format
Events have a long GCal event ID. The admin calendar URL pattern:
`https://calendar.google.com/calendar/event?eid=BASE64_ENCODED_ID`

## Via portal admin calendar
{{website}}/admin/calendar
Click any event → DetailDock opens with full details, reschedule, cancel, notes.
Click empty time slot → opens admin booking page pre-filled with date/time.

## Parse stop data from GCal
`getTodaysBookings()` and `getBookingsForDate()` in `lib/gcal.js` return:
- `customerName`, `email`, `phone`, `address`, `serviceType`
- `startTime`, `endTime`, `id`, `rescheduleUrl`
- booking UID (parsed from description), any per-tenant tracked fields

## CRITICAL
Rounds (`/admin/rounds`) reads directly from GCal, never from the route plan cache
(policy: `scheduling.readLiveCalendarOnly`).
New/changed appointments appear on rounds immediately without any cache to clear.

## Arguments: date, customer name, or operation (list/create/reschedule)
$ARGUMENTS
