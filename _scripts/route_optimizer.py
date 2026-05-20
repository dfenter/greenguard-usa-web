#!/usr/bin/env python3
"""
Weekly route optimizer — runs Monday 9 AM CST via GitHub Actions.
Fetches the week's Cal.com appointments, builds an optimized daily route
using Google Maps Distance Matrix API, commits route_plan_YYYY-WW.json.
"""
import json
import os
import sys
import datetime
import urllib.request
import urllib.parse
import urllib.error
from itertools import permutations

CALCOM_API_KEY = os.environ.get('CALCOM_API_KEY', '')
GOOGLE_MAPS_API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY', '')
DEPOT = '1519 Parkway, Austin, TX 78703'

# Load event type durations from cal-event-types.json (source of truth)
_EVENT_TYPES_PATH = os.path.join(os.path.dirname(__file__), '..', 'app', 'lib', 'cal-event-types.json')
try:
    with open(_EVENT_TYPES_PATH) as _f:
        _CAL_EVENT_TYPES = {et['title'].lower(): et['durationMin'] for et in json.load(_f)['eventTypes']}
except Exception:
    _CAL_EVENT_TYPES = {}

# Fallback duration map by visit type
DURATION_MAP = {
    'assessment': 30,
    'check': 20,
    'installation': 60,
    'exchange': 45,
    'troubleshoot': 60,
    'barrier': 30,
    'service': 35,
}


def calcom_fetch(path):
    url = f'https://api.cal.com/v1{path}{"&" if "?" in path else "?"}apiKey={CALCOM_API_KEY}'
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read())


def maps_fetch(path):
    base = 'https://maps.googleapis.com/maps/api'
    url = f'{base}{path}&key={GOOGLE_MAPS_API_KEY}'
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read())


def get_week_bookings(monday: datetime.date, saturday: datetime.date):
    """Fetch all accepted bookings for the week."""
    after = monday.isoformat() + 'T00:00:00Z'
    before = saturday.isoformat() + 'T23:59:59Z'
    params = urllib.parse.urlencode({'afterStart': after, 'beforeEnd': before, 'status': 'ACCEPTED'})
    data = calcom_fetch(f'/bookings?{params}')
    return data.get('bookings', [])


def group_by_day(bookings):
    """Group bookings by date."""
    days = {}
    for b in bookings:
        day = b['startTime'][:10]
        days.setdefault(day, []).append(b)
    return days


def get_stop_duration(booking):
    """Estimate service duration from event type title (primary) or visit type fallback."""
    event_title = (booking.get('eventType', {}).get('title') or booking.get('title') or '').lower().strip()
    # Strip "CustomerName: " prefix if present (Acuity-style)
    if ': ' in event_title:
        event_title = event_title.split(': ', 1)[1]
    event_title = event_title.replace(' (greenguard usa)', '').strip()

    # Primary: look up duration from cal-event-types.json
    if event_title in _CAL_EVENT_TYPES:
        return _CAL_EVENT_TYPES[event_title]

    # Fallback: use visit type from form responses
    responses = booking.get('responses', {})
    visit_type = (responses.get('visitType', {}).get('value') or 'service').lower()
    base = DURATION_MAP.get(visit_type, 35)
    addons = responses.get('addons', {}).get('value', [])
    if 'BARRIER' in addons:
        base += 30
    if 'TIMER-INSTALL' in addons:
        base += 15
    return base


def get_address(booking):
    responses = booking.get('responses', {})
    address = (responses.get('address', {}).get('value') or booking.get('location') or '').strip()
    return address or None


def build_distance_matrix(origins, destinations):
    """Call Google Maps Distance Matrix API."""
    o_param = '|'.join(urllib.parse.quote(o) for o in origins)
    d_param = '|'.join(urllib.parse.quote(d) for d in destinations)
    path = f'/distancematrix/json?origins={o_param}&destinations={d_param}&units=imperial'
    return maps_fetch(path)


def nearest_neighbor_route(depot, stops):
    """
    Simple nearest-neighbor TSP heuristic.
    stops: list of dicts with 'address' key.
    Returns stops in optimized order.
    """
    if not stops:
        return []
    if len(stops) == 1:
        return stops

    all_locations = [depot] + [s['address'] for s in stops]
    n = len(all_locations)

    try:
        matrix_data = build_distance_matrix(all_locations, all_locations)
        rows = matrix_data.get('rows', [])
        durations = [
            [
                row['elements'][j].get('duration', {}).get('value', 999999)
                for j in range(n)
            ]
            for row in rows
        ]
    except Exception as e:
        print(f'Warning: Distance matrix failed ({e}), using original order')
        return stops

    # Nearest-neighbor starting from depot (index 0)
    visited = [False] * n
    route_indices = [0]
    visited[0] = True

    for _ in range(len(stops)):
        current = route_indices[-1]
        nearest = min(
            (j for j in range(1, n) if not visited[j]),
            key=lambda j: durations[current][j],
            default=None,
        )
        if nearest is None:
            break
        route_indices.append(nearest)
        visited[nearest] = True

    # Map back to stops (subtract 1 for depot offset)
    return [stops[i - 1] for i in route_indices if i > 0]


def build_maps_url(depot, ordered_stops):
    """Build a Google Maps directions URL for the optimized route."""
    if not ordered_stops:
        return None
    origin = urllib.parse.quote(depot)
    waypoints = '/'.join(urllib.parse.quote(s['address']) for s in ordered_stops[:-1]) if len(ordered_stops) > 1 else ''
    destination = urllib.parse.quote(ordered_stops[-1]['address'])
    url = f'https://www.google.com/maps/dir/{origin}/'
    if waypoints:
        url += waypoints + '/'
    url += destination
    return url


def get_week_dates():
    today = datetime.date.today()
    # Find this week's Monday
    monday = today - datetime.timedelta(days=today.weekday())
    saturday = monday + datetime.timedelta(days=5)
    week_num = monday.isocalendar()[1]
    year = monday.year
    return monday, saturday, f'{year}-W{week_num:02d}'


def main():
    if not CALCOM_API_KEY:
        print('ERROR: CALCOM_API_KEY not set')
        sys.exit(1)
    if not GOOGLE_MAPS_API_KEY:
        print('ERROR: GOOGLE_MAPS_API_KEY not set')
        sys.exit(1)

    monday, saturday, week_label = get_week_dates()
    print(f'Building route plan for {week_label} ({monday} – {saturday})')

    bookings = get_week_bookings(monday, saturday)
    print(f'Found {len(bookings)} bookings')

    days_map = group_by_day(bookings)
    day_plans = []

    for day_str in sorted(days_map):
        day_bookings = days_map[day_str]
        stops = []
        for b in day_bookings:
            address = get_address(b)
            if not address:
                print(f'  Skipping booking {b.get("uid")} — no address')
                continue
            stops.append({
                'booking_uid': b.get('uid'),
                'attendee': b.get('attendees', [{}])[0].get('name', ''),
                'email': b.get('attendees', [{}])[0].get('email', ''),
                'address': address,
                'start_time': b.get('startTime'),
                'duration_min': get_stop_duration(b),
                'visit_type': b.get('responses', {}).get('visitType', {}).get('value', 'service'),
            })

        if not stops:
            continue

        optimized = nearest_neighbor_route(DEPOT, stops)
        maps_url = build_maps_url(DEPOT, optimized)
        total_service_min = sum(s['duration_min'] for s in optimized)

        day_plans.append({
            'date': day_str,
            'stop_count': len(optimized),
            'total_service_min': total_service_min,
            'maps_url': maps_url,
            'approved': False,
            'stops': optimized,
        })

    plan = {
        'week': week_label,
        'generated_at': datetime.datetime.utcnow().isoformat() + 'Z',
        'depot': DEPOT,
        'days': day_plans,
    }

    output_path = f'route_plan_{week_label}.json'
    with open(output_path, 'w') as f:
        json.dump(plan, f, indent=2)

    print(f'Route plan saved to {output_path}')
    total_stops = sum(d['stop_count'] for d in day_plans)
    print(f'Total: {total_stops} stops across {len(day_plans)} day(s)')


if __name__ == '__main__':
    main()
