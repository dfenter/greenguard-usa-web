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
  'WKD-SURCH': process.env.STRIPE_PRICE_WKD_SURCH,
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

  return stripe.customers.create({
    email,
    name,
    phone,
    address: address ? { line1: address } : undefined,
    metadata,
  })
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

  return stripe.subscriptions.create({
    customer: customerId,
    items,
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
  })
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
async function listAllActiveSubscriptions() {
  const subs = await stripe.subscriptions.list({
    status: 'active',
    limit: 100,
    expand: ['data.items.data.price'],
  })
  return subs.data
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
  const invoices = await stripe.invoices.list({ status: 'open', limit: 50 })
  return invoices.data
}

async function getBalance() {
  const balance = await stripe.balance.retrieve()
  const available = balance.available.reduce((s, b) => s + b.amount, 0)
  const pending = balance.pending.reduce((s, b) => s + b.amount, 0)
  return { available, pending }
}

async function listAllCustomers() {
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
}

module.exports = {
  stripe,
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
}
