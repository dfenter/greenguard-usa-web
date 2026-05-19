#!/usr/bin/env python3
"""
Auto-bills GreenGuard USA cal.com bookings via Stripe subscriptions and invoice items.
Runs daily via GitHub Actions, targeting bookings from 3 days ago.

Billing model (per greenguardintegraton_system.md):
  - Recurring SKUs (BG1-3, MQ-RENT, MQ-SVC, OWN-*) → Stripe Subscription
  - One-time / add-on SKUs (BARRIER, WKD-SURCH, TANK*, etc.) → Stripe InvoiceItem
    (swept into the customer's next subscription invoice automatically)
  - Free visits (ASSESS, CHK) → skipped

Required GitHub Secrets:
  CAL_API_KEY        — cal.com → Settings → Developer → API Keys
  STRIPE_SECRET_KEY  — Stripe Dashboard → Developers → API keys → Secret key
  EVENT_TYPE_CONFIG  — JSON: cal.com event type ID → {sku, visitType, systemType, customerType}
                       e.g. {"123456": {"sku":"BG1","visitType":"exchange",
                                        "systemType":"Biogents-CO2","customerType":"rental"}}
  STRIPE_PRICE_MAP   — JSON: SKU → Stripe price ID (output of stripe_setup.py)
                       e.g. {"BG1": "price_abc123", "BARRIER": "price_xyz789"}
"""
import json, os, sys, urllib.request, urllib.parse
from datetime import datetime, timedelta, timezone

import stripe

CAL_API_KEY       = os.environ['CAL_API_KEY']
stripe.api_key    = os.environ['STRIPE_SECRET_KEY']
EVENT_TYPE_CONFIG = json.loads(os.environ['EVENT_TYPE_CONFIG'])
STRIPE_PRICE_MAP  = json.loads(os.environ['STRIPE_PRICE_MAP'])
DRY_RUN           = os.environ.get('DRY_RUN', '').lower() in ('1', 'true', 'yes')

DAYS_AFTER_APPOINTMENT = 3
CAL_HEADERS = {
    'Authorization':   f'Bearer {CAL_API_KEY}',
    'cal-api-version': '2024-08-13',
}

# Full SKU catalog — mirrors greenguardintegraton_system.md
# interval → recurring Stripe subscription; absent → one-time invoice item; amount=0 → free
SKU_CATALOG = {
    'BG1':        {'amount': 15999, 'interval': 'month'},
    'BG2':        {'amount': 26699, 'interval': 'month'},
    'BG3':        {'amount': 39999, 'interval': 'month'},
    'MQ-RENT':    {'amount': 29999, 'interval': 'month'},
    'MQ-SVC':     {'amount': 12999, 'interval': 'month'},
    'OWN-BG':     {'amount':  1000, 'interval': 'month', 'per_trap': True},
    'OWN-MQ':     {'amount':  3000, 'interval': 'month', 'per_trap': True},
    'OWN-NONCO2': {'amount':  1000, 'interval': 'month', 'per_trap': True},
    'MQ-INST':    {'amount': 19999},
    'MQ-TSHOOT':  {'amount':  7999},
    'TANK1':      {'amount':  8999},
    'TANK2':      {'amount': 15999},
    'TANK3':      {'amount': 24999},
    'TANK4':      {'amount': 31999},
    'TANK10':     {'amount': 88998},
    'WKD-SURCH':  {'amount':  2500},
    'BARRIER':    {'amount':  4999},
    'TRAP-INSTALL':  {'amount': 8000},
    'TRAP-MAINT-1':  {'amount': 2999},
    'TRAP-MAINT-2':  {'amount': 4999},
    'TIMER-INSTALL': {'amount': 2999},
    'BAIT':          {'amount': 1000},
    'BG-SWEETSCENT': {'amount': 1000},
    'CO2-ADDON':     {'amount': 4999},
    'NONCO2-UNIT':   {'amount': 7999},
    'ASSESS':     {'amount': 0},
    'CHK':        {'amount': 0},
}


# ---------------------------------------------------------------------------
# Cal.com helpers
# ---------------------------------------------------------------------------

def cal_get(path, params=None):
    url = 'https://api.cal.com/v2' + path
    if params:
        url += '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=CAL_HEADERS)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def get_bookings_for_date(date_str):
    after  = date_str + 'T00:00:00.000Z'
    before = date_str + 'T23:59:59.999Z'
    data = cal_get('/bookings', {'afterStart': after, 'beforeEnd': before, 'take': 200})
    return data.get('data', {}).get('bookings', [])


# ---------------------------------------------------------------------------
# SKU engine (Python port of resolveSKU() in greenguardintegraton_system.md)
# ---------------------------------------------------------------------------

def resolve_sku(visit_type, system_type, trap_count, tank_count, customer_type, addons, is_weekend):
    if visit_type == 'assessment':
        return ['ASSESS']
    if visit_type == 'check':
        return ['CHK']

    skus = []

    if system_type == 'Tank-Only':
        tank_map = {1: 'TANK1', 2: 'TANK2', 3: 'TANK3', 4: 'TANK4', 10: 'TANK10'}
        skus.append(tank_map.get(tank_count, 'TANK1'))

    elif system_type == 'Biogents-CO2':
        if trap_count <= 1:    skus.append('BG1')
        elif trap_count == 2:  skus.append('BG2')
        else:                  skus.append('BG3')

    elif system_type == 'Biogents-NonCO2':
        skus.append('OWN-NONCO2')

    elif system_type == 'Mosqitter':
        if visit_type == 'installation':    skus.append('MQ-INST')
        elif visit_type == 'troubleshoot':  skus.append('MQ-TSHOOT')
        elif customer_type == 'rental':     skus.append('MQ-RENT')
        else:                               skus.append('MQ-SVC')

    if is_weekend:
        skus.append('WKD-SURCH')

    # Validated add-ons from booking form
    skus.extend(a for a in addons if a in SKU_CATALOG)

    return skus


def extract_visit_params(booking, event_config):
    fields = booking.get('bookingFieldsResponses') or {}
    start  = booking.get('start', '')

    try:
        dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
        is_weekend = dt.weekday() >= 5
    except ValueError:
        is_weekend = False

    raw_addons = fields.get('addons', [])
    if isinstance(raw_addons, str):
        raw_addons = [raw_addons]

    return {
        'visit_type':    event_config.get('visitType', 'exchange'),
        'system_type':   event_config.get('systemType', ''),
        'customer_type': event_config.get('customerType', 'rental'),
        'trap_count':    int(fields.get('trapCount') or 1),
        'tank_count':    int(fields.get('tankCount') or 1),
        'addons':        raw_addons,
        'is_weekend':    is_weekend,
    }


# ---------------------------------------------------------------------------
# Stripe helpers
# ---------------------------------------------------------------------------

def resolve_customer_and_payment_method(email):
    """
    Across all Stripe customer profiles for this email, return the one with
    the most recent successful charge and the payment method used on that charge.
    Falls back to any profile with a saved card if no charge history exists.
    """
    customers = stripe.Customer.list(email=email, limit=10).data
    if not customers:
        return None, None

    best_customer, best_pm_id, best_ts = None, None, 0

    for customer in customers:
        charges = stripe.Charge.list(customer=customer.id, limit=1)
        for charge in charges.data:
            if charge.status == 'succeeded' and charge.payment_method and charge.created > best_ts:
                best_ts, best_customer, best_pm_id = charge.created, customer, charge.payment_method

    if best_customer:
        return best_customer, best_pm_id

    for customer in customers:
        pms = stripe.PaymentMethod.list(customer=customer.id, type='card', limit=1)
        if pms.data:
            return customer, pms.data[0].id

    return None, None


def booking_already_processed(booking_id, customer_id=None):
    """
    Check Stripe for evidence this booking was already billed.
    Subscriptions are searchable by metadata; invoice items must be listed by customer.
    """
    sub_results = stripe.Subscription.search(
        query=f"metadata['cal_booking_id']:'{booking_id}' AND status:'active'"
    )
    if sub_results.data:
        return True
    if customer_id:
        for item in stripe.InvoiceItem.list(customer=customer_id, limit=100).auto_paging_iter():
            if item.metadata.get('cal_booking_id') == booking_id:
                return True
    return False


def ensure_subscription(customer, sku, price_id, qty, booking_id, default_pm_id):
    """Create a subscription for this SKU if one doesn't already exist for this customer."""
    subs = stripe.Subscription.list(customer=customer.id, status='active', limit=100)
    for sub in subs.auto_paging_iter():
        for item in sub['items']['data']:
            if item['price']['id'] == price_id:
                print(f'    [SUB EXISTS] {sku} — {sub.id}')
                return
    if DRY_RUN:
        print(f'    [DRY RUN] Would create subscription: {sku} × {qty}')
        return
    sub = stripe.Subscription.create(
        customer=customer.id,
        items=[{'price': price_id, 'quantity': qty}],
        default_payment_method=default_pm_id,
        metadata={'cal_booking_id': booking_id, 'sku': sku},
    )
    print(f'    [SUBSCRIBED] {sku} × {qty} — {sub.id}')


def add_invoice_item(customer, sku, price_id, booking_id):
    """Add a one-time invoice item to the customer's next subscription invoice."""
    amt = SKU_CATALOG[sku]['amount']
    if DRY_RUN:
        print(f'    [DRY RUN] Would add invoice item: {sku} ${amt/100:.2f}')
        return
    item = stripe.InvoiceItem.create(
        customer=customer.id,
        price=price_id,
        metadata={'cal_booking_id': booking_id, 'sku': sku},
    )
    print(f'    [INVOICE ITEM] {sku} ${amt/100:.2f} — {item.id}')


def process_skus(customer, pm_id, skus, trap_count, booking_id):
    recurring = [s for s in skus if 'interval' in SKU_CATALOG.get(s, {})]
    one_time  = [s for s in skus
                 if 'interval' not in SKU_CATALOG.get(s, {})
                 and SKU_CATALOG.get(s, {}).get('amount', 0) > 0]

    for sku in recurring:
        price_id = STRIPE_PRICE_MAP.get(sku)
        if not price_id:
            print(f'    [WARN] No Stripe price ID for {sku} — run stripe_setup.py')
            continue
        qty = trap_count if SKU_CATALOG[sku].get('per_trap') else 1
        ensure_subscription(customer, sku, price_id, qty, booking_id, pm_id)

    for sku in one_time:
        price_id = STRIPE_PRICE_MAP.get(sku)
        if not price_id:
            print(f'    [WARN] No Stripe price ID for {sku} — run stripe_setup.py')
            continue
        add_invoice_item(customer, sku, price_id, booking_id)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def process_booking(booking):
    booking_id    = str(booking['id'])
    event_type_id = str(booking.get('eventTypeId', ''))
    attendees     = booking.get('attendees') or [{}]
    email         = attendees[0].get('email', '')
    name          = attendees[0].get('name', 'Unknown')

    if booking.get('status') == 'cancelled':
        return 'skipped', 'cancelled booking'

    event_config = EVENT_TYPE_CONFIG.get(event_type_id)
    if not event_config:
        return 'skipped', f'event type {event_type_id} not in EVENT_TYPE_CONFIG'

    params = extract_visit_params(booking, event_config)
    skus   = resolve_sku(**params)

    if all(SKU_CATALOG.get(s, {}).get('amount', 0) == 0 for s in skus):
        return 'skipped', f'free visit ({", ".join(skus)})'

    if not email:
        return 'skipped', 'no attendee email'

    customer, pm_id = resolve_customer_and_payment_method(email)
    if not customer:
        return 'skipped', f'no Stripe customer for {email}'
    if not pm_id:
        return 'skipped', f'no saved payment method for {email}'

    if booking_already_processed(booking_id, customer.id):
        return 'skipped', 'already processed in Stripe'

    process_skus(customer, pm_id, skus, params['trap_count'], booking_id)
    return 'processed', f'SKUs: {", ".join(skus)}'


def main():
    if DRY_RUN:
        print('*** DRY RUN — no Stripe writes will occur ***\n')
    target_date = (datetime.now(timezone.utc) - timedelta(days=DAYS_AFTER_APPOINTMENT)).strftime('%Y-%m-%d')
    print(f'Auto-billing: processing bookings from {target_date}\n')

    bookings = get_bookings_for_date(target_date)
    print(f'Found {len(bookings)} booking(s)\n')

    totals = {'processed': 0, 'skipped': 0, 'error': 0}

    for booking in bookings:
        booking_id = booking.get('id')
        name       = (booking.get('attendees') or [{}])[0].get('name', 'Unknown')
        title      = booking.get('title', '')
        print(f'Booking #{booking_id} – {name} ({title})')

        try:
            status, detail = process_booking(booking)
            print(f'  [{status.upper()}] {detail}')
            totals[status] = totals.get(status, 0) + 1
        except stripe.error.CardError as e:
            print(f'  [CARD DECLINED] {e.user_message}')
            totals['error'] += 1
        except Exception as e:
            print(f'  [ERROR] {e}')
            totals['error'] += 1

    print(f'\nDone. processed={totals["processed"]} skipped={totals["skipped"]} errors={totals["error"]}')

    if totals['error'] > 0:
        sys.exit(1)


if __name__ == '__main__':
    main()
