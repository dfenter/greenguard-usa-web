// POST { sku, quantity } -> { url }  : Stripe Checkout for a SparkBridge license.
// Called cross-origin from the public SparkBridge site (mqtt.greenguard-usa.com).
// The webhook (checkout.session.completed, metadata.source = 'sparkbridge') issues the
// signed key files and emails them; see lib/sparkbridge-license.js.
const Stripe = require('stripe')
const crypto = require('crypto')
const { skuInfo } = require('../../../lib/sparkbridge-license')

const SITE = 'https://mqtt.greenguard-usa.com/sparkbridge'
const ALLOWED_ORIGINS = new Set([
  'https://mqtt.greenguard-usa.com',
  'https://www.greenguard-usa.com',
  'https://new.greenguard-usa.com',
  'https://greenguard-usa.com',
])

function cors(req, res) {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req, res) {
  cors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).end()

  const sku = String(req.body?.sku || '').toLowerCase()
  const info = skuInfo(sku)
  if (!info) return res.status(400).json({ error: 'Unknown product' })
  const quantity = Math.max(1, Math.min(200, parseInt(req.body?.quantity, 10) || 1))

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' })
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity,
        adjustable_quantity: { enabled: true, minimum: 1, maximum: 200 },
        price_data: {
          currency: 'usd',
          unit_amount: info.cents,
          product_data: {
            name: info.name,
            description: `Perpetual license, per ${info.unit}. Bought once and kept. Support and updates for 12 months.`,
          },
        },
      }],
      metadata: { source: 'sparkbridge', sku, quantity: String(quantity) },
      custom_fields: [{
        key: 'licensee',
        label: { type: 'custom', custom: 'Company name to print on the license' },
        type: 'text',
        text: { minimum_length: 2, maximum_length: 80 },
      }],
      customer_creation: 'always',
      billing_address_collection: 'required',
      allow_promotion_codes: true,
      invoice_creation: { enabled: true },
      success_url: `${SITE}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE}/pricing`,
    }, { idempotencyKey: crypto.randomUUID() })
    return res.status(200).json({ url: session.url })
  } catch (e) {
    console.error('[sparkbridge-checkout] error:', e.message)
    return res.status(500).json({ error: 'Could not start checkout. Please try again or write to admin@greenguard-usa.com.' })
  }
}
