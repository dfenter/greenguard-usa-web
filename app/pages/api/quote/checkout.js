const { jwtVerify } = require('jose')
const Stripe = require('stripe')
const { isJtiRevoked, isQuotePaid } = require('../../../lib/auth')

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

  // Already paid — the Stripe idempotency key only dedups for ~24h, so without
  // this a customer revisiting the link later could be charged again.
  if (quote.jti && await isQuotePaid(quote.jti)) {
    return res.status(409).json({ error: 'This quote has already been paid. Thank you!' })
  }

  const {
    customerEmail, customerName, customerAddress,
  } = quote
  let shippingTotal = quote.shippingTotal || 0

  // Dual-option quote: bill the option the customer selected (rental is the
  // default). The option lines were computed server-side at quote creation and
  // ride inside the signed JWT, so they're as trusted as the legacy top-level
  // lines.
  let { serviceLines = [], addonLines = [], productLines = [] } = quote
  let chosenOption = null
  if (quote.options && quote.options.rental && quote.options.purchase) {
    const requested = req.body?.option === 'purchase' ? 'purchase' : 'rental'
    const opt = quote.options[requested]
    serviceLines = opt.serviceLines || []
    addonLines = opt.addonLines || []
    productLines = opt.productLines || []
    if (opt.shippingTotal != null) shippingTotal = opt.shippingTotal
    chosenOption = requested
  }

  // Attribution data passed from the browser's sessionStorage
  const attribution = req.body?.attribution || {}

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

    // Apply Texas 8.25% sales tax to services/products only (before shipping — TX delivery charges are exempt)
    const TX_TAX_RATE = 0.0825
    const taxCents = Math.round(runningCents * TX_TAX_RATE)
    if (taxCents > 0) {
      runningCents += taxCents
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Tax (8.25% TX)' },
          unit_amount: taxCents,
        },
        quantity: 1,
      })
    }

    // Add shipping after tax — delivery charges are not subject to TX sales tax
    const shippingCents = Math.round(Number(shippingTotal || 0) * 100)
    if (shippingCents > 0) {
      if (shippingCents > 100_000) return res.status(400).json({ error: 'Shipping amount exceeds maximum' })
      runningCents += shippingCents
      lineItems.push({
        price_data: { currency: 'usd', product_data: { name: 'Shipping' }, unit_amount: shippingCents },
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
        quote_option: chosenOption || '',
        customerAddress: customerAddress || '',
        customerName: customerName || '',
        gclid: String(attribution.gclid || '').slice(0, 100),
        gbraid: String(attribution.gbraid || '').slice(0, 100),
        wbraid: String(attribution.wbraid || '').slice(0, 100),
        fbclid: String(attribution.fbclid || '').slice(0, 100),
        fbp: String(attribution.fbp || '').slice(0, 100),
        fbc: String(attribution.fbc || '').slice(0, 100),
        utm_source: String(attribution.utm_source || '').slice(0, 100),
        utm_medium: String(attribution.utm_medium || '').slice(0, 100),
        utm_campaign: String(attribution.utm_campaign || '').slice(0, 100),
        ref: String(attribution.ref || '').slice(0, 20),
        ga_client_id: String(attribution.ga_client_id || '').slice(0, 50),
        ga_session_id: String(attribution.ga_session_id || '').slice(0, 30),
      },
      // Collect shipping address when shippable items are in the quote
      ...(shippingCents > 0 && { shipping_address_collection: { allowed_countries: ['US'] } }),
      billing_address_collection: 'required',
      allow_promotion_codes: true,
      // Save the card so open invoices can be charged without re-asking for it.
      // Checkout shows the card-on-file consent language automatically.
      payment_intent_data: { setup_future_usage: 'off_session' },
    }

    // Reuse an existing Stripe customer for this email so the saved card and
    // invoice history land on one record; otherwise let Checkout create one.
    let existingCustomerId = null
    if (customerEmail) {
      try {
        const found = await stripe.customers.search({
          query: `email:"${customerEmail.replace(/"/g, '')}"`,
          limit: 1,
        })
        existingCustomerId = found.data[0]?.id || null
      } catch (e) {
        console.error('quote checkout: customer lookup failed', e.message)
      }
    }
    if (existingCustomerId) {
      sessionConfig.customer = existingCustomerId
    } else {
      sessionConfig.customer_creation = 'always'
      if (customerEmail) sessionConfig.customer_email = customerEmail
    }

    sessionConfig.success_url = `${APP_URL}/quote/${token}?accepted=1`
    sessionConfig.cancel_url = `${APP_URL}/quote/${token}`

    // Idempotency key: same JTI + email always returns the same session
    const crypto = require('crypto')
    const idempotencyKey = crypto.createHash('sha256')
      .update(`quote-checkout-v3:${quote.jti}:${chosenOption || 'single'}:${customerEmail || ''}`)
      .digest('hex')

    const session = await stripe.checkout.sessions.create(sessionConfig, { idempotencyKey })
    return res.status(200).json({ url: session.url })
  } catch (e) {
    console.error('[quote-checkout] error:', e.message)
    return res.status(500).json({ error: 'Failed to create checkout session. Please try again.' })
  }
}
