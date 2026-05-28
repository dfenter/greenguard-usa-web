const { requireAdmin } = require('../../../lib/auth')
const { getBookingsForDate } = require('../../../lib/gcal')
const { findContactsByEmails, tanksForCustomer } = require('../../../lib/hubspot')
const { cached } = require('../../../lib/cache')

// GET /api/admin/bookings?date=YYYY-MM-DD
// Returns all bookings on the given CT day with start/end/address/etc.,
// plus a canonical `hubspotTanks` count per booking (from the customer's
// HubSpot tank_count property). The calendar prefers that count over the
// title-regex fallback so the count matches rounds exactly.
// 30s cache prevents calendar day-switching from hammering Google Calendar.
async function loadEnrichedBookings(date) {
  const bookings = await getBookingsForDate(date)
  const emails = [...new Set(bookings.map((b) => b.email).filter(Boolean).map((e) => e.toLowerCase()))]
  let tanksByEmail = {}
  if (emails.length > 0) {
    try {
      const contactMap = await findContactsByEmails(emails)
      for (const email of emails) {
        const c = contactMap.get(email)
        if (!c) continue
        const t = tanksForCustomer(c.properties)
        if (t > 0) tanksByEmail[email] = t
      }
    } catch (e) {
      console.warn('bookings api hubspot lookup failed:', e.message)
    }
  }
  return bookings.map((b) => ({
    ...b,
    hubspotTanks: b.email ? (tanksByEmail[b.email.toLowerCase()] || null) : null,
  }))
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const session = await requireAdmin(req, res)
  if (!session) return

  const tz = process.env.CALENDAR_TIMEZONE || 'America/Chicago'
  const date = String(req.query.date || '').match(/^\d{4}-\d{2}-\d{2}$/)
    ? req.query.date
    : new Date().toLocaleDateString('en-CA', { timeZone: tz })

  try {
    // Cache key bumped to v2 because the shape now includes hubspotTanks.
    const bookings = await cached(`gcal:bookings:v2:date:${date}`, 30, () => loadEnrichedBookings(date))
    res.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=30')
    return res.status(200).json({ date, bookings })
  } catch (e) {
    console.error('bookings api error:', e.message)
    return res.status(502).json({ error: 'Failed to load bookings' })
  }
}
