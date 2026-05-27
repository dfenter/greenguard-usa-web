const { stripe } = require('../../../lib/stripe')
const { upsertContact, addNote, findContactByEmail } = require('../../../lib/hubspot')
const { sendT0Email, markStage, clearStages } = require('../../../lib/payment-resurrection')
const { notifyAdmin, sendCustomerReceipt } = require('../../../lib/purchase-notify')

export const config = { api: { bodyParser: false } }

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

const DASH = 'https://dashboard.stripe.com'

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
        // Admin notification (email + SMS)
        await notifyAdmin({
          source: 'Invoice payment',
          customerName: customer.name,
          customerEmail: customer.email,
          customerPhone: customer.phone,
          amount: invoice.amount_paid,
          currency: invoice.currency,
          items: (invoice.lines?.data || []).map((l) => ({
            description: l.description || '',
            amount: l.amount,
          })),
          stripeUrl: `${DASH}/invoices/${invoice.id}`,
          ref: invoice.id,
        }).catch((e) => console.error('notify invoice paid:', e.message))
        // Send customer their own branded receipt — Stripe's auto-receipt is
        // unreliable (account toggle + charge.receipt_email both have to line
        // up). This guarantees delivery regardless of Stripe settings.
        await sendCustomerReceipt({
          invoice,
          customer,
          receiptUrl: invoice.charge ? `https://pay.stripe.com/receipts/invoices/${invoice.id}` : null,
          hostedInvoiceUrl: invoice.hosted_invoice_url,
        }).catch((e) => console.error('customer receipt:', e.message))
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

      case 'checkout.session.completed': {
        // Fires for Payment Links, /api/quote/checkout, and Stripe-Dashboard
        // ad-hoc checkouts. Only notify if it actually resulted in payment
        // (Stripe still fires this for $0 sessions etc.).
        const session = event.data.object
        if (session.payment_status !== 'paid') break

        // Expand line items for the email
        let items = []
        try {
          const li = await stripe.checkout.sessions.listLineItems(session.id, { limit: 20 })
          items = (li.data || []).map((l) => ({ description: l.description, amount: l.amount_total }))
        } catch {}

        const customerName = session.customer_details?.name || ''
        const customerEmail = session.customer_details?.email || session.customer_email || ''
        const customerPhone = session.customer_details?.phone || ''

        // HubSpot note (auto-create contact if it's a new buyer via Payment Link)
        if (customerEmail) {
          try {
            let contact = await findContactByEmail(customerEmail).catch(() => null)
            if (!contact?.id) {
              const created = await upsertContact({ email: customerEmail, name: customerName })
              contact = { id: created.id }
            }
            await addNote(
              contact.id,
              `[PURCHASE] $${(session.amount_total / 100).toFixed(2)} via ${session.payment_link ? 'Payment Link ' + session.payment_link : 'Checkout'} — session ${session.id}`
            )
          } catch (e) { console.error('checkout HubSpot note:', e.message) }
        }

        // Admin notification (this is the new bit)
        await notifyAdmin({
          source: session.payment_link ? 'Payment Link' : (session.metadata?.source === 'quote' ? 'Quote checkout' : 'Stripe Checkout'),
          customerName,
          customerEmail,
          customerPhone,
          amount: session.amount_total,
          currency: session.currency,
          items,
          stripeUrl: `${DASH}/payments/${session.payment_intent}`,
          ref: session.id,
        }).catch((e) => console.error('notify checkout completed:', e.message))
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
