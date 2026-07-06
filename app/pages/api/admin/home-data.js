import { requireAdmin } from '../../../lib/auth'
import { getTodaysBookings, getBookingsForDateRange, tzDayBoundsISO } from '../../../lib/gcal'
import { findContactsByEmails, getAllContacts, tanksForCustomer, getClientNotes } from '../../../lib/hubspot'
import { listAllActiveSubscriptions, listOpenInvoices, getBalance, listAllCustomers } from '../../../lib/stripe'
import { buildTankCalendarData } from '../../../lib/tank-data'

// Lazy data for /admin/home — moved out of getServerSideProps so the dashboard
// shell paints immediately and the KPIs/stops/map fill in client-side.
export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return
  if (req.method !== 'GET') return res.status(405).end()
  res.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=60')

  const tz = process.env.CALENDAR_TIMEZONE || 'America/Chicago'
  const now = new Date()
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz })

  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toLocaleDateString('en-CA', { timeZone: tz })
  // DST-correct day bounds (was a hardcoded -05:00, wrong in CST Nov–Mar).
  const { start: tomorrowStart, end: tomorrowEnd } = tzDayBoundsISO(tomorrowStr, tz)

  const [todayStops, tomorrowStops, activeSubs, openInvoices, balance, tankData, allCustomers, allContacts] = await Promise.all([
    getTodaysBookings().catch(() => []),
    getBookingsForDateRange(tomorrowStart, tomorrowEnd).catch(() => []),
    listAllActiveSubscriptions().catch(() => []),
    listOpenInvoices().catch(() => []),
    getBalance().catch(() => null),
    buildTankCalendarData(tz).catch(() => null),
    listAllCustomers().catch(() => []),
    getAllContacts(500).catch(() => []),
  ])

  // Subscription status by email (for marker color)
  const statusByEmail = new Map()
  for (const c of allCustomers) {
    const email = (c.email || '').toLowerCase()
    if (!email) continue
    const subs = c.subscriptions?.data || []
    const activeSub = subs.find((s) => s.status === 'active') || subs[0] || null
    statusByEmail.set(email, activeSub?.status || 'inactive')
  }

  // Addresses live in HubSpot; merge subscription status from Stripe.
  const customerMapData = []
  for (const contact of allContacts) {
    const p = contact.properties || {}
    if (!p.address) continue
    const email = (p.email || '').toLowerCase()
    customerMapData.push({
      id: contact.id,
      name: [p.firstname, p.lastname].filter(Boolean).join(' ') || p.email || 'Unknown',
      email: p.email || '',
      address: p.address,
      status: statusByEmail.get(email) || 'inactive',
    })
  }

  // Resolve customer name + phone from HubSpot for all stops
  const allEmails = [...new Set([...todayStops, ...tomorrowStops].map((s) => s.email).filter(Boolean))]
  const contactMap = {}
  const hsContacts = await findContactsByEmails(allEmails).catch(() => new Map())
  for (const [email, c] of hsContacts.entries()) {
    contactMap[email] = {
      name: [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' '),
      phone: c.properties?.phone || '',
      address: c.properties?.address || '',
      tanks: tanksForCustomer(c.properties) || null,
      firstAppointment: c.properties?.first_appointment === 'true',
      _contactId: c.id,
    }
  }
  await Promise.all(Object.entries(contactMap).map(async ([email, info]) => {
    if (!info._contactId) return
    const client = await getClientNotes(info._contactId)
    if (client.length) contactMap[email].clientNotes = client
  }))

  function serializeStop(s) {
    const info = contactMap[s.email?.toLowerCase()] || {}
    return {
      gcalEventId: s.id || null,
      title: info.name || s.customerName || s.name || '',
      serviceType: s.title || '',
      startTime: s.startTime || null,
      endTime: s.endTime || null,
      address: s.address || info.address || '',
      email: s.email || '',
      phone: info.phone || s.phone || '',
      tanks: info.tanks || null,
      firstAppointment: info.firstAppointment || false,
      appointmentNotes: s.appointmentNotes || null,
      clientNotes: info.clientNotes || [],
    }
  }

  const mrr = activeSubs.reduce((sum, sub) =>
    sum + sub.items.data.reduce((s, i) => s + (i.price?.unit_amount || 0), 0), 0) / 100

  const openTotal = openInvoices.reduce((s, inv) => s + (inv.amount_due || 0), 0) / 100

  res.status(200).json({
    todayStr,
    tomorrowStr,
    todayStops: todayStops.map(serializeStop),
    tomorrowStops: tomorrowStops.map(serializeStop),
    mrr: Math.round(mrr * 100) / 100,
    activeCount: activeSubs.length,
    openInvoiceCount: openInvoices.length,
    openInvoiceTotal: Math.round(openTotal * 100) / 100,
    openInvoiceList: openInvoices.slice(0, 5).map((inv) => ({
      id: inv.id,
      email: inv.customer_email || '',
      amount: inv.amount_due / 100,
      hostedUrl: inv.hosted_invoice_url || null,
    })),
    balanceAvailable: balance ? balance.available / 100 : null,
    fullTanksOnHand: tankData?.currentStock ?? null,
    tanksNeededThisWeek: tankData?.weeklyTankTotal ?? null,
    expectedDeliveryThisWeek: tankData?.expectedDelivery ?? null,
    tankData: tankData ? {
      tankCalendar: tankData.tankCalendar,
      scheduleByDate: tankData.scheduleByDate,
      expectedDelivery: tankData.expectedDelivery,
      currentStock: tankData.currentStock,
      today: tankData.today,
    } : null,
    customerMapData,
    mapsKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  })
}
