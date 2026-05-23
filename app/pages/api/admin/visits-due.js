const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { Client } = require('@hubspot/api-client')
const { getPastBookingsForEmail, getUpcomingBookingsForEmail } = require('../../../lib/gcal')

/**
 * GET /api/admin/visits-due?days=7
 * Returns the list of customers whose CO2 tank is projected to run out in the
 * next `days` (default 7). Based on:
 *   - HubSpot system_type (or first item if JSON-array multi-system)
 *   - has_timer flag
 *   - Most recent appointment in Google Calendar
 *
 * Lifetime by system:
 *   Mosqitter Grand:     28 days
 *   Biogents-CO2 +timer: 28 days
 *   Biogents-CO2 no tmr: 20 days
 *
 * Conservative "due for next service" view — admin manually books each.
 * No auto-create, no SMS. Pure informational digest.
 */
const LIFETIME = (systemType, hasTimer) => {
  if (systemType === 'Biogents-CO2' && !hasTimer) return 20
  return 28
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const horizonDays = Math.max(1, Math.min(30, parseInt(req.query.days, 10) || 7))
  const now = Date.now()
  const horizonMs = horizonDays * 86400 * 1000

  try {
    const hs = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN })
    // Pull contacts with system info (limit 200 — enough for current customer base)
    const page = await hs.crm.contacts.basicApi.getPage(
      200, undefined,
      ['email', 'firstname', 'lastname', 'phone', 'system_type', 'has_timer', 'trap_count']
    )

    const candidates = (page.results || [])
      .map((c) => {
        const p = c.properties || {}
        const email = (p.email || '').toLowerCase()
        if (!email) return null
        let systemType = p.system_type || null
        let hasTimer = p.has_timer === 'true'
        if (systemType && systemType.startsWith('[')) {
          try {
            const arr = JSON.parse(systemType)
            systemType = arr[0]?.type || null
            hasTimer = !!arr[0]?.hasTimer
          } catch {}
        }
        if (!systemType) return null
        const lifetime = LIFETIME(systemType, hasTimer)
        return {
          email,
          name: [p.firstname, p.lastname].filter(Boolean).join(' ') || email,
          phone: p.phone || null,
          systemType,
          hasTimer,
          lifetime,
        }
      })
      .filter(Boolean)

    // For each candidate, look up most recent past visit + upcoming
    const due = []
    for (const cand of candidates) {
      const [past, upcoming] = await Promise.all([
        getPastBookingsForEmail(cand.email, 1).catch(() => []),
        getUpcomingBookingsForEmail(cand.email, 1).catch(() => []),
      ])
      const lastVisit = past[0]?.startTime ? new Date(past[0].startTime) : null
      if (!lastVisit) continue
      const dueDate = lastVisit.getTime() + cand.lifetime * 86400 * 1000
      const daysUntilDue = Math.round((dueDate - now) / 86400000)
      // Skip if they already have an upcoming visit booked
      if (upcoming.length > 0) continue
      // Include if due within the horizon (positive = future, negative = overdue)
      if (dueDate - now > horizonMs) continue
      due.push({
        ...cand,
        lastVisit: lastVisit.toISOString(),
        dueDate: new Date(dueDate).toISOString(),
        daysUntilDue,
        overdue: daysUntilDue < 0,
      })
    }

    // Sort: overdue first (most overdue), then soonest due
    due.sort((a, b) => a.daysUntilDue - b.daysUntilDue)

    return res.status(200).json({ horizonDays, count: due.length, due })
  } catch (e) {
    console.error('visits-due error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
