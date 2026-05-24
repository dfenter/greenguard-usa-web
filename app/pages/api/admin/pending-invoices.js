const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { listAllDraftInvoices, stripe } = require('../../../lib/stripe')
const { getBookingsForDateRange } = require('../../../lib/gcal')

// Returns start-of-Monday ISO for the current week in the configured timezone.
function getThisMonday(tz) {
  const now = new Date()
  // Get day-of-week in target timezone
  const dayStr = now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short' })
  const days = { Sun: 6, Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5 }
  const back = days[dayStr] ?? 0
  const monday = new Date(now)
  monday.setDate(monday.getDate() - back)
  const mondayStr = monday.toLocaleDateString('en-CA', { timeZone: tz })
  // Start of Monday in CT: prepend T00:00:00 (treat as local CT time)
  return new Date(mondayStr + 'T00:00:00-05:00').toISOString()
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const tz = process.env.CALENDAR_TIMEZONE || 'America/Chicago'
  const startISO = getThisMonday(tz)
  const endISO = new Date().toISOString()

  try {
    // Fetch drafts AND open/paid invoices (covering set) to avoid double-billing
    const [rawDrafts, gcalBookings, allRecentInvoices] = await Promise.all([
      listAllDraftInvoices(),
      getBookingsForDateRange(startISO, endISO),
      stripe.invoices.list({ limit: 100, status: 'open' }).then(r => r.data).catch(() => []),
    ])

    // Also fetch recently paid invoices to mark those appointments as covered
    const paidInvoices = await stripe.invoices.list({ limit: 100, status: 'paid' }).then(r => r.data).catch(() => [])

    const allInvoicesForCover = [...rawDrafts, ...allRecentInvoices, ...paidInvoices]

    const drafts = rawDrafts.map(inv => ({
      id: inv.id,
      customerName: inv.customer?.name || '',
      customerEmail: inv.customer?.email || inv.customer_email || '',
      amountDue: inv.amount_due,
      serviceDate: inv.metadata?.service_date || '',
      lineCount: inv.lines?.data?.length || 0,
      hostedUrl: inv.hosted_invoice_url,
      calBookingUid: inv.metadata?.cal_booking_uid || '',
    }))

    // Build two covered sets — one by email+date, one by cal_booking_uid
    const coveredByDate = new Set()
    const coveredByUid = new Set()
    allInvoicesForCover.forEach(inv => {
      const email = (inv.customer?.email || inv.customer_email || '').toLowerCase()
      const date = inv.metadata?.service_date || ''
      const uid = inv.metadata?.cal_booking_uid || ''
      if (email && date) coveredByDate.add(`${email}|${date}`)
      if (uid) coveredByUid.add(uid)
    })

    const needsInvoice = gcalBookings.filter(b => {
      if (!b.dateStr) return false
      // Without an email, always show as needing review (can't dedup)
      if (!b.email) return true
      const dateKey = `${b.email.toLowerCase()}|${b.dateStr}`
      const uidCovered = b.calBookingUid && coveredByUid.has(b.calBookingUid)
      const dateCovered = coveredByDate.has(dateKey)
      return !uidCovered && !dateCovered
    }).map(b => ({
      date: b.dateStr,
      customerName: b.name,
      email: b.email || null,
      serviceType: b.title,
      calBookingUid: b.calBookingUid || null,
      needsEmail: !b.email,
    }))

    return res.status(200).json({
      drafts,
      needsInvoice,
      dateRange: { start: startISO, end: endISO },
    })
  } catch (err) {
    console.error('Error in pending-invoices:', err)
    return res.status(500).json({ error: err.message })
  }
}
