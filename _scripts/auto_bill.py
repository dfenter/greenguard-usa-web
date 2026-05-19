#!/usr/bin/env python3
"""
Auto-bills completed cal.com bookings via saved Stripe payment methods.
Runs daily via GitHub Actions, targeting bookings from 3 days ago.

Required GitHub Secrets:
  CAL_API_KEY          — cal.com → Settings → Developer → API Keys
  BILLABLE_EVENT_TYPES — JSON map of returning-customer event type IDs → price in cents
                         e.g. {"123456": 15000}  ($150.00)
                         First-booking event types are intentionally excluded to prevent
                         double-charging customers who already paid through cal.com checkout.
  STRIPE_SECRET_KEY    — Stripe Dashboard → Developers → API keys → Secret key
"""
import base64, json, os, sys, urllib.request, urllib.parse
from datetime import datetime, timedelta, timezone

import stripe

CAL_API_KEY          = os.environ['CAL_API_KEY']
BILLABLE_EVENT_TYPES = json.loads(os.environ['BILLABLE_EVENT_TYPES'])
stripe.api_key       = os.environ['STRIPE_SECRET_KEY']

DAYS_AFTER_APPOINTMENT = 3
CAL_HEADERS = {
    'Authorization':   f'Bearer {CAL_API_KEY}',
    'cal-api-version': '2024-08-13',
}


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


def already_charged(booking_id):
    results = stripe.PaymentIntent.search(
        query=f"metadata['cal_booking_id']:'{booking_id}' AND status:'succeeded'"
    )
    return bool(results.data)


def resolve_customer_and_payment_method(email):
    """
    Handles duplicate Stripe customer profiles by scanning all profiles for this
    email and returning the one with the most recent successful charge, along with
    the payment method used on that charge.

    Falls back to any profile that has a saved card if no charge history exists.
    Returns (customer, payment_method_id) or (None, None).
    """
    customers = stripe.Customer.list(email=email, limit=10).data
    if not customers:
        return None, None

    best_customer = None
    best_pm_id    = None
    best_ts       = 0

    for customer in customers:
        charges = stripe.Charge.list(customer=customer.id, limit=1)
        for charge in charges.data:
            if charge.status == 'succeeded' and charge.payment_method and charge.created > best_ts:
                best_ts       = charge.created
                best_customer = customer
                best_pm_id    = charge.payment_method

    if best_customer:
        return best_customer, best_pm_id

    # No charge history — fall back to first profile that has a saved card
    for customer in customers:
        pms = stripe.PaymentMethod.list(customer=customer.id, type='card', limit=1)
        if pms.data:
            return customer, pms.data[0].id

    return None, None


def process_booking(appt):
    appt_id       = str(appt['id'])
    attendees     = appt.get('attendees') or [{}]
    email         = attendees[0].get('email', '')
    event_type_id = str(appt.get('eventTypeId', ''))

    if appt.get('status') == 'cancelled':
        return 'skipped', 'cancelled booking'

    if event_type_id not in BILLABLE_EVENT_TYPES:
        return 'skipped', f'event type {event_type_id} not in BILLABLE_EVENT_TYPES (first-booking or unknown type)'

    amount_cents = BILLABLE_EVENT_TYPES[event_type_id]

    if amount_cents == 0:
        return 'skipped', 'price is $0'

    if not email:
        return 'skipped', 'no email on booking'

    if already_charged(appt_id):
        return 'skipped', 'already charged in Stripe'

    customer, pm_id = resolve_customer_and_payment_method(email)
    if not customer:
        return 'skipped', f'no Stripe customer for {email}'
    if not pm_id:
        return 'skipped', f'no saved payment method for {email}'

    price_display = f'${amount_cents / 100:.2f}'
    intent = stripe.PaymentIntent.create(
        customer=customer.id,
        payment_method=pm_id,
        amount=amount_cents,
        currency='usd',
        confirm=True,
        off_session=True,
        metadata={'cal_booking_id': appt_id},
        description=f'GreenGuard USA – Booking #{appt_id}',
    )

    if intent.status == 'succeeded':
        return 'charged', f'{price_display} → {intent.id}'

    if intent.status == 'requires_action':
        # Card issuer requires 3D Secure authentication (common in EU, rare in US).
        # Customer must update their payment method or authenticate manually.
        return 'action_needed', (
            f'3D Secure required for {email} — customer must re-authenticate. '
            f'PaymentIntent: {intent.id}'
        )

    return 'pending', f'unexpected status: {intent.status} ({intent.id})'


def main():
    target_date = (datetime.now(timezone.utc) - timedelta(days=DAYS_AFTER_APPOINTMENT)).strftime('%Y-%m-%d')
    print(f'Auto-billing: processing bookings from {target_date}\n')

    bookings = get_bookings_for_date(target_date)
    print(f'Found {len(bookings)} booking(s)\n')

    totals = {'charged': 0, 'skipped': 0, 'action_needed': 0, 'pending': 0, 'error': 0}

    for appt in bookings:
        appt_id   = appt.get('id')
        name      = (appt.get('attendees') or [{}])[0].get('name', 'Unknown')
        appt_type = appt.get('title', '')
        print(f'Booking #{appt_id} – {name} ({appt_type})')

        try:
            status, detail = process_booking(appt)
            tag = f'[{status.upper().replace("_", " ")}]'
            print(f'  {tag} {detail}')
            totals[status] = totals.get(status, 0) + 1
        except stripe.error.CardError as e:
            print(f'  [CARD DECLINED] {e.user_message}')
            totals['error'] += 1
        except Exception as e:
            print(f'  [ERROR] {e}')
            totals['error'] += 1

    print(f'\nDone. charged={totals["charged"]} skipped={totals["skipped"]} '
          f'action_needed={totals["action_needed"]} errors={totals["error"]}')

    if totals['error'] > 0:
        sys.exit(1)


if __name__ == '__main__':
    main()
