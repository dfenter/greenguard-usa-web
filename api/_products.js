// Fill in your Stripe Price IDs from the Stripe Dashboard.
// Dashboard → Products → click a product → copy the Price ID (starts with price_)
// mode: "subscription" for recurring monthly plans, "payment" for one-time purchases

module.exports = {
  // ── Biogents CO₂ Trap Rentals (monthly subscriptions) ────────────────────
  "bg1": {
    priceId: "price_REPLACE_BG1",
    mode: "subscription",
    name: "1-Trap Rental — Biogents CO₂",
    price: "$159.99/mo",
  },
  "bg2": {
    priceId: "price_REPLACE_BG2",
    mode: "subscription",
    name: "2-Trap Rental — Biogents CO₂",
    price: "$266.99/mo",
  },
  "bg3": {
    priceId: "price_REPLACE_BG3",
    mode: "subscription",
    name: "3-Trap Rental — Biogents CO₂",
    price: "$399.99/mo",
  },

  // ── Mosqitter Grand Rental (monthly subscription) ─────────────────────────
  "mq-rent": {
    priceId: "price_REPLACE_MQ_RENT",
    mode: "subscription",
    name: "Mosqitter Grand Rental",
    price: "$299.99/mo",
  },

  // ── CO₂ Tank Exchanges (one-time) ────────────────────────────────────────
  "tank1": {
    priceId: "price_REPLACE_TANK1",
    mode: "payment",
    name: "Single Tank Exchange (20 lb CO₂)",
    price: "$89.99",
  },
  "tank2": {
    priceId: "price_REPLACE_TANK2",
    mode: "payment",
    name: "2-Tank Exchange (2 × 20 lb CO₂)",
    price: "$159.99",
  },
  "tank3": {
    priceId: "price_REPLACE_TANK3",
    mode: "payment",
    name: "3-Tank Exchange (3 × 20 lb CO₂)",
    price: "$249.99",
  },

  // ── Add-On Services (one-time) ────────────────────────────────────────────
  "barrier": {
    priceId: "price_REPLACE_BARRIER",
    mode: "payment",
    name: "GreenGuard Barrier Treatment",
    price: "$49.99",
  },
};
