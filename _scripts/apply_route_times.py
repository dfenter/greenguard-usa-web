#!/usr/bin/env python3
"""Silently update Google Calendar event start/end times to match an optimized route plan.

Usage:
    python3 _scripts/apply_route_times.py app/public/data/route_plan_2026-W23.json [...]

Notes:
- Uses sendUpdates='none' so customers are NOT notified of the time change.
- Skips stops with no gcal_event_id or no optimized_start_time.
- Idempotent: if event already matches optimized time (within 60s), it's left alone.
"""
import sys, os, json, datetime
import urllib.request, urllib.parse

GOOGLE_CLIENT_ID     = os.environ['GOOGLE_CLIENT_ID']
GOOGLE_CLIENT_SECRET = os.environ['GOOGLE_CLIENT_SECRET']
GOOGLE_REFRESH_TOKEN = os.environ['GOOGLE_REFRESH_TOKEN']
CALENDAR_ID          = 'admin@greenguard-usa.com'


def get_access_token():
    body = urllib.parse.urlencode({
        'client_id': GOOGLE_CLIENT_ID,
        'client_secret': GOOGLE_CLIENT_SECRET,
        'refresh_token': GOOGLE_REFRESH_TOKEN,
        'grant_type': 'refresh_token',
    }).encode()
    req = urllib.request.Request('https://oauth2.googleapis.com/token', data=body, method='POST')
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())['access_token']


def patch_event(token, event_id, start_iso, end_iso):
    url = f'https://www.googleapis.com/calendar/v3/calendars/{urllib.parse.quote(CALENDAR_ID)}/events/{event_id}?sendUpdates=none'
    body = json.dumps({
        'start': {'dateTime': start_iso, 'timeZone': 'America/Chicago'},
        'end':   {'dateTime': end_iso,   'timeZone': 'America/Chicago'},
    }).encode()
    req = urllib.request.Request(url, data=body, method='PATCH',
                                 headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def get_event(token, event_id):
    url = f'https://www.googleapis.com/calendar/v3/calendars/{urllib.parse.quote(CALENDAR_ID)}/events/{event_id}'
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def main():
    if len(sys.argv) < 2:
        print('Usage: apply_route_times.py <route_plan.json> [...]')
        sys.exit(1)
    token = get_access_token()

    total_updated = total_skipped = total_no_id = 0
    for plan_path in sys.argv[1:]:
        with open(plan_path) as f:
            plan = json.load(f)
        print(f'\n=== {plan.get("week")} ({plan_path}) ===')
        for day in plan.get('days', []):
            for stop in day.get('stops', []):
                eid = stop.get('gcal_event_id')
                new_start = stop.get('optimized_start_time')
                new_end = stop.get('optimized_end_time')
                if not eid or not new_start or not new_end:
                    total_no_id += 1
                    continue
                try:
                    cur = get_event(token, eid)
                    cur_start = cur.get('start', {}).get('dateTime', '')
                    # If already matches within 60s, skip
                    if cur_start[:16] == new_start[:16]:
                        total_skipped += 1
                        continue
                    patch_event(token, eid, new_start, new_end)
                    print(f'  ✓ {stop["customer"]:<28} {cur_start[11:16]} → {new_start[11:16]}')
                    total_updated += 1
                except Exception as e:
                    print(f'  ✗ {stop.get("customer", "?")}: {e}')

    print(f'\n=== Summary ===')
    print(f'Updated: {total_updated} | Already correct: {total_skipped} | Skipped (no event id): {total_no_id}')


if __name__ == '__main__':
    main()
