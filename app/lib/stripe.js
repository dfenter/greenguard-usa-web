const Stripe = require('stripe')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
  timeout: 10000,        // 10s timeout — prevents hanging requests
  maxNetworkRetries: 2,  // Auto-retry on transient 5xx/network errors
})

// Maps SKU strings to Stripe price IDs (set in env)
const PRICE_ID_MAP = {
  BG1: process.env.STRIPE_PRICE_BG1,
  BG2: process.env.STRIPE_PRICE_BG2,
  BG3: process.env.STRIPE_PRICE_BG3,
  BG4: process.env.STRIPE_PRICE_BG4,
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
  // Tank-service SKUs (previously only mapped in generate-invoice's local copy)
  'TANK-DELIVERY-FEE': process.env.STRIPE_PRICE_TANK_DELIVERY_FEE,
  'TANK-REFILL': process.env.STRIPE_PRICE_TANK_REFILL,
  'TANK-HOOKUP-MAINT': process.env.STRIPE_PRICE_TANK_HOOKUP_MAINT,
}

// Single source of truth for SKU → Stripe price ID. Route handlers used to keep
// their own drifting `SKU_TO_ENV` copies; they now call this instead.
function priceIdForSku(sku) {
  return PRICE_ID_MAP[sku] || null
}

/**
 * Add one-time add-on line items to the customer's invoice.
 *
 * These items are attached to a DRAFT invoice (reusing the customer's open
 * draft if one exists, else creating one). Creating invoice items WITHOUT an
 * `invoice` makes them "pending", and nothing in this invoice-based
 * (no-subscription) model ever sweeps pending items onto an invoice — they
 * were silently dropped and never charged. Attaching to a draft makes the
 * charge real; the billing-run cron finalizes the draft after its billing_date.
 */
async function addInvoiceItems(customerId, oneTimeSkus, metadata = {}) {
  const skus = (oneTimeSkus || []).filter((s) => PRICE_ID_MAP[s])
  if (!skus.length) return []
  const { gg_idem_base: idemBase, ...stripeMetadata } = metadata || {}
  const hasIdemBase = typeof idemBase === 'string'

  function createInvoice(params, idempotencyKey) {
    return idempotencyKey
      ? stripe.invoices.create(params, { idempotencyKey })
      : stripe.invoices.create(params)
  }

  function createInvoiceItem(params, idempotencyKey) {
    return idempotencyKey
      ? stripe.invoiceItems.create(params, { idempotencyKey })
      : stripe.invoiceItems.create(params)
  }

  // Reuse the customer's open draft (same one generate-invoice would use) so a
  // visit's charges accumulate on one invoice instead of fragmenting.
  const drafts = await stripe.invoices.list({ customer: customerId, status: 'draft', limit: 1 })
  let invoice = drafts.data[0]
  if (!invoice) {
    let collection_method = 'send_invoice'
    let days_until_due = 14
    try {
      const pms = await stripe.paymentMethods.list({ customer: customerId, limit: 1 })
      if (pms.data.length > 0) { collection_method = 'charge_automatically'; days_until_due = undefined }
    } catch {}
    const taxRateId = getTaxRateId()
    try {
      invoice = await createInvoice({
        customer: customerId,
        auto_advance: false,
        collection_method,
        ...(days_until_due !== undefined ? { days_until_due } : {}),
        metadata: { ...stripeMetadata },
        ...(taxRateId ? { default_tax_rates: [taxRateId] } : {}),
      }, hasIdemBase ? `gg:invcreate:${idemBase}` : null)
    } catch (err) {
      // Retry without a stale/missing tax rate rather than lose the charge.
      if (taxRateId && err?.code === 'resource_missing') {
        invoice = await createInvoice({
          customer: customerId, auto_advance: false, collection_method,
          ...(days_until_due !== undefined ? { days_until_due } : {}),
          metadata: { ...stripeMetadata },
        }, hasIdemBase ? `gg:invcreate:${idemBase}:notax` : null)
      } else {
        throw err
      }
    }
  }

  const results = []
  for (const [i, sku] of skus.entries()) {
    results.push(
      await createInvoiceItem({
        customer: customerId,
        invoice: invoice.id,
        price: PRICE_ID_MAP[sku],
        metadata: { ...stripeMetadata, gg_sku: sku },
      }, hasIdemBase ? `gg:invitem:${idemBase}:${sku}:${i}` : null)
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
  return cached('stripe:subs:active', 300, async () => {
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
  // Round to nearest 5-minute bucket so repeat analytics loads share the cache
  const bucket = Math.floor(fromTimestamp / 300) * 300
  return cached(`stripe:invoices:since:${bucket}`, 300, async () => {
    // Auto-paginate — a single limit:100 page silently truncated revenue
    // analytics and the accounting CSV export to ~the newest 100 invoices.
    const all = []
    for await (const inv of stripe.invoices.list({
      status: 'paid',
      limit: 100,
      created: { gte: fromTimestamp },
      expand: ['data.customer_details'],
    })) {
      all.push(inv)
    }
    return all
  })
}

/**
 * Fetch open/unpaid invoices across all customers (admin analytics).
 */
async function listOpenInvoices() {
  // 30s cache — the home dashboard + analytics both read this; the open-
  // invoice set rarely changes within a 30s window.
  return cached('stripe:invoices:open', 120, async () => {
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

// Stable per-stop identity used to key the batch-invoice result. Matches on the
// GCal event id when present, else email+date. Shared with rounds.js so the
// producer and consumer agree on the key.
function bookingStopKey(stop) {
  if (stop.gcalEventId) return `evt:${stop.gcalEventId}`
  const email = (stop.email || '').toLowerCase()
  return `ed:${email}::${stop.bookingDate || stop.serviceDate || ''}`
}

// Batch version of findInvoiceForBooking — one set of Stripe scans instead of N.
// For EACH stop, finds an invoice matching THAT specific visit (by
// cal_booking_uid, else service_date), scoped to the stop's customer email.
// Returns a plain object keyed by bookingStopKey(stop). (Must be a plain object,
// not a Map — the cache round-trips through Upstash JSON, which turns a Map into
// {} and previously crashed the caller.) Matching by email alone used to hide a
// customer's genuinely-unbilled stops whenever ANY recent invoice existed.
async function findInvoicesForBookings(stops, lookbackDays = 45) {
  const emails = [...new Set(stops.map(s => (s.email || '').toLowerCase()).filter(Boolean))]
  if (!emails.length) return {}

  const cacheKey = `stripe:batch-invoices:v2:${lookbackDays}:${emails.sort().join(',')}`
  return cached(cacheKey, 60, async () => {
    const since = Math.floor(Date.now() / 1000) - lookbackDays * 86400
    const allInvoices = []
    // Expand the customer so we read customer_email/customer.email directly —
    // no N+1 customers.retrieve() fan-out.
    for (const status of ['draft', 'open', 'paid']) {
      for await (const inv of stripe.invoices.list({
        created: { gte: since }, limit: 100, status, expand: ['data.customer'],
      })) { allInvoices.push(inv) }
    }

    const invEmail = (inv) =>
      (inv.customer_email || (inv.customer && inv.customer.email) || '').toLowerCase()

    // Bucket candidate invoices by email (only for emails we care about).
    const byEmail = new Map()
    for (const inv of allInvoices) {
      const email = invEmail(inv)
      if (!email || !emails.includes(email)) continue
      if (!byEmail.has(email)) byEmail.set(email, [])
      byEmail.get(email).push(inv)
    }

    // Match each stop to its own visit's invoice.
    const result = {}
    for (const s of stops) {
      const email = (s.email || '').toLowerCase()
      if (!email) continue
      const candidates = byEmail.get(email) || []
      const uid = s.calBookingUid
      const date = s.bookingDate || s.serviceDate
      const match = candidates.find((inv) =>
        (uid && inv.metadata?.cal_booking_uid === uid) ||
        (date && inv.metadata?.service_date === date)
      )
      if (!match) continue
      result[bookingStopKey(s)] = {
        id: match.id,
        status: match.status,
        amountDue: (match.amount_due || 0) / 100,
        amountPaid: (match.amount_paid || 0) / 100,
        hostedUrl: match.hosted_invoice_url || null,
      }
    }
    return result
  })
}

async function getCustomer(customerId) {
  return stripe.customers.retrieve(customerId, { expand: ['subscriptions.data.items.data'] })
}

async function getBalance() {
  // 60s cache — the Stripe balance widget on the home dashboard doesn't
  // need to be real-time to the second.
  return cached('stripe:balance', 300, async () => {
    const balance = await stripe.balance.retrieve()
    const available = balance.available.reduce((s, b) => s + b.amount, 0)
    const pending = balance.pending.reduce((s, b) => s + b.amount, 0)
    return { available, pending }
  })
}

// Cached for 60s. Pages all customers (~5+ Stripe calls at scale).
async function listAllCustomers() {
  return cached('stripe:customers:all', 1800, async () => {
    const all = []
    let cursor = undefined
    do {
      // No subscription expand: billing is invoice-based and no subscriptions
      // exist, so expanding them added ~40% latency for an always-empty field.
      const page = await stripe.customers.list({
        limit: 100,
        starting_after: cursor,
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
  return cached('stripe:invoices:draft', 30, async () => {
    const result = await stripe.invoices.list({
      status: 'draft',
      limit: 100,
      expand: ['data.customer'],
    })
    return result.data
  })
}

module.exports = {
  stripe,
  getCustomer,
  getBalance,
  listAllCustomers,
  priceIdForSku,
  addInvoiceItems,
  createBillingPortalSession,
  getInvoices,
  getSubscriptions,
  listAllActiveSubscriptions,
  listAllInvoicesSince,
  listOpenInvoices,
  findInvoiceForBooking,
  findInvoicesForBookings,
  bookingStopKey,
  getTaxRateId,
  listAllDraftInvoices,
}
