import crypto from 'crypto'

const PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID || '2225826221565752'
const META_GRAPH_URL = `https://graph.facebook.com/v21.0/${PIXEL_ID}/events`

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

  // Verify Cal.com HMAC signature
  const secret = process.env.CALCOM_WEBHOOK_SECRET
  const sig = req.headers['x-cal-signature-256']
  if (secret && sig) {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    if (sig !== expected) {
      console.warn('[calcom-webhook] Invalid signature')
      return res.status(401).end()
    }
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
  const phone = attendee.phone || p.responses?.phone?.value || ''

  if (!email) return

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
