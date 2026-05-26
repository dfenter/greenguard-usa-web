const { stripe } = require('../../../lib/stripe')
const { upsertContact, addNote, findContactByEmail } = require('../../../lib/hubspot')
const { sendT0Email, markStage, clearStages } = require('../../../lib/payment-resurrection')

export const config = { api: { bodyParser: false } }

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const rawBody = await readRawBody(req)
  const sig = req.headers['stripe-signature']

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return res.status(400).json({ error: `Webhook signature failed: ${err.message}` })
  }

  try {
    switch (event.type) {
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object
        const customer = await stripe.customers.retrieve(invoice.customer)
        if (customer.email) {
          const contact = await findContactByEmail(customer.email)
          if (contact) {
            await addNote(
              contact.id,
              `Payment received: $${(invoice.amount_paid / 100).toFixed(2)} — Invoice ${invoice.id}`
            )
          }
        }
        // Wipe any payment-resurrection state so a future failure restarts the clock
        await clearStages(invoice.id).catch(() => {})
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const customer = await stripe.customers.retrieve(invoice.customer)
        if (customer.email) {
          const contact = await findContactByEmail(customer.email)
          if (contact) {
            await addNote(
              contact.id,
              `Payment FAILED: $${(invoice.amount_due / 100).toFixed(2)} — Invoice ${invoice.id} — auto-resurrection T+0 email sent`
            )
            await upsertContact({
              email: customer.email,
              name: customer.name || '',
              metadata: { payment_status: 'failed' },
            })
          }
        }
        // Skip if we've already sent T+0 (Stripe retries trigger duplicate webhooks)
        if (!invoice.metadata?.payfail_t0_at) {
          try {
            await sendT0Email(invoice, customer)
            await markStage(invoice.id, 't0')
          } catch (e) {
            console.error('payment-resurrection T0 send failed:', e.message)
          }
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object
        const customer = await stripe.customers.retrieve(sub.customer)
        if (customer.email) {
          const contact = await findContactByEmail(customer.email)
          if (contact) {
            await addNote(contact.id, `Subscription cancelled: ${sub.id}`)
            await upsertContact({
              email: customer.email,
              name: customer.name || '',
              metadata: { customer_status: 'churned' },
            })
          }
        }
        break
      }

      default:
        break
    }

    res.status(200).json({ received: true })
  } catch (err) {
    console.error('Stripe webhook error:', err)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
}
