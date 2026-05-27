export const prerender = false;

export const POST = async ({ request }) => {
  const stripeKey = import.meta.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: 'Stripe not configured' }), { status: 500 });
  }

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(stripeKey);

  const { items } = await request.json();
  if (!items?.length) {
    return new Response(JSON.stringify({ error: 'Cart is empty' }), { status: 400 });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: items.map((item) => ({
      price_data: {
        currency: 'usd',
        product_data: { name: item.name },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.qty,
    })),
    success_url: 'https://new.greenguard-usa.com/shop?order=success',
    cancel_url: 'https://new.greenguard-usa.com/shop',
    shipping_address_collection: { allowed_countries: ['US'] },
  });

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
