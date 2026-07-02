import crypto from 'crypto'
import { upsertContact } from '../../../lib/hubspot'
import { cancelBooking } from '../../../lib/calcom'

const PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID || '2225826221565752'
const META_GRAPH_URL = `https://graph.facebook.com/v21.0/${PIXEL_ID}/events`

// Service-area backstop: catches out-of-area bookings made via direct Cal.com
// links (the /book page gate only protects bookings made through the website).
// Depot = 1519 Parkway, Austin TX 78703.
const DEPOT = { lat: 30.2805175, lng: -97.7512789 }
const SERVICE_RADIUS_MI = 40

function milesBetween(a, b) {
  const R = 3958.8, d2r = Math.PI / 180
  const dLat = (b.lat - a.lat) * d2r, dLng = (b.lng - a.lng) * d2r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * d2r) * Math.cos(b.lat * d2r) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

async function geocode(address) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!key || !address) return null
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`)
    const d = await r.json()
    const loc = d?.results?.[0]?.geometry?.location
    return loc ? { lat: loc.lat, lng: loc.lng } : null
  } catch { return null }
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

function sha256hex(str) {
  return crypto.createHash('sha256').update((str || '').trim().toLowerCase()).digest('hex')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const rawBody = await readRawBody(req)

  // Verify Cal.com HMAC signature — FAIL CLOSED. Previously the check was
  // skipped when the header (or secret) was absent, letting an attacker forge
  // events simply by omitting the signature header.
  const secret = process.env.CALCOM_WEBHOOK_SECRET
  const sig = req.headers['x-cal-signature-256'] || ''
  if (!secret) {
    console.error('[calcom-webhook] CALCOM_WEBHOOK_SECRET not configured — rejecting unverifiable webhook')
    return res.status(503).end()
  }
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const sigBuf = Buffer.from(sig, 'utf8')
  const expBuf = Buffer.from(expected, 'utf8')
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    console.warn('[calcom-webhook] Invalid or missing signature')
    return res.status(401).end()
  }

  // Respond immediately so Cal.com doesn't retry
  res.status(200).json({ received: true })

  let payload
  try { payload = JSON.parse(rawBody.toString()) } catch { return }

  const trigger = payload.triggerEvent || payload.type
  if (trigger !== 'BOOKING_CREATED') return

  const p = payload.payload || {}
  const attendee = (p.attendees || [])[0] || {}
  const email = attendee.email || p.responses?.email?.value || ''
  const name = attendee.name || p.responses?.name?.value || ''
  const phone = attendee.phone || p.responses?.phone?.value || ''

  // The event location type is "attendeeAddress", so the customer's service
  // address arrives in the location response. Pull it from the shapes Cal.com uses.
  const loc = p.responses?.location
  const addrFromLoc =
    (loc && typeof loc === 'object' && (loc.value?.optionValue || loc.optionValue)) ||
    (typeof loc?.value === 'string' && loc.value !== 'attendeeAddress' ? loc.value : '') ||
    (typeof p.location === 'string' && p.location !== 'attendeeAddress' ? p.location : '')
  const address = addrFromLoc || p.responses?.address?.value || p.responses?.notes?.value || ''

  if (!email) return

  // Service-area check — geocode the address and log a warning if out of range.
  // Never auto-cancel: street-only addresses geocode to wrong cities; admin verifies manually.
  if (address) {
    const geo = await geocode(address)
    if (geo) {
      const miles = milesBetween(DEPOT, geo)
      if (miles > SERVICE_RADIUS_MI) {
        console.warn(`[calcom-webhook] POSSIBLE out-of-area booking (~${Math.round(miles)} mi) for ${email} at "${address}" — admin should verify before the visit`)
      }
    }
  }

  // Ensure a HubSpot contact exists for every new booking
  try {
    const result = await upsertContact({ email, name, phone, address })
    console.log(`[calcom-webhook] HubSpot contact ${result.created ? 'created' : 'updated'} for ${email}`)
  } catch (e) {
    console.error('[calcom-webhook] HubSpot upsert failed:', e.message)
  }

  const metaToken = process.env.META_SYSTEM_USER_TOKEN
  if (!metaToken) return

  try {
    const userData = { em: [sha256hex(email)] }
    if (phone) userData.ph = [sha256hex(phone.replace(/\D/g, ''))]

    const body = {
      data: [{
        event_name: 'Schedule',
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: 'https://www.greenguard-usa.com/book',
        action_source: 'website',
        event_id: `cal_${p.uid || Date.now()}`,
        user_data: userData,
      }],
    }

    const r = await fetch(`${META_GRAPH_URL}?access_token=${metaToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await r.json()
    if (!r.ok) console.error('[calcom-webhook] Meta CAPI error:', data)
    else console.log(`[calcom-webhook] Meta CAPI ok — events_received: ${data.events_received}`)
  } catch (e) {
    console.error('[calcom-webhook] Meta CAPI fetch failed:', e.message)
  }
}
