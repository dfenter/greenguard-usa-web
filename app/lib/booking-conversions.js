// Server-side conversion firing for the /book property-assessment funnel.
//
// WHY THIS EXISTS: the booking form (astro book.astro -> /api/book/create) only
// ever fired CLIENT-side gtag/fbq events. Those are lost for the majority of real
// traffic (iOS/ad-block strip the pixel; Meta Audience Network can't run it), so
// Google's "Booking Lead (offline import)" and Meta's Lead both showed 0 in a full
// 30-day window. With 0 conversion signal, MAXIMIZE_CONVERSIONS bidding on both
// platforms was starved and CPA blew out. This fires the durable server-side
// signal so the bidding algorithms can actually learn from booked assessments.
//
// Mirrors the proven patterns in pages/api/webhooks/stripe.js (same API versions,
// same auth). Fire-and-forget: never block or fail the booking on a tracking error.

const crypto = require('crypto')

const sha256hex = (s) => crypto.createHash('sha256').update(String(s).trim().toLowerCase()).digest('hex')

const PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID || '2225826221565752'
const META_GRAPH_URL = `https://graph.facebook.com/v21.0/${PIXEL_ID}/events`
// "Booking Lead (offline import)" conversion action — SUBMIT_LEAD_FORM, primary.
const BOOKING_CONVERSION_ID = process.env.GOOGLE_ADS_LEAD_CONVERSION_ID || '7653935010'
const LEAD_VALUE = 25

async function fireGoogleAdsBookingLead({ gclid, gbraid, wbraid }) {
  // ClickConversion takes exactly one of gclid / gbraid / wbraid.
  const clickId = gclid ? { gclid } : gbraid ? { gbraid } : wbraid ? { wbraid } : null
  if (!clickId) return
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID
  if (!devToken || !customerId) return
  try {
    const tokRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    })
    const tok = await tokRes.json()
    if (!tok.access_token) { console.error('[book-conv] Google token error:', JSON.stringify(tok).slice(0, 160)); return }
    const loginCid = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || customerId
    const body = {
      conversions: [{
        ...clickId,
        conversion_action: `customers/${customerId}/conversionActions/${BOOKING_CONVERSION_ID}`,
        conversion_date_time: new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '+00:00'),
        conversion_value: LEAD_VALUE,
        currency_code: 'USD',
      }],
      // Must be `partialFailure` (request field). `partialFailureError` is a
      // RESPONSE field and the API hard-400s if you send it as a request field.
      partialFailure: true,
    }
    const r = await fetch(
      `https://googleads.googleapis.com/v25/customers/${customerId}:uploadClickConversions`,
      { method: 'POST', headers: {
        Authorization: `Bearer ${tok.access_token}`,
        'developer-token': devToken,
        'login-customer-id': loginCid,
        'Content-Type': 'application/json',
      }, body: JSON.stringify(body) }
    )
    const data = await r.json()
    if (!r.ok || data.error) console.error('[book-conv] Google Ads lead HTTP error:', r.status, JSON.stringify(data.error || data).slice(0, 300))
    else if (data.partialFailureError) console.error('[book-conv] Google Ads lead error:', JSON.stringify(data.partialFailureError).slice(0, 300))
    else console.log('[book-conv] Google Ads booking lead uploaded')
  } catch (e) {
    console.error('[book-conv] Google Ads lead failed:', e.message)
  }
}

async function fireMetaBookingLead({ email, phone, fbclid, fbp, eventId, clientIp, userAgent }) {
  const metaToken = process.env.META_SYSTEM_USER_TOKEN
  if (!metaToken || !email) return
  const userData = { em: [sha256hex(email)] }
  if (phone) userData.ph = [sha256hex(phone.replace(/\D/g, ''))]
  // Rebuild fbc from fbclid (fb.1.<ms>.<fbclid>) so Meta can attribute to the click.
  // Meta's spec wants the creation time in MILLISECONDS — seconds tanks match quality.
  if (fbclid) userData.fbc = `fb.1.${Date.now()}.${fbclid}`
  if (fbp) userData.fbp = fbp
  if (clientIp) userData.client_ip_address = clientIp
  if (userAgent) userData.client_user_agent = userAgent
  const body = {
    data: [{
      event_name: 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: 'https://www.greenguard-usa.com/book',
      // Shared with the client fbq('track','Lead') eventID so Meta dedupes the pair.
      event_id: eventId || `book_${sha256hex(email).slice(0, 16)}`,
      user_data: userData,
      custom_data: { value: LEAD_VALUE, currency: 'USD', content_name: 'Property Assessment Booking' },
    }],
  }
  try {
    const r = await fetch(`${META_GRAPH_URL}?access_token=${metaToken}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await r.json()
    if (!r.ok) console.error('[book-conv] Meta CAPI error:', JSON.stringify(data).slice(0, 300))
    else console.log(`[book-conv] Meta CAPI Lead ok — events_received: ${data.events_received}`)
  } catch (e) {
    console.error('[book-conv] Meta CAPI failed:', e.message)
  }
}

async function fireGA4BookingLead({ email, clientId, sessionId }) {
  const apiSecret = process.env.GA4_API_SECRET
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-K2R5H2Z23X'
  if (!apiSecret || !email) return
  // session_id ties the MP event to the visitor's live session so GA4 attributes
  // it to the acquiring channel; without it every lead lands in Unassigned.
  const params = { value: LEAD_VALUE, currency: 'USD', lead_source: 'booking', engagement_time_msec: 100 }
  if (sessionId) params.session_id = sessionId
  try {
    const r = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId || sha256hex(email).slice(0, 20),
          events: [{ name: 'generate_lead', params }],
        }),
      }
    )
    if (!r.ok) console.error('[book-conv] GA4 MP error:', r.status)
  } catch (e) {
    console.error('[book-conv] GA4 MP failed:', e.message)
  }
}

// Fire all booking conversions in parallel. Never throws.
async function fireBookingConversions({ email, phone, gclid, gbraid, wbraid, fbclid, fbp, gaClientId, gaSessionId, eventId, clientIp, userAgent }) {
  await Promise.allSettled([
    fireGoogleAdsBookingLead({ gclid, gbraid, wbraid }),
    fireMetaBookingLead({ email, phone, fbclid, fbp, eventId, clientIp, userAgent }),
    fireGA4BookingLead({ email, clientId: gaClientId, sessionId: gaSessionId }),
  ])
}

module.exports = { fireBookingConversions }
