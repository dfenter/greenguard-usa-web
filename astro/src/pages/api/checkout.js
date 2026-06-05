export const prerender = false;

const MAX_ITEM_PRICE = 200000  // $2,000 per item max
const MAX_QTY = 100
const MAX_ITEMS = 20
const MAX_NAME_LEN = 250

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

  const { items } = body
  if (!Array.isArray(items) || !items.length) {
    return new Response(JSON.stringify({ error: 'Cart is empty' }), { status: 400 });
  }
  if (items.length > MAX_ITEMS) {
    return new Response(JSON.stringify({ error: 'Too many items' }), { status: 400 });
  }

  // Validate every item server-side — never trust client prices
  const lineItems = []
  for (const item of items) {
    const price = Number(item.price)
    const qty = parseInt(item.qty) || 1
    const name = String(item.name || '').slice(0, MAX_NAME_LEN).trim()

    if (!Number.isFinite(price) || price <= 0 || Math.round(price * 100) > MAX_ITEM_PRICE) {
      return new Response(JSON.stringify({ error: `Invalid price for item: ${name}` }), { status: 400 });
    }
    if (qty < 1 || qty > MAX_QTY) {
      return new Response(JSON.stringify({ error: 'Invalid quantity' }), { status: 400 });
    }
    if (!name) {
      return new Response(JSON.stringify({ error: 'Item name required' }), { status: 400 });
    }

    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name },
        unit_amount: Math.round(price * 100),
        tax_behavior: 'exclusive',
      },
      quantity: qty,
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

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(stripeKey, { timeout: 10000, maxNetworkRetries: 1 });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      metadata: { source: 'shop' },
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
