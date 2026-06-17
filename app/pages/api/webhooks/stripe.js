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

// Meta's click identifier (fbc) reconstructed from a stored fbclid:
// fb.1.<creation_ms>.<fbclid>. Required for ad attribution on server events.
function buildFbc(fbclid) {
  if (!fbclid) return null
  return `fb.1.${Date.now()}.${fbclid}`
}

async function fireGA4Purchase({ email, amountUsd, orderId, clientId: knownClientId }) {
  const apiSecret = process.env.GA4_API_SECRET
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-K2R5H2Z23X'
  if (!apiSecret) return
  const clientId = knownClientId || sha256hex(email || orderId).slice(0, 20)
  if (!knownClientId) console.warn('[stripe-webhook] GA4 purchase: no real client_id, attribution will be unassigned')
  try {
    const r = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          events: [{
            name: 'purchase',
            params: {
              transaction_id: orderId,
              value: amountUsd,
              currency: 'USD',
            },
          }],
        }),
      }
    )
    if (!r.ok) console.error('[stripe-webhook] GA4 MP error:', r.status, await r.text())
    else console.log(`[stripe-webhook] GA4 purchase fired — ${orderId} $${amountUsd}`)
  } catch (e) {
    console.error('[stripe-webhook] GA4 MP failed:', e.message)
  }
}

async function fireMetaPurchase({ email, phone, amountUsd, orderId, fbc, fbp, eventSourceUrl, clientIp, userAgent }) {
  const metaToken = process.env.META_SYSTEM_USER_TOKEN
  if (!metaToken || !email) return
  const userData = { em: [sha256hex(email)] }
  if (phone) userData.ph = [sha256hex(phone.replace(/\D/g, ''))]
  // Click/browser identifiers — without at least one of these Meta receives the
  // event but cannot attribute it to an ad. fbc is derived from fbclid upstream.
  if (fbc) userData.fbc = fbc
  if (fbp) userData.fbp = fbp
  if (clientIp) userData.client_ip_address = clientIp
  if (userAgent) userData.client_user_agent = userAgent
  const body = {
    data: [{
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      // 'website' (not 'system_generated') so the event is eligible for ad
      // attribution and conversion optimization.
      action_source: 'website',
      event_source_url: eventSourceUrl || 'https://www.greenguard-usa.com/',
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
    // Use the dedicated Google Ads OAuth credentials (the GOOGLE_CLIENT_ID /
    // GOOGLE_REFRESH_TOKEN pair is the Gmail/Calendar token and lacks the
    // AdWords scope — that produced silent 403s).
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
    )
    auth.setCredentials({ refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN })
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
      // v17 is sunset (404). v21 matches the rest of the integration.
      `https://googleads.googleapis.com/v21/customers/${customerId}:uploadClickConversions`,
      { method: 'POST', headers: {
        'Authorization': `Bearer ${token}`,
        'developer-token': devToken,
        ...(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID && { 'login-customer-id': process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID }),
        'Content-Type': 'application/json',
      }, body: JSON.stringify(body) }
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

  let rawBody
  try {
    rawBody = await readRawBody(req)
  } catch {
    return res.status(400).end()
  }
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
        // Fire Meta CAPI Purchase + Google Ads offline conversion + GA4 server-side purchase
        const amountUsd = invoice.amount_paid / 100
        await fireMetaPurchase({ email: customer.email, phone: customer.phone, amountUsd, orderId: invoice.id })
        const contact = customer.email ? await findContactByEmail(customer.email).catch(() => null) : null
        const gclid = contact?.properties?.gclid || null
        const ga_client_id = contact?.properties?.ga_client_id || null
        await fireGA4Purchase({ email: customer.email, amountUsd, orderId: invoice.id, clientId: ga_client_id })
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
          items = (li.data || []).map((l) => ({ description: l.description, amount: l.amount_total, quantity: l.quantity }))
        } catch {}

        const customerName = session.customer_details?.name || ''
        const customerEmail = session.customer_details?.email || session.customer_email || ''
        const customerPhone = session.customer_details?.phone || ''
        const billingAddr = session.customer_details?.address || session.shipping_details?.address || null
        const addressLine = billingAddr ? [billingAddr.line1, billingAddr.city, billingAddr.state, billingAddr.postal_code].filter(Boolean).join(', ') : ''
        const subtotal = session.amount_subtotal || session.amount_total || 0
        const tax = (session.total_details?.amount_tax) || 0

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
          customerAddress: addressLine,
          amount: session.amount_total,
          subtotal,
          tax,
          currency: session.currency,
          items,
          paidAt: session.created,
          stripeUrl: `${DASH}/payments/${session.payment_intent}`,
          ref: session.id,
        }).catch((e) => console.error('notify checkout completed:', e.message))

        // Customer receipt — shop orders get their confirmation from the Render
        // equipment handler; skip here to avoid a duplicate email.
        if (customerEmail && session.metadata?.source !== 'shop') {
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

          // Store gclid + ga_client_id in HubSpot for offline conversion attribution
          const gclid = session.metadata?.gclid
          const ga_client_id = session.metadata?.ga_client_id
          if ((gclid || ga_client_id) && customerEmail) {
            try {
              const contact = await findContactByEmail(customerEmail).catch(() => null)
              if (contact?.id) {
                const { updateContact } = require('../../../lib/hubspot')
                const props = {}
                if (gclid) props.gclid = gclid
                if (ga_client_id) props.ga_client_id = ga_client_id
                await updateContact(contact.id, { properties: props }).catch(() => {})
              }
            } catch {}
          }
          // Fire GA4 purchase for quote checkout path (uses real client_id for attribution)
          if (customerEmail) {
            const ga_client_id_meta = session.metadata?.ga_client_id || null
            await fireGA4Purchase({
              email: customerEmail,
              amountUsd: (session.amount_total || 0) / 100,
              orderId: session.id,
              clientId: ga_client_id_meta,
            })
          }
          // Fire ad-platform conversions on the ACTUAL ad-driven purchase event.
          // Quote checkouts (mode:'payment') do not produce invoice.payment_succeeded,
          // so these must fire here — this is where the fresh gclid/fbclid live.
          if (customerEmail) {
            const amountUsd = (session.amount_total || 0) / 100
            // Prefer the real _fbc cookie; fall back to one rebuilt from fbclid.
            const fbc = session.metadata?.fbc || buildFbc(session.metadata?.fbclid)
            await fireMetaPurchase({
              email: customerEmail,
              phone: session.customer_details?.phone || '',
              amountUsd,
              orderId: session.id,
              fbc,
              fbp: session.metadata?.fbp || null,
              eventSourceUrl: 'https://www.greenguard-usa.com/',
            })
            await fireGoogleAdsConversion({
              email: customerEmail,
              amountUsd,
              conversionTime: (session.created || Math.floor(Date.now() / 1000)) * 1000,
              gclid: session.metadata?.gclid,
            })
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

    await recordWebhook(event.id, event.type)
    res.status(200).json({ received: true })
  } catch (err) {
    console.error('[stripe-webhook] Processing error:', err.message)
    res.status(500).json({ error: 'Processing failed' })
  }
}
