const { requireAdmin } = require('../../../lib/auth')
const { getBookingsForDate } = require('../../../lib/gcal')
const { cached } = require('../../../lib/cache')

// GET /api/admin/bookings?date=YYYY-MM-DD
// Returns all bookings on the given CT day with start/end/address/etc.
// 30s cache prevents calendar day-switching from hammering Google Calendar.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const session = await requireAdmin(req, res)
  if (!session) return

  const tz = process.env.CALENDAR_TIMEZONE || 'America/Chicago'
  const date = String(req.query.date || '').match(/^\d{4}-\d{2}-\d{2}$/)
    ? req.query.date
    : new Date().toLocaleDateString('en-CA', { timeZone: tz })

  try {
    const bookings = await cached(`gcal:bookings:date:${date}`, 30, () => getBookingsForDate(date))
    res.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=30')
    return res.status(200).json({ date, bookings })
  } catch (e) {
    console.error('bookings api error:', e.message)
    return res.status(502).json({ error: 'Failed to load bookings' })
  }
}
