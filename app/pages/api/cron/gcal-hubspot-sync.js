// GCal → HubSpot contact sync
//
// Reads all GreenGuard bookings in a rolling window (90 days back → 90 days
// forward) and upserts each booker as a HubSpot contact. Idempotent — safe
// to run daily. Catches assessment bookers and any other Cal.com bookings that
// never produced a Stripe invoice (the only other path into HubSpot).
//
// Invoked daily by cron-job.org via POST + x-cron-key header.

const { authorize } = require('../../../lib/cron-auth')
const {
  getCalendar,
  parseEmailFromDescription,
  parseEmailFromAttendees,
  parsePhoneFromDescription,
  parseAddressFromDescription,
  parseCustomerName,
} = require('../../../lib/gcal')
const { upsertContact } = require('../../../lib/hubspot')

const CALENDAR_ID = process.env.CALENDAR_ID || 'admin@greenguard-usa.com'
const LOOKBACK_DAYS = 90
const LOOKAHEAD_DAYS = 90

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end()
  if (!authorize(req, res)) return

  const now = new Date()
  const timeMin = new Date(now.getTime() - LOOKBACK_DAYS * 86400 * 1000).toISOString()
  const timeMax = new Date(now.getTime() + LOOKAHEAD_DAYS * 86400 * 1000).toISOString()

  let events
  try {
    const cal = getCalendar()
    const r = await cal.events.list({
      calendarId: CALENDAR_ID,
      timeMin,
      timeMax,
      maxResults: 250,
      singleEvents: true,
      orderBy: 'startTime',
      q: 'GreenGuard USA',
    })
    events = (r.data.items || []).filter(
      (e) =>
        (e.description && e.description.includes('GreenGuard USA')) ||
        (e.summary && e.summary.includes('GreenGuard USA'))
    )
  } catch (e) {
    console.error('[gcal-hubspot-sync] GCal error:', e.message)
    return res.status(500).json({ error: e.message })
  }

  const results = { created: 0, updated: 0, skipped: 0, errors: [] }

  for (const event of events) {
    const email =
      parseEmailFromDescription(event.description) ||
      parseEmailFromAttendees(event.attendees)
    if (!email) { results.skipped++; continue }

    const name = parseCustomerName(event.summary) || ''
    const phone = parsePhoneFromDescription(event.description) || ''
    const address = event.location || parseAddressFromDescription(event.description) || ''

    // Infer system properties from appointment title (e.g. "Two - 20 pound CO2 Tank Exchange")
    const title = (event.summary || '').toLowerCase()
    const metadata = {}
    if (title.includes('co2 tank exchange') || title.includes('co2 tank delivery')) {
      metadata.system_type = 'biogents-co2'
      metadata.plan_type = 'tank-exchange'
      const countWords = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }
      const match = title.match(/^(\w+)\s*-\s*\d+\s*pound/)
      if (match) {
        const n = countWords[match[1]] || parseInt(match[1], 10) || null
        if (n) { metadata.tank_count = String(n); metadata.trap_count = String(n) }
      }
    }

    // Only pass non-empty fields so we don't blank out existing HubSpot data
    const contactPayload = { email, name }
    if (phone) contactPayload.phone = phone
    if (address) contactPayload.address = address
    if (Object.keys(metadata).length) contactPayload.metadata = metadata

    try {
      const r = await upsertContact(contactPayload)
      if (r.created) results.created++
      else results.updated++
    } catch (e) {
      console.error(`[gcal-hubspot-sync] upsert failed for ${email}:`, e.message)
      results.errors.push({ email, error: e.message })
    }
  }

  console.log('[gcal-hubspot-sync]', results)
  return res.status(200).json({ scanned: events.length, ...results })
}
