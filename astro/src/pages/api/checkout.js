export const prerender = false;

import { CATALOG, isAustinLocal } from '../../lib/catalog.js';

const MAX_QTY = 100
const MAX_ITEMS = 20

export const POST = async ({ request }) => {
  const stripeKey = import.meta.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: 'Checkout unavailable' }), { status: 503 });
  }

  // Validate Origin to prevent cross-site abuse
  const origin = request.headers.get('origin') || ''
  const allowed = ['https://www.greenguard-usa.com', 'https://greenguard-usa.com']
  if (origin && !allowed.some(o => origin.startsWith(o))) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  let body
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { items, attribution, zip } = body
  if (!Array.isArray(items) || !items.length) {
    return new Response(JSON.stringify({ error: 'Cart is empty' }), { status: 400 });
  }
  if (items.length > MAX_ITEMS) {
    return new Response(JSON.stringify({ error: 'Too many items' }), { status: 400 });
  }

  // Validate every line against the server catalog. NEVER trust the client for
  // price, name, or stock — the cart is localStorage and this endpoint is public.
  const lineItems = []
  let shippingCents = 0
  for (const item of items) {
    const id = String(item.id || '')
    const qty = parseInt(item.qty) || 1

    const product = CATALOG[id]
    if (!product) {
      return new Response(JSON.stringify({ error: 'That product is no longer available.' }), { status: 400 });
    }
    if (!product.inStock) {
      return new Response(JSON.stringify({ error: `${product.name} is out of stock. Please remove it from your cart.` }), { status: 409 });
    }
    if (qty < 1 || qty > MAX_QTY) {
      return new Response(JSON.stringify({ error: 'Invalid quantity' }), { status: 400 });
    }

    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: product.name },
        unit_amount: Math.round(product.price * 100),   // authoritative price
        tax_behavior: 'exclusive',
      },
      quantity: qty,
    })

    if (product.shipping > 0) {
      shippingCents += Math.round(product.shipping * 100) * qty
    }
  }

  // Austin-local delivery is free — waive all shipping for in-area ZIPs.
  if (isAustinLocal(zip)) shippingCents = 0

  // Flat per-unit shipping (added before tax so TX tax applies).
  if (shippingCents > 0) {
    lineItems.push({
      price_data: { currency: 'usd', product_data: { name: 'Shipping' }, unit_amount: shippingCents },
      quantity: 1,
    })
  }

  // Server-side tax (TX 8.25%)
  const subtotalCents = lineItems.reduce((s, li) => s + li.price_data.unit_amount * li.quantity, 0)
  const taxCents = Math.round(subtotalCents * 0.0825)
  if (taxCents > 0) {
    lineItems.push({
      price_data: { currency: 'usd', product_data: { name: 'Tax (8.25% TX)' }, unit_amount: taxCents },
      quantity: 1,
    })
  }

  // Ad attribution → Stripe metadata, so the webhook can fire Meta/Google/GA4
  // conversions on the actual purchase (mirrors the quote checkout flow).
  const a = attribution && typeof attribution === 'object' ? attribution : {}
  const attrMeta = {}
  for (const k of ['gclid', 'gbraid', 'wbraid', 'fbclid', 'fbc', 'fbp', 'ga_client_id', 'ga_session_id']) {
    if (a[k]) attrMeta[k] = String(a[k]).slice(0, 200)
  }

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(stripeKey, { timeout: 10000, maxNetworkRetries: 1 });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      metadata: { source: 'shop', ...attrMeta },
      customer_creation: 'always',
      billing_address_collection: 'required',
      success_url: 'https://www.greenguard-usa.com/shop?order=success',
      cancel_url: 'https://www.greenguard-usa.com/shop',
      shipping_address_collection: { allowed_countries: ['US'] },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[checkout] Stripe error:', err.message)
    return new Response(JSON.stringify({ error: 'Checkout failed. Please try again.' }), { status: 500 });
  }
};
