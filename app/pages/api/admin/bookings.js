const { requireAdmin } = require('../../../lib/auth')
const { getBookingsForDate, getBookingsForDateRangePaginated } = require('../../../lib/gcal')
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

async function loadEnrichedBookingsRange(start, end) {
  const bookings = await getBookingsForDateRangePaginated(start, end)
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
      console.warn('bookings range api hubspot lookup failed:', e.message)
    }
  }
  return bookings.map((b) => ({
    ...b,
    // Range records historically exposed `name`; keep it while normalizing the
    // field consumed by calendar cards.
    customerName: b.customerName || b.name || 'Customer',
    hubspotTanks: b.email ? (tanksByEmail[b.email.toLowerCase()] || null) : null,
  }))
}

function parseISODate(value) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value)
  if (!match) return null
  const calendarDate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (calendarDate.getUTCFullYear() !== Number(match[1]) || calendarDate.getUTCMonth() !== Number(match[2]) - 1 || calendarDate.getUTCDate() !== Number(match[3])) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const session = await requireAdmin(req, res)
  if (!session) return

  const tz = process.env.CALENDAR_TIMEZONE || 'America/Chicago'
  if (req.query.start !== undefined || req.query.end !== undefined) {
    const startValue = String(req.query.start || '')
    const endValue = String(req.query.end || '')
    const start = parseISODate(startValue)
    const end = parseISODate(endValue)
    const maxSpanMs = 45 * 86400 * 1000
    if (!start || !end || end < start || end.getTime() - start.getTime() > maxSpanMs) {
      return res.status(400).json({ error: 'start and end must be valid ISO dates no more than 45 days apart' })
    }
    try {
      const bookings = await cached(`gcal:bookings:v2:range:${startValue}:${endValue}`, 30, () => loadEnrichedBookingsRange(startValue, endValue))
      res.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=30')
      return res.status(200).json({ start: startValue, end: endValue, bookings })
    } catch (e) {
      console.error('bookings range api error:', e.message)
      return res.status(502).json({ error: 'Failed to load bookings' })
    }
  }

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
