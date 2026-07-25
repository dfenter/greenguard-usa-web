import { requireAdmin } from '../../../lib/auth'
import { getTodaysBookings, getBookingsForDateRange, tzDayBoundsISO } from '../../../lib/gcal'
import { findContactsByEmails, getClientNotes, tanksForCustomer, trapsForCustomer } from '../../../lib/hubspot'
import { buildTankCalendarData } from '../../../lib/tank-data'

// Lazy data for /admin/tech — moved out of getServerSideProps so the page shell
// renders immediately and today's route fills in client-side.
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

  const [todayStops, tomorrowStops, tankData] = await Promise.all([
    getTodaysBookings().catch(() => []),
    getBookingsForDateRange(tomorrowStart, tomorrowEnd).catch(() => []),
    buildTankCalendarData(tz).catch(() => null),
  ])

  // Resolve customer name/phone/tanks from HubSpot for all stops (batch fetch).
  const allEmails = [...new Set([...todayStops, ...tomorrowStops].map((s) => s.email).filter(Boolean))]
  const contactMap = {}
  const hsContacts = await findContactsByEmails(allEmails).catch(() => new Map())
  for (const [email, c] of hsContacts.entries()) {
    contactMap[email] = {
      name: [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' '),
      phone: c.properties?.phone || '',
      address: c.properties?.address || '',
      tanks: tanksForCustomer(c.properties) || null,
      traps: trapsForCustomer(c.properties) || null,
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
    const resolvedName = info.name || s.customerName || s.name || s.title || ''
    const resolvedPhone = info.phone || s.phone || ''
    return {
      gcalEventId: s.id || null,
      title: resolvedName,
      serviceType: s.title || '',
      startTime: s.startTime || null,
      endTime: s.endTime || null,
      address: s.address || info.address || '',
      email: s.email || '',
      phone: resolvedPhone,
      tanks: info.tanks || null,
      traps: info.traps || null,
      firstAppointment: info.firstAppointment || false,
      rescheduleUrl: s.rescheduleUrl || null,
      appointmentNotes: s.appointmentNotes || null,
      clientNotes: info.clientNotes || [],
    }
  }

  res.status(200).json({
    adminEmail: admin.email,
    todayStr,
    tomorrowStr,
    todayStops: todayStops.map(serializeStop),
    tomorrowStops: tomorrowStops.map(serializeStop),
    mapsKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    fullTanksOnHand: tankData?.currentStock ?? null,
    tanksNeededThisWeek: tankData?.weeklyTankTotal ?? null,
    expectedDeliveryThisWeek: tankData?.expectedDelivery ?? null,
    tankData: tankData ? {
      tankCalendar: tankData.tankCalendar,
      scheduleByDate: tankData.scheduleByDate,
      today: tankData.today,
      currentStock: tankData.currentStock,
      expectedDelivery: tankData.expectedDelivery,
    } : null,
  })
}
