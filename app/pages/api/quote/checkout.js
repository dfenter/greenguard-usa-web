const { jwtVerify } = require('jose')
const Stripe = require('stripe')
const { isJtiRevoked } = require('../../../lib/auth')

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

  // Admin can revoke a leaked / superseded quote without waiting for expiry.
  if (quote.jti && await isJtiRevoked(quote.jti)) {
    return res.status(410).json({ error: 'This quote has been revoked. Ask for an updated one.' })
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
    // All lines collected as a single payment — no subscriptions.
    // Ongoing billing is handled manually via the Customer Rounds invoice flow.
    const allBillableLines = [...recurringLines, ...oneTimeLines]

    // Defense in depth: even though the quote JWT is signed, bound every amount
    // so a leaked JWT_SECRET can't drain a card to an arbitrary total.
    const MAX_LINE_CENTS = 1_000_000  // $10,000 per line
    const MAX_TOTAL_CENTS = 5_000_000 // $50,000 per checkout

    const lineItems = []
    let runningCents = 0
    for (const l of allBillableLines) {
      const cents = Math.round(Number(l.amount) * 100)
      if (!Number.isFinite(cents) || cents <= 0) {
        return res.status(400).json({ error: `Invalid line amount: ${l.label}` })
      }
      if (cents > MAX_LINE_CENTS) {
        console.error('Quote line exceeds cap:', { label: l.label, cents })
        return res.status(400).json({ error: 'Line amount exceeds maximum allowed' })
      }
      runningCents += cents
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: String(l.label).slice(0, 250) + (l.recurring ? ' (first month)' : '') },
          unit_amount: cents,
        },
        quantity: 1,
      })
    }

    if (taxAmount > 0) {
      const taxCents = Math.round(Number(taxAmount) * 100)
      if (!Number.isFinite(taxCents) || taxCents < 0 || taxCents > MAX_LINE_CENTS) {
        return res.status(400).json({ error: 'Invalid tax amount' })
      }
      runningCents += taxCents
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: `Tax (${Number(taxRate).toFixed(2)}%)` },
          unit_amount: taxCents,
        },
        quantity: 1,
      })
    }

    if (runningCents > MAX_TOTAL_CENTS) {
      console.error('Quote total exceeds cap:', runningCents)
      return res.status(400).json({ error: 'Quote total exceeds maximum allowed' })
    }

    const sessionConfig = {
      mode: 'payment',
      line_items: lineItems,
      metadata: {
        source: 'quote',
        quote_jti: quote.jti || '',
        customerAddress: customerAddress || '',
        customerName: customerName || '',
      },
      billing_address_collection: 'auto',
      allow_promotion_codes: true,
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
