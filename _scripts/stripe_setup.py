#!/usr/bin/env python3
"""
One-time Stripe bootstrap script.
Creates Products and Prices for every GreenGuard USA SKU.
Run once with your live (or test) STRIPE_SECRET_KEY, then paste the
printed STRIPE_PRICE_MAP JSON into your GitHub Secret of the same name.

Usage:
  STRIPE_SECRET_KEY=sk_test_... python3 _scripts/stripe_setup.py
"""
import json, os, sys
import stripe

stripe.api_key = os.environ['STRIPE_SECRET_KEY']

# Full SKU catalog matching greenguardintegraton_system.md
# interval=month → recurring Stripe Price
# interval absent → one-time Stripe Price
# per_trap=True → quantity is passed at subscription time
# amount=0 → free, no Stripe Price created
SKU_CATALOG = {
    # Rental — Biogents CO₂
    'BG1': {'name': 'Biogents CO₂ – 1 Trap Rental/Refill', 'amount': 15999, 'interval': 'month'},
    'BG2': {'name': 'Biogents CO₂ – 2 Trap Rental/Refill', 'amount': 26699, 'interval': 'month'},
    'BG3': {'name': 'Biogents CO₂ – 3 Trap Rental/Refill', 'amount': 39999, 'interval': 'month'},
    # Rental — Mosqitter Grand
    'MQ-RENT':   {'name': 'Mosqitter Grand Rental (monthly)',       'amount': 29999, 'interval': 'month'},
    'MQ-SVC':    {'name': 'Mosqitter Grand Monthly Service',        'amount': 12999, 'interval': 'month'},
    'MQ-INST':   {'name': 'Mosqitter Grand Installation + Setup',   'amount': 19999},
    'MQ-TSHOOT': {'name': 'Mosqitter Grand Troubleshooting',        'amount':  7999},
    # Tank-only exchanges
    'TANK1':  {'name': 'CO₂ Tank Exchange – 1 × 20 lb',  'amount':  8999},
    'TANK2':  {'name': 'CO₂ Tank Exchange – 2 × 20 lb',  'amount': 15999},
    'TANK3':  {'name': 'CO₂ Tank Exchange – 3 × 20 lb',  'amount': 24999},
    'TANK4':  {'name': 'CO₂ Tank Exchange – 4 × 20 lb',  'amount': 31999},
    'TANK10': {'name': 'CO₂ Tank Exchange – 10 × 20 lb', 'amount': 88998},
    # Owned equipment service (per-trap, billed as quantity on subscription)
    'OWN-BG':    {'name': 'Owned Biogents Service (per trap)',    'amount': 1000, 'interval': 'month', 'per_trap': True},
    'OWN-MQ':    {'name': 'Owned Mosqitter Service (per trap)',   'amount': 3000, 'interval': 'month', 'per_trap': True},
    'OWN-NONCO2':{'name': 'Non-CO₂ Biogents Service (per trap)', 'amount': 1000, 'interval': 'month', 'per_trap': True},
    # Weekend surcharge
    'WKD-SURCH': {'name': 'Weekend Service Surcharge', 'amount': 2500},
    # Add-ons
    'BARRIER':       {'name': 'GreenGuard Barrier Treatment',              'amount': 4999},
    'TRAP-INSTALL':  {'name': 'Extra Trap Installation',                   'amount': 8000},
    'TRAP-MAINT-1':  {'name': 'Tank Hookup + Trap Maintenance (1 trap)',   'amount': 2999},
    'TRAP-MAINT-2':  {'name': 'Tank Hookup + Trap Maintenance (2 traps)',  'amount': 4999},
    'TIMER-INSTALL': {'name': 'Timer Installation',                        'amount': 2999},
    'BAIT':          {'name': 'Mosquito Bait Refill',                      'amount': 1000},
    'BG-SWEETSCENT': {'name': 'BG SweetScent Lure',                       'amount': 1000},
    'CO2-ADDON':     {'name': 'Extra CO₂ Tank Add-On',                    'amount': 4999},
    'NONCO2-UNIT':   {'name': 'Non-CO₂ Biogents Unit (add-on)',           'amount': 7999},
    # Free visits — no Stripe Price needed
    'ASSESS': {'name': 'Free Property Assessment', 'amount': 0},
    'CHK':    {'name': 'Tank Refill Check',         'amount': 0},
}


def get_or_create_product(sku, spec):
    products = stripe.Product.search(query=f"metadata['sku']:'{sku}'")
    if products.data:
        print(f'  Product exists: {products.data[0].id}')
        return products.data[0]
    product = stripe.Product.create(
        name=spec['name'],
        metadata={'sku': sku},
    )
    print(f'  Created product: {product.id}')
    return product


def get_or_create_price(sku, spec, product_id):
    prices = stripe.Price.search(query=f"metadata['sku']:'{sku}'")
    if prices.data:
        print(f'  Price exists: {prices.data[0].id}')
        return prices.data[0]

    params = dict(
        product=product_id,
        unit_amount=spec['amount'],
        currency='usd',
        metadata={'sku': sku},
    )
    if 'interval' in spec:
        params['recurring'] = {'interval': spec['interval']}

    price = stripe.Price.create(**params)
    print(f'  Created price: {price.id}')
    return price


def main():
    price_map = {}
    print(f'Bootstrapping Stripe catalog ({len(SKU_CATALOG)} SKUs)\n')

    for sku, spec in SKU_CATALOG.items():
        print(f'[{sku}] {spec["name"]}')
        if spec['amount'] == 0:
            print('  Free — no Stripe Price needed')
            continue
        product = get_or_create_product(sku, spec)
        price   = get_or_create_price(sku, spec, product.id)
        price_map[sku] = price.id

    print('\n' + '=' * 60)
    print('STRIPE_PRICE_MAP (paste into GitHub Secret):')
    print('=' * 60)
    print(json.dumps(price_map, indent=2))
    print('=' * 60)


if __name__ == '__main__':
    main()
