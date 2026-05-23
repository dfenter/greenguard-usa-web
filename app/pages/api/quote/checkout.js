const { jwtVerify } = require('jose')
const Stripe = require('stripe')

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET)
}

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { token } = req.body || {}
  if (!token) return res.status(400).json({ error: 'token required' })

  // Verify and decode the quote JWT
  let quote
  try {
    const { payload } = await jwtVerify(token, getSecret())
    if (payload.type !== 'quote') return res.status(400).json({ error: 'Invalid token' })
    quote = payload
  } catch {
    return res.status(400).json({ error: 'Invalid or expired quote link' })
  }

  const {
    customerEmail, customerName, customerAddress,
    serviceLines = [], addonLines = [], productLines = [],
    recurringTotal = 0, oneTimeTotal = 0, taxRate = 0, taxAmount = 0,
  } = quote

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'
  const stripe = getStripe()

  // Separate recurring and one-time lines with known amounts
  const allLines = [...serviceLines, ...addonLines, ...productLines]
  const recurringLines = allLines.filter(l => l.recurring && l.amount > 0)
  const oneTimeLines = allLines.filter(l => !l.recurring && l.amount > 0)

  const hasRecurring = recurringLines.length > 0
  const hasOneTime = oneTimeLines.length > 0

  if (!hasRecurring && !hasOneTime) {
    return res.status(400).json({ error: 'Quote has no priced items to check out' })
  }

  try {
    let sessionConfig

    if (hasRecurring) {
      // Subscription mode — sets up monthly billing
      // If there are also one-time items, they will be invoiced separately on the first service visit
      const lineItems = recurringLines.map(l => ({
        price_data: {
          currency: 'usd',
          product_data: { name: l.label },
          recurring: { interval: 'month' },
          unit_amount: Math.round(l.amount * 100),
        },
        quantity: 1,
      }))

      // Include tax as a recurring line if present (applies to monthly total)
      if (taxAmount > 0 && recurringTotal > 0) {
        const recurringTax = Math.round((recurringTotal / (recurringTotal + oneTimeTotal)) * taxAmount * 100)
        if (recurringTax > 0) {
          lineItems.push({
            price_data: {
              currency: 'usd',
              product_data: { name: `Tax (${taxRate}%)` },
              recurring: { interval: 'month' },
              unit_amount: recurringTax,
            },
            quantity: 1,
          })
        }
      }

      sessionConfig = {
        mode: 'subscription',
        line_items: lineItems,
        subscription_data: {
          metadata: {
            source: 'quote',
            customerAddress: customerAddress || '',
          },
        },
        metadata: {
          source: 'quote',
          has_one_time_items: hasOneTime ? 'true' : 'false',
        },
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
      }
    } else {
      // Payment mode — one-time only quote
      const lineItems = oneTimeLines.map(l => ({
        price_data: {
          currency: 'usd',
          product_data: { name: l.label },
          unit_amount: Math.round(l.amount * 100),
        },
        quantity: 1,
      }))

      if (taxAmount > 0) {
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: { name: `Tax (${taxRate}%)` },
            unit_amount: Math.round(taxAmount * 100),
          },
          quantity: 1,
        })
      }

      sessionConfig = {
        mode: 'payment',
        line_items: lineItems,
        metadata: { source: 'quote' },
        billing_address_collection: 'auto',
      }
    }

    // Pre-fill customer email if we have it
    if (customerEmail) sessionConfig.customer_email = customerEmail

    sessionConfig.success_url = `${APP_URL}/quote/${token}?accepted=1`
    sessionConfig.cancel_url = `${APP_URL}/quote/${token}`

    const session = await stripe.checkout.sessions.create(sessionConfig)
    return res.status(200).json({ url: session.url })
  } catch (e) {
    console.error('Stripe checkout error:', e.message)
    return res.status(500).json({ error: 'Failed to create checkout session' })
  }
}
