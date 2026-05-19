#!/usr/bin/env python3
"""
Validates the cal.com account configuration against cal-com-setup.md.
Run via GitHub Actions → "Check Cal.com Configuration" → Run workflow.

Required env var:  CAL_API_KEY
Optional env var:  EVENT_TYPE_CONFIG  (JSON — checks ID coverage if provided)

Exit code 0 = all expected event types found and form fields complete.
Exit code 1 = missing event types or incomplete form fields.
"""
import json, os, sys, urllib.request, urllib.parse

CAL_API_KEY       = os.environ.get('CAL_API_KEY', '')
EVENT_TYPE_CONFIG = json.loads(os.environ.get('EVENT_TYPE_CONFIG', '{}'))

if not CAL_API_KEY:
    print('ERROR: CAL_API_KEY environment variable is not set.')
    sys.exit(1)

CAL_HEADERS = {
    'Authorization':   f'Bearer {CAL_API_KEY}',
    'cal-api-version': '2024-08-13',
}

# Expected event types per cal-com-setup.md (title → expected SKU)
EXPECTED = {
    'Biogents CO₂ Service – 1 Trap':       'BG1',
    'Biogents CO₂ Service – 2 Traps':      'BG2',
    'Biogents CO₂ Service – 3 Traps':      'BG3',
    'Mosqitter Grand Monthly Service':      'MQ-RENT',
    'Mosqitter Grand Service (Owned)':      'MQ-SVC',
    'Mosqitter Grand Installation':         'MQ-INST',
    'Mosqitter Grand Troubleshooting':      'MQ-TSHOOT',
    'CO₂ Tank Exchange – 1 Tank':           'TANK1',
    'CO₂ Tank Exchange – 2 Tanks':         'TANK2',
    'CO₂ Tank Exchange – 3 Tanks':         'TANK3',
    'CO₂ Tank Exchange – 4 Tanks':         'TANK4',
    'Owned Biogents Service':               'OWN-BG',
    'Owned Mosqitter Service':              'OWN-MQ',
    'Property Assessment':                  'ASSESS',
    'Tank Refill Check':                    'CHK',
}
REQUIRED_FIELDS = ['trapCount', 'tankCount', 'addons']
# Free/assessment types don't need billing form fields
NO_FIELDS_NEEDED = {'ASSESS', 'CHK'}


def cal_get(path, params=None):
    url = 'https://api.cal.com/v2' + path
    if params:
        url += '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=CAL_HEADERS)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f'HTTP {e.code} calling {url}: {e.read().decode()}')
        sys.exit(1)


def normalize(title):
    """Lowercase + strip for fuzzy title matching."""
    return title.lower().strip()


def check_form_fields(event_type_detail):
    """Return set of field slugs present on this event type."""
    fields = event_type_detail.get('bookingFields') or []
    return {f.get('slug', '') for f in fields}


def main():
    print('Cal.com Configuration Check')
    print('=' * 60)

    # Fetch all event types
    data = cal_get('/event-types')
    raw_types = (data.get('data') or {}).get('eventTypeGroups') or []

    # Flatten across groups (cal.com v2 returns grouped by profile)
    all_event_types = []
    for group in raw_types:
        all_event_types.extend(group.get('eventTypes') or [])

    # Also try the flat format some API versions return
    if not all_event_types:
        alt = data.get('data') or []
        if isinstance(alt, list):
            all_event_types = alt

    print(f'\nEvent Types Found in Account ({len(all_event_types)} total):\n')

    found_titles  = {}   # normalize(title) → event type dict
    issues        = 0

    for et in all_event_types:
        et_id    = et.get('id')
        title    = et.get('title', '')
        duration = et.get('length', '?')
        payment  = et.get('metadata', {}).get('requiresPayment') or et.get('price', 0)
        payment_label = 'ON' if payment else 'off'
        found_titles[normalize(title)] = et

        # Fetch detail to check booking fields
        detail_data = cal_get(f'/event-types/{et_id}')
        detail = (detail_data.get('data') or {}).get('eventType') or detail_data.get('data') or {}
        present_fields = check_form_fields(detail)

        # Match against expected list
        matched_sku = None
        for exp_title, sku in EXPECTED.items():
            if normalize(exp_title) == normalize(title):
                matched_sku = sku
                break

        if matched_sku:
            if matched_sku in NO_FIELDS_NEEDED:
                print(f'  ✓  [{et_id}] {title:<45} ({duration} min, payment: {payment_label})')
            else:
                field_report = '  '.join(
                    f'{f} {"✓" if f in present_fields else "✗"}'
                    for f in REQUIRED_FIELDS
                )
                missing_fields = [f for f in REQUIRED_FIELDS if f not in present_fields]
                status = '✓' if not missing_fields else '⚠'
                print(f'  {status}  [{et_id}] {title:<45} ({duration} min, payment: {payment_label})')
                print(f'       form fields: {field_report}', end='')
                if missing_fields:
                    print(f'  ← INCOMPLETE', end='')
                    issues += 1
                print()
        else:
            print(f'  –  [{et_id}] {title:<45} ({duration} min)  [not in expected list]')

    # Report missing expected event types
    print()
    missing = []
    for exp_title in EXPECTED:
        if normalize(exp_title) not in found_titles:
            missing.append(exp_title)
            print(f'  ✗  {exp_title:<55} MISSING — not found in account')
            issues += 1

    # EVENT_TYPE_CONFIG coverage check
    if EVENT_TYPE_CONFIG:
        print(f'\nEVENT_TYPE_CONFIG Coverage ({len(EVENT_TYPE_CONFIG)} IDs configured):\n')
        id_to_et = {str(et.get('id')): et.get('title', '?') for et in all_event_types}
        for cfg_id, cfg in EVENT_TYPE_CONFIG.items():
            title = id_to_et.get(str(cfg_id))
            sku   = cfg.get('sku', '?')
            if title:
                print(f'  ✓  ID {cfg_id:>8} → "{title}" ({sku})')
            else:
                print(f'  ✗  ID {cfg_id:>8} → NOT FOUND in account ({sku})  ← stale ID?')
                issues += 1
    else:
        print('\nEVENT_TYPE_CONFIG secret not provided — skipping ID coverage check.')

    # Summary
    found_count   = sum(1 for t in EXPECTED if normalize(t) in found_titles)
    missing_count = len(missing)
    print(f'\n{"=" * 60}')
    print(f'Summary: {found_count}/{len(EXPECTED)} expected event types found', end='')
    if missing_count:
        print(f', {missing_count} missing', end='')
    if issues:
        print(f', {issues} issue(s) need attention')
        sys.exit(1)
    else:
        print(' — all good ✓')


if __name__ == '__main__':
    main()
