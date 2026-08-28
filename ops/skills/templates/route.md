# {{name}} Route Planning

Weekly route optimization for service stops.

## Route plan page (admin)
{{website}}/admin/route
Calendar view of weekly route, optimized stop order, drive times.

## Trigger route optimizer manually
```bash
CRON_SECRET=$(grep CRON_SECRET /path/to/repo/app/.env | cut -d= -f2)
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://{{id}}-agent.onrender.com/cron/route-optimizer
```
Or via portal: Admin → Route Plan → "Run Route Optimizer Now" button (triggers via Render).

## How it works
1. Render agent runs `route_optimizer.py` + `weekly_route_optimizer.py`
2. Reads upcoming GCal appointments for the next 7 days
3. Optimizes order using far-first routing from the depot: {{depot}} (policy: `scheduling.routeFarFirst`)
4. Commits route plan JSON to `app/public/data/route_plan_YYYY-WW.json`
5. Admin can view at `/admin/route`

## CRITICAL RULE
Route plan is for `/admin/route` display ONLY.
**Rounds (`/admin/rounds`) MUST NEVER read from the route plan cache.**
Rounds always calls `getTodaysBookings()` / `getBookingsForDate()` directly from GCal
(policy: `scheduling.readLiveCalendarOnly`). Using the route plan in rounds has
caused missed appointments before — do not repeat it.

## Tech dashboard
{{website}}/admin/tech
Field tech's daily view: today's stops in optimized order, one-tap navigate, send ETA SMS.

## Daily route email
Sent automatically each morning via the Render `/cron/daily-route` endpoint.
Contains stop list, addresses, counts, customer notes.

## Arguments: optional date (YYYY-MM-DD) to plan for a specific week
$ARGUMENTS
