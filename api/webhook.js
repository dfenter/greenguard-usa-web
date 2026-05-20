const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Vercel must receive the raw body for Stripe signature verification
export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end("Method Not Allowed");
  }

  const rawBody = await readRawBody(req);
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    console.log("New order completed:", {
      id: session.id,
      customer_email: session.customer_details?.email,
      amount_total: session.amount_total,
      mode: session.mode,
      subscription: session.subscription,
    });
    // TODO: Create HubSpot contact, send confirmation email, update internal records
  }

  return res.status(200).json({ received: true });
};
