const Stripe = require('stripe')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
})

// Maps SKU strings to Stripe price IDs (set in env)
const PRICE_ID_MAP = {
  BG1: process.env.STRIPE_PRICE_BG1,
  BG2: process.env.STRIPE_PRICE_BG2,
  BG3: process.env.STRIPE_PRICE_BG3,
  'MQ-RENT': process.env.STRIPE_PRICE_MQ_RENT,
  'MQ-SVC': process.env.STRIPE_PRICE_MQ_SVC,
  'OWN-BG': process.env.STRIPE_PRICE_OWN_BG,
  'OWN-MQ': process.env.STRIPE_PRICE_OWN_MQ,
  'MQ-INST': process.env.STRIPE_PRICE_MQ_INST,
  'MQ-TSHOOT': process.env.STRIPE_PRICE_MQ_TSHOOT,
  TANK1: process.env.STRIPE_PRICE_TANK1,
  TANK2: process.env.STRIPE_PRICE_TANK2,
  TANK3: process.env.STRIPE_PRICE_TANK3,
  TANK4: process.env.STRIPE_PRICE_TANK4,
  TANK6: process.env.STRIPE_PRICE_TANK6,
  TANK10: process.env.STRIPE_PRICE_TANK10,
  BARRIER: process.env.STRIPE_PRICE_BARRIER,
  BAIT: process.env.STRIPE_PRICE_BAIT,
  'BG-SWEETSCENT': process.env.STRIPE_PRICE_BG_SWEETSCENT,
  'CO2-ADDON': process.env.STRIPE_PRICE_CO2_ADDON,
  'TRAP-INSTALL': process.env.STRIPE_PRICE_TRAP_INSTALL,
  'TRAP-MAINT-1': process.env.STRIPE_PRICE_TRAP_MAINT_1,
  'TRAP-MAINT-2': process.env.STRIPE_PRICE_TRAP_MAINT_2,
  'TIMER-INSTALL': process.env.STRIPE_PRICE_TIMER_INSTALL,
  'TANK-STRAPS': process.env.STRIPE_PRICE_TANK_STRAPS,
  'WKD-SURCH': process.env.STRIPE_PRICE_WKD_SURCH,
  'BG-NONCO2-UNIT': process.env.STRIPE_PRICE_BG_NONCO2_UNIT,
  'BUCKET-OF-DOOM': process.env.STRIPE_PRICE_BUCKET_OF_DOOM,
}

/**
 * Find Stripe customer by email, or create one.
 */
async function findOrCreateCustomer({ email, name, phone, address, metadata = {} }) {
  const existing = await stripe.customers.search({
    query: `email:"${email}"`,
    limit: 1,
  })

  if (existing.data.length > 0) return existing.data[0]

  const created = await stripe.customers.create({
    email,
    name,
    phone,
    address: address ? { line1: address } : undefined,
    metadata,
  })
  await invalidate('stripe:customers:all')
  return created
}

/**
 * Create a monthly subscription for a new customer.
 * subscriptionSkus: SKUs that map to recurring price IDs.
 */
async function createSubscription(customerId, subscriptionSkus) {
  const items = subscriptionSkus
    .map((sku) => PRICE_ID_MAP[sku])
    .filter(Boolean)
    .map((priceId) => ({ price: priceId }))

  if (items.length === 0) return null

  const sub = await stripe.subscriptions.create({
    customer: customerId,
    items,
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
  })
  await invalidate('stripe:subs:active')
  return sub
}

/**
 * Add one-time add-on line items to the customer's next invoice.
 */
async function addInvoiceItems(customerId, oneTimeSkus) {
  const results = []
  for (const sku of oneTimeSkus) {
    const priceId = PRICE_ID_MAP[sku]
    if (!priceId) continue
    results.push(
      await stripe.invoiceItems.create({ customer: customerId, price: priceId })
    )
  }
  return results
}

/**
 * Generate a Stripe Customer Portal session URL for self-serve billing.
 */
async function createBillingPortalSession(customerId, returnUrl) {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  })
  return session.url
}

/**
 * Fetch the last N invoices for a customer.
 */
async function getInvoices(customerId, limit = 6) {
  const invoices = await stripe.invoices.list({ customer: customerId, limit })
  return invoices.data
}

/**
 * Fetch active subscriptions for a customer.
 */
async function getSubscriptions(customerId) {
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: 'active',
    expand: ['data.items.data.price'],
  })
  return subs.data
}

/**
 * Fetch all active subscriptions across all customers (admin analytics).
 */
const { cached, invalidate } = require('./cache')

// Cached for 60s. Active subs only change when admin creates/cancels — page
// loads should not pay a full Stripe round-trip for read-heavy widgets.
async function listAllActiveSubscriptions() {
  return cached('stripe:subs:active', 60, async () => {
    const subs = await stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      expand: ['data.items.data.price'],
    })
    return subs.data
  })
}

/**
 * Fetch all paid invoices since a Unix timestamp (admin analytics).
 * Expands customer_details for email display.
 */
async function listAllInvoicesSince(fromTimestamp) {
  const invoices = await stripe.invoices.list({
    status: 'paid',
    limit: 100,
    created: { gte: fromTimestamp },
    expand: ['data.customer_details'],
  })
  return invoices.data
}

/**
 * Fetch open/unpaid invoices across all customers (admin analytics).
 */
async function listOpenInvoices() {
  // 30s cache — the home dashboard + analytics both read this; the open-
  // invoice set rarely changes within a 30s window.
  return cached('stripe:invoices:open', 30, async () => {
    const invoices = await stripe.invoices.list({ status: 'open', limit: 50 })
    return invoices.data
  })
}

/**
 * Find a draft/open/paid invoice already created for a given booking.
 * Mirrors the dedup filter inside generate-invoice.js so /admin/rounds
 * surfaces the same invoice that would have blocked a re-bill.
 *
 * @param {string} customerEmail
 * @param {{ calBookingUid?: string, serviceDate?: string }} opts
 * @returns {Promise<{ id: string, status: string, amountDue: number, hostedUrl: string|null } | null>}
 */
async function findInvoiceForBooking(customerEmail, { calBookingUid, serviceDate } = {}) {
  if (!customerEmail || (!calBookingUid && !serviceDate)) return null

  // 30s cache — repeat rounds-page loads share one Stripe scan per customer.
  const key = `stripe:invlookup:${customerEmail}:${calBookingUid || ''}:${serviceDate || ''}`
  return cached(key, 30, async () => {
    const search = await stripe.customers.search({
      query: `email:"${customerEmail}"`, limit: 1,
    })
    const customer = search.data[0]
    if (!customer) return null

    const invs = await stripe.invoices.list({ customer: customer.id, limit: 100 })
    const ACTIVE = ['paid', 'open', 'draft']

    const match = invs.data.find((inv) =>
      ACTIVE.includes(inv.status) && (
        (calBookingUid && inv.metadata?.cal_booking_uid === calBookingUid) ||
        (!calBookingUid && serviceDate && inv.metadata?.service_date === serviceDate)
      )
    )
    if (!match) return null
    return {
      id: match.id,
      status: match.status,
      amountDue: (match.amount_due || 0) / 100,
      amountPaid: (match.amount_paid || 0) / 100,
      hostedUrl: match.hosted_invoice_url || null,
    }
  })
}

async function getCustomer(customerId) {
  return stripe.customers.retrieve(customerId, { expand: ['subscriptions.data.items.data'] })
}

async function getBalance() {
  // 60s cache — the Stripe balance widget on the home dashboard doesn't
  // need to be real-time to the second.
  return cached('stripe:balance', 60, async () => {
    const balance = await stripe.balance.retrieve()
    const available = balance.available.reduce((s, b) => s + b.amount, 0)
    const pending = balance.pending.reduce((s, b) => s + b.amount, 0)
    return { available, pending }
  })
}

// Cached for 60s. Pages all customers (~5+ Stripe calls at scale).
async function listAllCustomers() {
  return cached('stripe:customers:all', 60, async () => {
    const all = []
    let cursor = undefined
    do {
      const page = await stripe.customers.list({
        limit: 100,
        starting_after: cursor,
        expand: ['data.subscriptions'],
      })
      all.push(...page.data)
      cursor = page.has_more ? page.data[page.data.length - 1]?.id : undefined
    } while (cursor)
    return all
  })
}

// Returns the configured Texas tax rate ID, or null if not configured.
// Callers should treat null as "skip tax" rather than fail the whole invoice.
function getTaxRateId() {
  return process.env.STRIPE_TAX_RATE_ID || null
}

async function listAllDraftInvoices() {
  const result = await stripe.invoices.list({
    status: 'draft',
    limit: 100,
    expand: ['data.customer'],
  })
  return result.data
}

module.exports = {
  stripe,
  getCustomer,
  getBalance,
  listAllCustomers,
  findOrCreateCustomer,
  createSubscription,
  addInvoiceItems,
  createBillingPortalSession,
  getInvoices,
  getSubscriptions,
  listAllActiveSubscriptions,
  listAllInvoicesSince,
  listOpenInvoices,
  findInvoiceForBooking,
  getTaxRateId,
  listAllDraftInvoices,
}
