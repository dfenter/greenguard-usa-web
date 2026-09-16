// POST /api/admin/reschedule — drag-and-drop move from /admin/calendar.
// Body: { eventId, bookingUid?, newStartIso, durationMin? }
// Thin wrapper over booking-actions.rescheduleAppointment (same validation,
// conflict check, Cal.com-first-then-GCal-patch, sendUpdates:'none', and
// cache invalidation as every other reschedule path).

const { requireAdmin } = require('../../../lib/auth')
const { rescheduleAppointment } = require('../../../lib/booking-actions')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  const session = await requireAdmin(req, res)
  if (!session) return

  const { eventId, bookingUid, newStartIso, durationMin } = req.body || {}
  if (!eventId || !newStartIso) {
    return res.status(400).json({ ok: false, error: 'eventId and newStartIso are required' })
  }

  try {
    const result = await rescheduleAppointment({
      bookingUid: bookingUid || null,
      eventId,
      newStartIso,
      durationMin: durationMin || undefined,
    })
    if (!result.ok) return res.status(422).json({ ok: false, error: result.reason })
    return res.status(200).json({ ok: true, oldStart: result.oldStart, newStart: result.newStart })
  } catch (e) {
    console.error('reschedule api error:', e.message)
    return res.status(502).json({ ok: false, error: 'Failed to reschedule appointment' })
  }
}
