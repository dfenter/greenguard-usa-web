const { stripe } = require('../../../lib/stripe')
const { upsertContact, addNote, findContactByEmail } = require('../../../lib/hubspot')
const { sendT0Email, markStage, clearStages } = require('../../../lib/payment-resurrection')
const { notifyAdmin, sendCustomerReceipt, sendCheckoutReceipt } = require('../../../lib/purchase-notify')
const { sendWelcomeEmail } = require('../../../lib/email')
const { createMagicToken } = require('../../../lib/auth')
const crypto = require('crypto')

const PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID || '2225826221565752'
const META_GRAPH_URL = `https://graph.facebook.com/v21.0/${PIXEL_ID}/events`

function sha256hex(str) {
  return crypto.createHash('sha256').update((str || '').trim().toLowerCase()).digest('hex')
}

async function fireMetaPurchase({ email, phone, amountUsd, orderId }) {
  const metaToken = process.env.META_SYSTEM_USER_TOKEN
  if (!metaToken || !email) return
  const userData = { em: [sha256hex(email)] }
  if (phone) userData.ph = [sha256hex(phone.replace(/\D/g, ''))]
  const body = {
    data: [{
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'system_generated',
      event_id: `stripe_${orderId}`,
      user_data: userData,
      custom_data: { value: amountUsd, currency: 'USD' },
    }],
  }
  try {
    const r = await fetch(`${META_GRAPH_URL}?access_token=${metaToken}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await r.json()
    if (!r.ok) console.error('[stripe-webhook] Meta CAPI error:', data)
    else console.log(`[stripe-webhook] Meta CAPI Purchase ok — events_received: ${data.events_received}`)
  } catch (e) {
    console.error('[stripe-webhook] Meta CAPI failed:', e.message)
  }
}

async function fireGoogleAdsConversion({ email, amountUsd, conversionTime, gclid }) {
  if (!gclid) return
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID
  if (!devToken || !customerId) return
  try {
    const { google } = require('googleapis')
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const { token } = await auth.getAccessToken()
    const body = {
      conversions: [{
        gclid,
        conversion_action: `customers/${customerId}/conversionActions/${process.env.GOOGLE_ADS_CONVERSION_ID}`,
        conversion_date_time: new Date(conversionTime).toISOString().replace('T', ' ').replace('Z', '+00:00'),
        conversion_value: amountUsd,
        currency_code: 'USD',
      }]
    }
    const r = await fetch(
      `https://googleads.googleapis.com/v17/customers/${customerId}:uploadClickConversions`,
      { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'developer-token': devToken, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    )
    const data = await r.json()
    if (data.partialFailureError) console.error('[stripe-webhook] Google Ads conversion error:', data.partialFailureError)
    else console.log('[stripe-webhook] Google Ads conversion uploaded')
  } catch (e) {
    console.error('[stripe-webhook] Google Ads conversion failed:', e.message)
  }
}

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
    console.warn(`[stripe-webhook] Invalid signature from ${req.headers['x-forwarded-for'] || 'unknown'}`)
    return res.status(401).end()  // Don't leak error details
  }

  // Idempotency: skip if we've already processed this event (Stripe retries on non-200)
  const { isWebhookProcessed, recordWebhook } = require('../../../lib/db-webhook-log')
  if (await isWebhookProcessed(event.id)) {
    return res.status(200).json({ received: true, duplicate: true })
  }
  await recordWebhook(event.id, event.type)

  // Respond to Stripe immediately — processing happens below
  // This prevents Stripe from retrying due to slow HubSpot/Resend calls
  res.status(200).json({ received: true })

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
        // Fire Meta CAPI Purchase + Google Ads offline conversion
        const amountUsd = invoice.amount_paid / 100
        await fireMetaPurchase({ email: customer.email, phone: customer.phone, amountUsd, orderId: invoice.id })
        const contact = customer.email ? await findContactByEmail(customer.email).catch(() => null) : null
        const gclid = contact?.properties?.gclid || null
        await fireGoogleAdsConversion({ email: customer.email, amountUsd, conversionTime: invoice.created * 1000, gclid })

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

        // Admin notification
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

        // Customer receipt — fetch receipt URL from the payment intent charge
        if (customerEmail) {
          let receiptUrl = null
          try {
            const pi = await stripe.paymentIntents.retrieve(session.payment_intent, { expand: ['latest_charge'] })
            receiptUrl = pi.latest_charge?.receipt_url || null
          } catch {}
          await sendCheckoutReceipt({ session, items, receiptUrl })
            .catch((e) => console.error('checkout customer receipt:', e.message))
        }

        // Mark quote as paid in HubSpot so quote-followup cron stops following up
        if (session.metadata?.source === 'quote' && session.metadata?.quote_jti && customerEmail) {
          try {
            const contact = await findContactByEmail(customerEmail).catch(() => null)
            if (contact?.id) {
              await addNote(contact.id, `[QUOTE-PAID] jti=${session.metadata.quote_jti} session=${session.id} confirmed=${new Date().toISOString()}`)
            }
          } catch (e) { console.error('quote-paid marker failed:', e.message) }
        }

        // For quote checkouts: send welcome email with magic login link + installation CTA
        if (session.metadata?.source === 'quote' && customerEmail) {
          try {
            const magicToken = await createMagicToken(customerEmail)
            const APP_URL_WH = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'
            const magicLink = `${APP_URL_WH}/auth/verify?token=${encodeURIComponent(magicToken)}`
            await sendWelcomeEmail({
              email: customerEmail,
              customerName: customerName,
              magicLink,
              calLink: 'https://cal.com/greenguard-usa/property-assessment',
            })
          } catch (e) { console.error('welcome email failed:', e.message) }

          // Store gclid/UTMs from session metadata in HubSpot for offline conversion attribution
          const gclid = session.metadata?.gclid
          if (gclid && customerEmail) {
            try {
              const contact = await findContactByEmail(customerEmail).catch(() => null)
              if (contact?.id) {
                const { updateContact } = require('../../../lib/hubspot')
                await updateContact(contact.id, { gclid }).catch(() => {})
              }
            } catch {}
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

    // Response already sent above
  } catch (err) {
    console.error('[stripe-webhook] Processing error:', err.message)
    // Response already sent — just log, don't try to respond again
  }
}
