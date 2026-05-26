// One-shot migration: convert 13 past-due Acuity invoices into Stripe invoices.
//
// Usage:
//   node _scripts/migrate-acuity-pastdues.js           # dry-run, no Stripe writes
//   node _scripts/migrate-acuity-pastdues.js --drafts  # create drafts only
//   node _scripts/migrate-acuity-pastdues.js --send    # create + finalize + email

require('dotenv').config({ path: '.env' })
const Stripe = require('stripe')
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

const MODE = process.argv.includes('--send') ? 'send'
            : process.argv.includes('--drafts') ? 'drafts'
            : 'dry-run'

// Past-due invoices captured from the Acuity admin screenshot 2026-05-26.
// Amounts are tax-inclusive (no extra Texas sales tax added).
const PASTDUES = [
  { name: 'Lin Thomas',          serviceDate: '2026-05-16', amount: 397.22, acuityId: 10381 },
  { name: 'Justin Vasquez',      serviceDate: '2026-05-16', amount: 308.49, acuityId: 10380 },
  { name: 'Louis Coldwell',      serviceDate: '2026-05-16', amount: 289.01, acuityId: 10378 },
  { name: 'Patrick Mosher',      serviceDate: '2026-05-13', amount: 173.18, acuityId: 10377 },
  { name: 'Michael Preis',       serviceDate: '2026-05-13', amount: 289.01, acuityId: 10376 },
  { name: 'Emi Lawson',          serviceDate: '2026-05-08', amount: 362.59, acuityId: 372  },
  { name: 'Moneeza Maredia',     serviceDate: '2026-05-06', amount: 173.18, acuityId: 366  },
  { name: 'Arianne Kennedy',     serviceDate: '2026-05-06', amount: 119.06, acuityId: 363  },
  { name: 'Philip Braithwaite',  serviceDate: '2026-05-06', amount: 248.95, acuityId: 362  },
  { name: 'Philip Braithwaite',  serviceDate: '2026-05-06', amount: 108.23, acuityId: 361  },
  { name: 'Daniel Raynaud',      serviceDate: '2026-05-01', amount: 332.31, acuityId: 356  },
  { name: 'Brandon Broesche',    serviceDate: '2026-04-28', amount: 562.86, acuityId: 351  },
  { name: 'Jean Barton',         serviceDate: '2026-04-22', amount: 108.23, acuityId: 346  },
]

function fmtDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

async function findHubSpotByName(first, last) {
  const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.HUBSPOT_ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filterGroups: [{ filters: [
        { propertyName: 'firstname', operator: 'EQ', value: first },
        { propertyName: 'lastname',  operator: 'EQ', value: last },
      ] }],
      properties: ['email', 'firstname', 'lastname'],
    }),
  }).then((r) => r.json())
  return r.results || []
}

async function resolveStripeCustomer(name) {
  const [first, ...rest] = name.trim().split(/\s+/)
  const last = rest.join(' ')
  // 1. Stripe name search.
  const byName = await stripe.customers.search({ query: `name:"${name}"`, limit: 5 })
  if (byName.data.length === 1) return { customer: byName.data[0], source: 'stripe-name' }
  if (byName.data.length > 1) return { error: `multiple Stripe matches (${byName.data.length})` }

  // 2. HubSpot lookup → email → Stripe.
  const hs = await findHubSpotByName(first, last)
  if (hs.length === 0) return { error: 'no HubSpot or Stripe match' }
  if (hs.length > 1) return { error: `multiple HubSpot matches (${hs.length})` }
  const email = hs[0].properties.email
  if (!email) return { error: 'HubSpot match has no email' }
  const byEmail = await stripe.customers.search({ query: `email:"${email}"`, limit: 5 })
  if (byEmail.data.length >= 1) return { customer: byEmail.data[0], source: 'hubspot→stripe-email' }

  // 3. Create a new Stripe customer from HubSpot data.
  const created = await stripe.customers.create({
    name, email,
    metadata: { source: 'acuity-pastdue-migration', hubspot_id: hs[0].id },
  })
  return { customer: created, source: 'created-from-hubspot' }
}

async function createInvoiceFor(row, customer) {
  const desc = `Mosquito-control service performed ${fmtDate(row.serviceDate)} (originally Acuity invoice #${row.acuityId}).`
  const footer = "Note: We've moved billing from Acuity to Stripe. This invoice replaces the original Acuity invoice and supersedes any past-due notices you received from Acuity. Thank you!"

  // Create invoice FIRST (empty draft), then attach the item to it explicitly.
  // Earlier versions of this script relied on the "pending items attach to next
  // invoice" behavior, but Stripe's newer default `pending_invoice_items_behavior`
  // is 'exclude', which silently produced empty $0 invoices.
  const invoice = await stripe.invoices.create({
    customer: customer.id,
    collection_method: 'send_invoice',
    days_until_due: 14,
    description: `Past-due service charge migrated from Acuity (#${row.acuityId}).`,
    footer,
    metadata: {
      source: 'acuity-pastdue-migration',
      acuity_id: String(row.acuityId),
      service_date: row.serviceDate,
    },
  })
  await stripe.invoiceItems.create({
    customer: customer.id,
    invoice: invoice.id,
    amount: Math.round(row.amount * 100),
    currency: 'usd',
    description: desc,
  })
  return invoice
}

async function main() {
  console.log(`\nMode: ${MODE.toUpperCase()}  (${PASTDUES.length} rows)\n`)
  const results = []
  // Cache by name within this run — Stripe search indexes lag, so two
  // back-to-back lookups for the same name can both miss and double-create.
  const resolved = new Map()
  for (const row of PASTDUES) {
    const tag = `${row.name.padEnd(22)} $${row.amount.toFixed(2).padStart(7)} (Acuity #${row.acuityId})`
    try {
      let r = resolved.get(row.name)
      if (!r) { r = await resolveStripeCustomer(row.name); resolved.set(row.name, r) }
      if (r.error) {
        console.log(`  ✗  ${tag}  →  ${r.error}`)
        results.push({ row, status: 'unresolved', reason: r.error })
        continue
      }
      if (MODE === 'dry-run') {
        console.log(`  •  ${tag}  →  ${r.customer.id}  (${r.customer.email || 'no email'})  via ${r.source}`)
        results.push({ row, status: 'would-create', customer: r.customer })
        continue
      }
      const invoice = await createInvoiceFor(row, r.customer)
      if (MODE === 'send') {
        const finalized = await stripe.invoices.finalizeInvoice(invoice.id)
        await stripe.invoices.sendInvoice(finalized.id)
        console.log(`  ✓  ${tag}  →  sent  ${finalized.hosted_invoice_url}`)
        results.push({ row, status: 'sent', invoice: finalized })
      } else {
        console.log(`  ✓  ${tag}  →  draft  ${invoice.id}`)
        results.push({ row, status: 'draft', invoice })
      }
    } catch (e) {
      console.log(`  ✗  ${tag}  →  ERR  ${e.message}`)
      results.push({ row, status: 'error', error: e.message })
    }
  }
  const ok = results.filter((r) => r.status === 'sent' || r.status === 'draft' || r.status === 'would-create').length
  const bad = results.filter((r) => r.status === 'unresolved' || r.status === 'error').length
  console.log(`\n${ok} ok, ${bad} need manual review.`)
  if (bad > 0) {
    console.log('\nUnresolved:')
    for (const r of results.filter((r) => r.status === 'unresolved' || r.status === 'error')) {
      console.log(`  - ${r.row.name} (#${r.row.acuityId}): ${r.reason || r.error}`)
    }
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
