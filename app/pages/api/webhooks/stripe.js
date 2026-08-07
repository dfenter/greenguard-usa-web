const { stripe } = require('../../../lib/stripe')
const { upsertContact, addNote, findContactByEmail, updateContact } = require('../../../lib/hubspot')
const { sendT0Email, markStage, clearStages } = require('../../../lib/payment-resurrection')
const { notifyAdmin, sendCustomerReceipt, sendCheckoutReceipt } = require('../../../lib/purchase-notify')
const { sendWelcomeEmail } = require('../../../lib/email')
const { createMagicToken, markQuotePaid } = require('../../../lib/auth')
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

async function fireGA4Purchase({ email, amountUsd, orderId, clientId: knownClientId, sessionId }) {
  const apiSecret = process.env.GA4_API_SECRET
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-K2R5H2Z23X'
  if (!apiSecret) return
  const clientId = knownClientId || sha256hex(email || orderId).slice(0, 20)
  if (!knownClientId) console.warn('[stripe-webhook] GA4 purchase: no real client_id, attribution will be unassigned')
  // session_id (captured at checkout) attaches the purchase to the buyer's live
  // session so GA4 attributes it to the acquiring channel instead of Unassigned.
  const params = { transaction_id: orderId, value: amountUsd, currency: 'USD', engagement_time_msec: 100 }
  if (sessionId) params.session_id = sessionId
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
            params,
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
      // v17 is sunset (404). v25 matches the rest of the integration (v21 sunset 2026-08-05).
      `https://googleads.googleapis.com/v25/customers/${customerId}:uploadClickConversions`,
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
const SIDE_EFFECT_TIMEOUT_MS = 8000

// Stripe's SDK calls do not accept an AbortSignal. Bound each non-critical
// side effect so one provider cannot consume the whole webhook invocation.
function withSideEffectTimeout(label, task) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${SIDE_EFFECT_TIMEOUT_MS}ms`)), SIDE_EFFECT_TIMEOUT_MS)
  })
  return Promise.race([Promise.resolve().then(task), timeout]).finally(() => clearTimeout(timer))
}

async function settleSideEffectGroup(groupName, effects) {
  const results = await Promise.allSettled(
    effects.map(({ label, task }) => withSideEffectTimeout(`${groupName}/${label}`, task))
  )
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason)
      console.error(`[stripe-webhook] ${groupName}/${effects[index].label} failed:`, reason)
    }
  })
}

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

  // Idempotency: atomically claim the event before doing any work. Stripe
  // retries on non-200, and the same event can be delivered to parallel
  // instances; the KV-backed claim ensures exactly one processes it. On
  // failure we release the claim so the retry can reprocess.
  // Claim with a SHORT ttl. If this lambda times out mid-processing, neither the
  // success path nor the catch runs — a long claim would leave the event
  // permanently marked done and Stripe's retry would get {duplicate:true} and
  // give up (silent event loss). A short claim self-expires so the retry
  // reprocesses; confirmWebhook() below extends it to the full TTL only after
  // the event is actually handled.
  const { claimWebhook, confirmWebhook, releaseWebhook } = require('../../../lib/db-webhook-log')
  if (!(await claimWebhook(event.id, 180))) {
    return res.status(200).json({ received: true, duplicate: true })
  }
  try {
    switch (event.type) {
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object
        const customer = await stripe.customers.retrieve(invoice.customer)

        // Money-critical HubSpot writes stay serial and awaited. A failure here
        // must make Stripe retry rather than acknowledging an incomplete payment
        // record; notifications and attribution below are deliberately isolated.
        if (customer.email) {
          const contact = await findContactByEmail(customer.email)
          if (contact) {
            await addNote(
              contact.id,
              `Payment received: $${(invoice.amount_paid / 100).toFixed(2)} — Invoice ${invoice.id}`
            )
            // Clear any stale 'failed' flag — payment_failed sets it but nothing
            // ever reset it, so paying customers stayed flagged 'failed' forever.
            if (contact.properties?.payment_status === 'failed') {
              await upsertContact({ email: customer.email, metadata: { payment_status: 'paid' } })
            }
          }
        }

        // These effects are independent. Run notification/cleanup and
        // attribution as bounded groups so a hung provider only costs 8s.
        const amountUsd = invoice.amount_paid / 100
        await Promise.all([
          settleSideEffectGroup('invoice-notifications', [
            {
              label: 'admin notification',
              task: () => notifyAdmin({
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
              }),
            },
            {
              label: 'customer receipt',
              task: () => sendCustomerReceipt({
                invoice,
                customer,
                receiptUrl: invoice.charge ? `https://pay.stripe.com/receipts/invoices/${invoice.id}` : null,
                hostedInvoiceUrl: invoice.hosted_invoice_url,
              }),
            },
            // Wipe payment-resurrection state so a future failure restarts the clock.
            { label: 'payment-resurrection cleanup', task: () => clearStages(invoice.id) },
          ]),
          settleSideEffectGroup('invoice-attribution', [
            {
              label: 'Meta Purchase',
              task: () => fireMetaPurchase({ email: customer.email, phone: customer.phone, amountUsd, orderId: invoice.id }),
            },
            {
              label: 'GA4 Purchase',
              task: async () => {
                const contact = customer.email ? await findContactByEmail(customer.email) : null
                await fireGA4Purchase({
                  email: customer.email,
                  amountUsd,
                  orderId: invoice.id,
                  clientId: contact?.properties?.ga_client_id || null,
                })
              },
            },
            {
              label: 'Google Ads conversion',
              task: async () => {
                const contact = customer.email ? await findContactByEmail(customer.email) : null
                await fireGoogleAdsConversion({
                  email: customer.email,
                  amountUsd,
                  conversionTime: invoice.created * 1000,
                  gclid: contact?.properties?.gclid || null,
                })
              },
            },
          ]),
        ])
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

        const customerName = session.customer_details?.name || ''
        const customerEmail = session.customer_details?.email || session.customer_email || ''
        const customerPhone = session.customer_details?.phone || ''
        const billingAddr = session.customer_details?.address || session.shipping_details?.address || null
        const addressLine = billingAddr ? [billingAddr.line1, billingAddr.city, billingAddr.state, billingAddr.postal_code].filter(Boolean).join(', ') : ''
        const subtotal = session.amount_subtotal || session.amount_total || 0
        const tax = (session.total_details?.amount_tax) || 0
        const isQuote = session.metadata?.source === 'quote' && !!customerEmail

        // Money-critical quote state and payment status are serial and awaited
        // before any notifications, welcome email, or attribution calls.
        if (session.metadata?.source === 'quote' && session.metadata?.quote_jti) {
          await markQuotePaid(session.metadata.quote_jti)
        }

        let checkoutContact = null
        if (customerEmail) {
          checkoutContact = await findContactByEmail(customerEmail)
          if (!checkoutContact?.id) {
            const created = await upsertContact({ email: customerEmail, name: customerName, phone: customerPhone, address: addressLine })
            checkoutContact = { id: created.id }
          }
          await upsertContact({
            email: customerEmail,
            name: customerName,
            phone: customerPhone,
            address: addressLine,
            metadata: { payment_status: 'paid' },
          })
          await addNote(
            checkoutContact.id,
            `[PURCHASE] $${(session.amount_total / 100).toFixed(2)} via ${session.payment_link ? 'Payment Link ' + session.payment_link : 'Checkout'} — session ${session.id}`
          )
          // This note is the durable HubSpot quote-paid marker consumed by the
          // follow-up cron, so keep it in the serial money-state section.
          if (isQuote && session.metadata?.quote_jti) {
            await addNote(checkoutContact.id, `[QUOTE-PAID] jti=${session.metadata.quote_jti} session=${session.id} confirmed=${new Date().toISOString()}`)
          }
        }

        // Line-item expansion is not money-critical, but it is shared by the
        // notification tasks and bounded so a slow Stripe read cannot hang them.
        const itemsPromise = withSideEffectTimeout('checkout line-item expansion', async () => {
          const li = await stripe.checkout.sessions.listLineItems(session.id, { limit: 20 })
          return (li.data || []).map((l) => ({ description: l.description, amount: l.amount_total, quantity: l.quantity }))
        }).catch((e) => {
          console.error('[stripe-webhook] checkout line-item expansion failed:', e.message)
          return []
        })

        const amountUsd = (session.amount_total || 0) / 100
        const conversions = customerEmail ? [
          {
            label: 'GA4 Purchase',
            task: () => fireGA4Purchase({
              email: customerEmail,
              amountUsd,
              orderId: session.id,
              clientId: session.metadata?.ga_client_id || null,
              sessionId: session.metadata?.ga_session_id || null,
            }),
          },
          {
            label: 'Meta Purchase',
            task: () => fireMetaPurchase({
              email: customerEmail,
              phone: customerPhone,
              amountUsd,
              orderId: session.id,
              fbc: session.metadata?.fbc || buildFbc(session.metadata?.fbclid),
              fbp: session.metadata?.fbp || null,
              eventSourceUrl: session.metadata?.source === 'shop'
                ? 'https://www.greenguard-usa.com/shop'
                : 'https://www.greenguard-usa.com/',
            }),
          },
          {
            label: 'Google Ads conversion',
            task: () => fireGoogleAdsConversion({
              email: customerEmail,
              amountUsd,
              conversionTime: (session.created || Math.floor(Date.now() / 1000)) * 1000,
              gclid: session.metadata?.gclid,
            }),
          },
        ] : []

        await Promise.all([
          settleSideEffectGroup('checkout-notifications', [
            {
              label: 'admin notification',
              task: async () => notifyAdmin({
                source: session.payment_link ? 'Payment Link' : (session.metadata?.source === 'quote' ? 'Quote checkout' : 'Stripe Checkout'),
                customerName,
                customerEmail,
                customerPhone,
                customerAddress: addressLine,
                amount: session.amount_total,
                subtotal,
                tax,
                currency: session.currency,
                items: await itemsPromise,
                paidAt: session.created,
                stripeUrl: `${DASH}/payments/${session.payment_intent}`,
                ref: session.id,
              }),
            },
            {
              label: 'customer receipt',
              task: async () => {
                // Shop orders get their confirmation from the equipment handler.
                if (!customerEmail || session.metadata?.source === 'shop') return
                let receiptUrl = null
                try {
                  const pi = await withSideEffectTimeout('checkout receipt URL', () =>
                    stripe.paymentIntents.retrieve(session.payment_intent, { expand: ['latest_charge'] })
                  )
                  receiptUrl = pi.latest_charge?.receipt_url || null
                } catch (e) {
                  console.error('[stripe-webhook] checkout receipt URL failed:', e.message)
                }
                await sendCheckoutReceipt({ session, items: await itemsPromise, receiptUrl })
              },
            },
            {
              label: 'welcome email',
              task: async () => {
                if (!isQuote) return
                const magicToken = await createMagicToken(customerEmail)
                const APP_URL_WH = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'
                await sendWelcomeEmail({
                  email: customerEmail,
                  customerName,
                  magicLink: `${APP_URL_WH}/auth/verify?token=${encodeURIComponent(magicToken)}`,
                  calLink: 'https://cal.com/greenguard-usa/property-assessment',
                })
              },
            },
            {
              label: 'HubSpot attribution',
              task: async () => {
                if (!isQuote || !checkoutContact?.id) return
                const props = {}
                if (session.metadata?.gclid) props.gclid = session.metadata.gclid
                if (session.metadata?.ga_client_id) props.ga_client_id = session.metadata.ga_client_id
                if (Object.keys(props).length > 0) await updateContact(checkoutContact.id, { properties: props })
              },
            },
          ]),
          settleSideEffectGroup('checkout-attribution', conversions),
        ])
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

    // Fully handled — extend the short claim to the durable TTL.
    await confirmWebhook(event.id)
    res.status(200).json({ received: true })
  } catch (err) {
    console.error('[stripe-webhook] Processing error:', err.message)
    // Release the claim so Stripe's retry can reprocess this event.
    try { await releaseWebhook(event.id) } catch {}
    res.status(500).json({ error: 'Processing failed' })
  }
}
