const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { listAllDraftInvoices, stripe } = require('../../../lib/stripe')
const { getBookingsForDateRange, tzDayBoundsISO } = require('../../../lib/gcal')
const { SKU_PRICES } = require('../../../lib/sku-engine')
const { q } = require('../../../lib/db')

// Window for "appointments without invoices" — how many days back to scan.
const LOOKBACK_DAYS = 21

// Returns start-of-day ISO for `days` ago in the configured timezone.
function getLookbackStart(tz, days) {
  const past = new Date()
  past.setDate(past.getDate() - days)
  const pastStr = past.toLocaleDateString('en-CA', { timeZone: tz })
  // DST-correct start-of-day (tzDayBoundsISO handles the CST/CDT offset).
  return tzDayBoundsISO(pastStr, tz).start
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const tz = process.env.CALENDAR_TIMEZONE || 'America/Chicago'
  const startISO = getLookbackStart(tz, LOOKBACK_DAYS)
  const endISO = new Date().toISOString()

  try {
    // Fetch drafts AND open/paid invoices (covering set) to avoid double-billing
    const [rawDrafts, gcalBookings, allRecentInvoices, dismissedRows] = await Promise.all([
      listAllDraftInvoices(),
      getBookingsForDateRange(startISO, endISO),
      stripe.invoices.list({ limit: 100, status: 'open' }).then(r => r.data).catch(() => []),
      q(`SELECT cal_booking_uid, customer_email, customer_name, service_date
         FROM dismissed_appointments WHERE service_date >= $1`,
        [startISO.slice(0, 10)]).then(r => r.rows).catch(() => []),
    ])

    // Also fetch recently paid invoices to mark those appointments as covered
    const paidInvoices = await stripe.invoices.list({ limit: 100, status: 'paid' }).then(r => r.data).catch(() => [])

    const allInvoicesForCover = [...rawDrafts, ...allRecentInvoices, ...paidInvoices]

    const drafts = rawDrafts.map(inv => ({
      id: inv.id,
      customerId: typeof inv.customer === 'object' ? inv.customer?.id : inv.customer,
      customerName: inv.customer?.name || '',
      customerEmail: inv.customer?.email || inv.customer_email || '',
      amountDue: inv.amount_due,
      serviceDate: inv.metadata?.service_date || '',
      lineCount: inv.lines?.data?.length || 0,
      items: (inv.lines?.data || []).map(l => ({
        id: l.id,
        description: l.description || '',
        // fmt$ in the UI expects cents — pass raw, don't pre-divide.
        amount: l.amount || 0,
      })),
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

    // Admin-dismissed appointments (marked "no invoice needed")
    const dismissedByUid = new Set()
    const dismissedByEmailDate = new Set()
    const dismissedByNameDate = new Set()
    dismissedRows.forEach(d => {
      if (d.cal_booking_uid) dismissedByUid.add(d.cal_booking_uid)
      if (d.customer_email) dismissedByEmailDate.add(`${d.customer_email.toLowerCase()}|${d.service_date}`)
      if (d.customer_name) dismissedByNameDate.add(`${d.customer_name.toLowerCase()}|${d.service_date}`)
    })

    const isDismissed = b =>
      (b.calBookingUid && dismissedByUid.has(b.calBookingUid)) ||
      (b.email && dismissedByEmailDate.has(`${b.email.toLowerCase()}|${b.dateStr}`)) ||
      (b.name && dismissedByNameDate.has(`${b.name.toLowerCase()}|${b.dateStr}`))

    const needsInvoice = gcalBookings.filter(b => {
      if (!b.dateStr) return false
      if (isDismissed(b)) return false
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

    const skuList = Object.entries(SKU_PRICES)
      .map(([sku, price]) => ({ sku, price }))
      .sort((a, b) => a.sku.localeCompare(b.sku))

    return res.status(200).json({
      drafts,
      needsInvoice,
      skuList,
      dateRange: { start: startISO, end: endISO },
    })
  } catch (err) {
    console.error('Error in pending-invoices:', err)
    return res.status(500).json({ error: err.message })
  }
}
