const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const PRODUCTS = require("./_products");

const BASE_URL =
  process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { product } = req.body || {};

  const entry = PRODUCTS[product];
  if (!entry) {
    return res.status(400).json({ error: "Unknown product" });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: entry.mode,
      line_items: [{ price: entry.priceId, quantity: 1 }],
      success_url: `${BASE_URL}/shop?success=1`,
      cancel_url: `${BASE_URL}/shop?canceled=1`,
      ...(entry.mode === "subscription" && {
        subscription_data: {
          metadata: { product },
        },
      }),
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err.message);
    return res.status(500).json({ error: "Failed to create checkout session" });
  }
};
