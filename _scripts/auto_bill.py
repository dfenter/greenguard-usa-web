#!/usr/bin/env python3
"""
Auto-bills completed Acuity appointments via saved Stripe payment methods.
Runs daily via GitHub Actions, targeting appointments from 3 days ago.

Required GitHub Secrets:
  ACUITY_USER_ID    — Acuity Integrations → API → User ID
  ACUITY_API_KEY    — Acuity Integrations → API → API Key
  STRIPE_SECRET_KEY — Stripe Dashboard → Developers → API keys → Secret key
"""
import base64, json, os, sys, urllib.request, urllib.parse
from datetime import datetime, timedelta, timezone

import stripe

ACUITY_USER_ID = os.environ['ACUITY_USER_ID']
ACUITY_API_KEY = os.environ['ACUITY_API_KEY']
stripe.api_key = os.environ['STRIPE_SECRET_KEY']

DAYS_AFTER_APPOINTMENT = 3


def acuity_get(path, params=None):
    url = 'https://acuityscheduling.com/api/v1/' + path
    if params:
        url += '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url)
    creds = base64.b64encode(f'{ACUITY_USER_ID}:{ACUITY_API_KEY}'.encode()).decode()
    req.add_header('Authorization', f'Basic {creds}')
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def get_appointments_for_date(date_str):
    return acuity_get('appointments', {'minDate': date_str, 'maxDate': date_str, 'max': 200})


def already_charged(appointment_id):
    results = stripe.PaymentIntent.search(
        query=f"metadata['acuity_appointment_id']:'{appointment_id}' AND status:'succeeded'"
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
    best_pm_id = None
    best_ts = 0

    for customer in customers:
        charges = stripe.Charge.list(customer=customer.id, limit=1)
        for charge in charges.data:
            if charge.status == 'succeeded' and charge.payment_method and charge.created > best_ts:
                best_ts = charge.created
                best_customer = customer
                best_pm_id = charge.payment_method

    if best_customer:
        return best_customer, best_pm_id

    # No charge history — fall back to first profile that has a saved card
    for customer in customers:
        pms = stripe.PaymentMethod.list(customer=customer.id, type='card', limit=1)
        if pms.data:
            return customer, pms.data[0].id

    return None, None


def process_appointment(appt):
    appt_id = str(appt['id'])
    email = appt.get('email', '')
    price_str = appt.get('price') or '0'

    if appt.get('canceled'):
        return 'skipped', 'cancelled appointment'

    if appt.get('paid') == 'yes':
        return 'skipped', f'already paid ${price_str} in Acuity'

    try:
        amount_cents = int(round(float(price_str) * 100))
    except (ValueError, TypeError):
        return 'skipped', f'invalid price value: {price_str!r}'

    if amount_cents == 0:
        return 'skipped', 'price is $0'

    if not email:
        return 'skipped', 'no email on appointment'

    if already_charged(appt_id):
        return 'skipped', 'already charged in Stripe'

    customer, pm_id = resolve_customer_and_payment_method(email)
    if not customer:
        return 'skipped', f'no Stripe customer for {email}'
    if not pm_id:
        return 'skipped', f'no saved payment method for {email}'

    intent = stripe.PaymentIntent.create(
        customer=customer.id,
        payment_method=pm_id,
        amount=amount_cents,
        currency='usd',
        confirm=True,
        off_session=True,
        metadata={'acuity_appointment_id': appt_id},
        description=f'GreenGuard USA – Appointment #{appt_id}',
    )

    if intent.status == 'succeeded':
        return 'charged', f'${price_str} → {intent.id}'

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
    print(f'Auto-billing: processing appointments from {target_date}\n')

    appointments = get_appointments_for_date(target_date)
    print(f'Found {len(appointments)} appointment(s)\n')

    totals = {'charged': 0, 'skipped': 0, 'action_needed': 0, 'pending': 0, 'error': 0}

    for appt in appointments:
        appt_id = appt.get('id')
        name = f"{appt.get('firstName', '')} {appt.get('lastName', '')}".strip() or 'Unknown'
        appt_type = appt.get('type', '')
        label = f'Appointment #{appt_id} – {name} ({appt_type})'
        print(label)

        try:
            status, detail = process_appointment(appt)
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
