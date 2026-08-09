const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { q } = require('../../../lib/db')

// Marks an appointment as not needing an invoice so it drops off the
// "Appointments without invoices" list on /admin/invoice.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { date, email, customerName, calBookingUid } = req.body || {}
  if (!date) return res.status(400).json({ error: 'date required' })
  if (!email && !calBookingUid && !customerName) {
    return res.status(400).json({ error: 'need email, calBookingUid, or customerName to identify the appointment' })
  }

  try {
    await q(
      `INSERT INTO dismissed_appointments (cal_booking_uid, customer_email, customer_name, service_date, dismissed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [calBookingUid || null, email ? email.toLowerCase() : null, customerName || null, date, session.email]
    )
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Error dismissing appointment:', err)
    return res.status(500).json({ error: err.message })
  }
}
