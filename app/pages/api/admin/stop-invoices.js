// POST /api/admin/stop-invoices
// Body: { stops: [{ key, email, calBookingUid, serviceDate }] }
// Returns: { invoices: { [key]: existingInvoice|null } }
//
// Moves the per-stop Stripe invoice lookup off the /admin/rounds SSR path
// so the page renders immediately and the invoice badges populate after.
// findInvoiceForBooking is itself 30s-cached, so repeat polls are cheap.

const { requireAdmin } = require('../../../lib/auth')
const { findInvoiceForBooking } = require('../../../lib/stripe')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await requireAdmin(req, res)
  if (!session) return

  const stops = Array.isArray(req.body?.stops) ? req.body.stops.slice(0, 100) : []
  const out = {}
  await Promise.all(stops.map(async (s) => {
    if (!s?.key || !s?.email) { if (s?.key) out[s.key] = null; return }
    try {
      out[s.key] = await findInvoiceForBooking(s.email, {
        calBookingUid: s.calBookingUid,
        serviceDate: s.serviceDate,
      }) || null
    } catch {
      out[s.key] = null
    }
  }))

  res.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=30')
  return res.status(200).json({ invoices: out })
}
