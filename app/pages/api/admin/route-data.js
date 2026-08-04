import { requireAdmin } from '../../../lib/auth'
import { getTodaysBookings, getBookingsForDateRange } from '../../../lib/gcal'
import { findContactsByEmails, tanksForCustomer } from '../../../lib/hubspot'
import { tankCountFromTitle } from '../../../lib/tank-count'
import { listAllCustomers } from '../../../lib/stripe'
import { getLatestRoutePlan } from '../../../lib/route-plan'

// Lazy data for /admin/route — moved out of getServerSideProps so the calendar
// shell renders immediately and the plan fills in client-side.
export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return
  if (req.method !== 'GET') return res.status(405).end()
  res.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=60')

  const tz = process.env.CALENDAR_TIMEZONE || 'America/Chicago'
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz })

  const { plan: routePlanLoaded, generatedAt } = await getLatestRoutePlan().catch(() => ({ plan: null, generatedAt: null }))
  let routePlan = routePlanLoaded
  let planGeneratedAt = generatedAt

  const todayInPlan = routePlan?.days?.some((d) => d.date === today)
  let todayBookings = []
  if (!todayInPlan) {
    try {
      todayBookings = await getTodaysBookings()
    } catch {}
  }

  if (!routePlan && todayBookings.length > 0) {
    routePlan = {
      week: `${today} (live)`,
      days: [{
        date: today,
        stops: todayBookings.map((b) => ({
          customer_name: b.title,
          address: b.address || '',
          email: b.email || '',
          scheduled_time: b.startTime,
          duration_min: b.endTime && b.startTime
            ? Math.round((new Date(b.endTime) - new Date(b.startTime)) / 60000)
            : null,
        })),
      }],
      source: 'calendar',
    }
  }

  // Resolve names, tanks, and Cal.com UIDs for all stops
  if (routePlan) {
    const allEmails = [...new Set(
      (routePlan.days || []).flatMap((d) => (d.stops || []).map((s) => s.email).filter(Boolean))
    )]

    const hubspotNameByEmail = {}
    const stripeNameByEmail = {}

    // Pre-compute live-hydration date window — needed before Promise.all so we can
    // fire the GCal call in parallel with Stripe/HubSpot instead of sequentially after.
    const todayMs = new Date(today + 'T00:00:00-06:00').getTime()
    const cutoffMs = todayMs + 8 * 86400 * 1000
    const liveDays = (routePlan.days || []).filter((d) => {
      const dMs = new Date(d.date + 'T00:00:00-06:00').getTime()
      return dMs >= todayMs && dMs < cutoffMs
    })
    const liveWindow = liveDays.length > 0 ? {
      start: new Date(liveDays[0].date + 'T00:00:00-06:00').toISOString(),
      end:   new Date(liveDays[liveDays.length - 1].date + 'T23:59:59-06:00').toISOString(),
    } : null

    // Cal.com API key only has event-type scope — getBookingsForEmail always returns [].
    let liveByKey = new Map()

    await Promise.all([
      listAllCustomers().then((cs) => cs.forEach((c) => {
        if (c.email && c.name) stripeNameByEmail[c.email.toLowerCase()] = c.name
      })).catch(() => {}),
      findContactsByEmails(allEmails).then((m) => {
        for (const [email, c] of m.entries()) {
          const full = [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' ')
          if (full) hubspotNameByEmail[email] = full
          const tanks = tanksForCustomer(c.properties) || null
          if (tanks) hubspotNameByEmail[email + '__tanks'] = tanks
        }
      }).catch(() => {}),
      // GCal live-hydration fired in parallel — eliminates one sequential round-trip
      liveWindow
        ? getBookingsForDateRange(liveWindow.start, liveWindow.end)
            .then((bookings) => {
              for (const b of bookings) {
                if (!b.dateStr || !b.email) continue
                liveByKey.set(`${b.dateStr}|${b.email.toLowerCase()}`, b)
              }
            }).catch(() => {})
        : Promise.resolve(),
    ])

    routePlan = {
      ...routePlan,
      days: (routePlan.days || []).map((day) => ({
        ...day,
        stops: (day.stops || []).map((stop) => {
          const key = stop.email?.toLowerCase()
          const resolvedName = hubspotNameByEmail[key] || stripeNameByEmail[key] || stop.customer_name || stop.name
          // Same fallback chain as lib/tank-count.js: HubSpot count, else the
          // GCal/route-plan service title.
          const tanks = hubspotNameByEmail[key + '__tanks'] ||
            tankCountFromTitle(stop.service_type || stop.serviceType || stop.title) || null

          // Apply live GCal time if available
          const liveEntry = key ? liveByKey.get(`${day.date}|${key}`) : null
          const scheduledTime = (liveEntry?.startTime && liveEntry.startTime !== stop.scheduled_time)
            ? liveEntry.startTime : stop.scheduled_time
          const hydratedFromGcal = !!(liveEntry?.startTime && liveEntry.startTime !== stop.scheduled_time)

          return {
            ...stop,
            customer_name: resolvedName,
            tanks,
            cal_booking_uid: stop.cal_booking_uid || null,
            cal_booking_id: stop.cal_booking_id || null,
            scheduled_time: scheduledTime,
            ...(hydratedFromGcal && { hydrated_from_gcal: true }),
          }
        }),
      })),
    }
  }

  res.status(200).json({ routePlan, today, planGeneratedAt })
}
