// GET /api/book/slots?year=2026&month=6
// Returns available 30-min booking slots for the given month.
// Reads all GCal events (not just GreenGuard ones) to block occupied time.
import { getCalendar } from '../../../lib/gcal'

const TZ = 'America/Chicago'
const SLOT_MIN = 30
const WORK_DAYS = new Set([1, 2, 3, 4, 5]) // Mon–Fri (0=Sun, 6=Sat — Sat is admin-only)
const WORK_START = 10   // 10:00am
const WORK_LAST = 17.5  // last slot starts 5:30pm, ends 6:00pm
const MIN_NOTICE_H = 4  // don't show slots within 4 hours of now

const CALENDAR_ID = process.env.CALENDAR_ID || 'admin@greenguard-usa.com'

// Convert a CT wall-clock time to a real UTC ISO string.
// Works correctly on a UTC server (Vercel) — same technique as gcal.js _tzDayBounds.
function ctToUtc(dateStr, hour, minute) {
  const ref = new Date(`${dateStr}T12:00:00Z`)
  const localRef = new Date(ref.toLocaleString('en-US', { timeZone: TZ }))
  const offsetMs = ref.getTime() - localRef.getTime()
  const wall = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`)
  return new Date(wall.getTime() + offsetMs).toISOString()
}

function datesInMonth(year, month) {
  const dates = []
  const d = new Date(year, month - 1, 1)
  while (d.getMonth() === month - 1) {
    dates.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return dates
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).end()

  const year = parseInt(req.query.year)
  const month = parseInt(req.query.month) // 1-indexed

  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ error: 'year and month (1-indexed) required' })
  }

  try {
    const monthStart = new Date(Date.UTC(year, month - 1, 1)).toISOString()
    const monthEnd = new Date(Date.UTC(year, month, 1)).toISOString()

    const calendar = getCalendar()
    const eventsRes = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: monthStart,
      timeMax: monthEnd,
      singleEvents: true,
      maxResults: 250,
      orderBy: 'startTime',
    })

    // All non-cancelled events are treated as busy
    const busy = (eventsRes.data.items || [])
      .filter(e => e.status !== 'cancelled')
      .map(e => ({
        start: new Date(e.start?.dateTime || (e.start?.date + 'T00:00:00Z')).getTime(),
        end: new Date(e.end?.dateTime || (e.end?.date + 'T23:59:59Z')).getTime(),
      }))

    const cutoff = Date.now() + MIN_NOTICE_H * 3600000
    const result = {}

    for (const dateStr of datesInMonth(year, month)) {
      const [y, m, d] = dateStr.split('-').map(Number)
      const dow = new Date(y, m - 1, d).getDay()
      if (!WORK_DAYS.has(dow)) continue

      const daySlots = []
      for (let h = WORK_START; h <= WORK_LAST; h += SLOT_MIN / 60) {
        const hour = Math.floor(h)
        const minute = Math.round((h - hour) * 60)
        const startMs = new Date(ctToUtc(dateStr, hour, minute)).getTime()
        const endMs = startMs + SLOT_MIN * 60000
        if (startMs < cutoff) continue
        if (!busy.some(b => startMs < b.end && endMs > b.start)) {
          daySlots.push(ctToUtc(dateStr, hour, minute))
        }
      }

      if (daySlots.length > 0) result[dateStr] = daySlots
    }

    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
    return res.status(200).json({ slots: result })
  } catch (e) {
    console.error('[book/slots]', e.message)
    return res.status(500).json({ error: 'Failed to load availability' })
  }
}
