const { findContactByEmail } = require('./hubspot')
const { getBookingsForDateRange } = require('./gcal')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

/**
 * Builds the data the Tank Calendar needs: scheduled tanks/day, history,
 * tankCalendar map, expectedDelivery, weeklyTankTotal, today.
 * Shared between /admin/inventory (form) and /admin/home (calendar widget).
 */
async function buildTankCalendarData(tz = 'America/Chicago') {
  const now = new Date()
  const today = now.toLocaleDateString('en-CA', { timeZone: tz })

  // Next 60 days of appointments → tanks per day
  const rangeEnd = new Date(now.getTime() + 60 * 86400 * 1000)
  let scheduleByDate = {}
  try {
    const bookings = await getBookingsForDateRange(now.toISOString(), rangeEnd.toISOString())
    const uniqueEmails = [...new Set(bookings.map((b) => b.email).filter(Boolean))]
    const trapCountMap = {}
    await Promise.all(
      uniqueEmails.map(async (email) => {
        try {
          const contact = await findContactByEmail(email)
          trapCountMap[email] = parseInt(contact?.properties?.trap_count || '2', 10) || 2
        } catch { trapCountMap[email] = 2 }
      })
    )
    bookings.forEach(({ dateStr, email }) => {
      const tanks = trapCountMap[email] || 2
      if (!scheduleByDate[dateStr]) scheduleByDate[dateStr] = { tanks: 0, appts: 0 }
      scheduleByDate[dateStr].tanks += tanks
      scheduleByDate[dateStr].appts += 1
    })
  } catch {}

  let history = []
  let tankCalendar = {}
  try {
    const contact = await findContactByEmail(ADMIN_EMAIL)
    if (contact?.id) {
      const assocResp = await fetch(
        `https://api.hubapi.com/crm/v3/objects/contacts/${contact.id}/associations/notes?limit=100`,
        { headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` } }
      )
      if (assocResp.ok) {
        const assocData = await assocResp.json()
        const noteIds = (assocData.results || []).map((r) => r.id).slice(0, 100)
        if (noteIds.length > 0) {
          const batchResp = await fetch('https://api.hubapi.com/crm/v3/objects/notes/batch/read', {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ inputs: noteIds.map((id) => ({ id: String(id) })), properties: ['hs_note_body', 'hs_timestamp'] }),
          })
          if (batchResp.ok) {
            const batchData = await batchResp.json()
            history = (batchData.results || [])
              .filter((n) => n.properties.hs_note_body?.startsWith('[TANK-LOG]'))
              .sort((a, b) => new Date(b.properties.hs_timestamp) - new Date(a.properties.hs_timestamp))
              .slice(0, 30)
              .map((n) => {
                try {
                  const json = JSON.parse(n.properties.hs_note_body.replace('[TANK-LOG]', ''))
                  return { ...json, timestamp: n.properties.hs_timestamp }
                } catch { return null }
              })
              .filter(Boolean)
            history.forEach((entry) => { if (entry.date) tankCalendar[entry.date] = entry })
          }
        }
      }
    }
  } catch {}

  const lastWedLog = history.find((e) => {
    const dow = new Date(e.date + 'T12:00:00').getDay()
    return dow === 3 && e.emptiesPickedUp > 0
  })
  const expectedDelivery = lastWedLog?.emptiesPickedUp || 0

  const todayDate = new Date(today + 'T12:00:00')
  const dayOfWeek = todayDate.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const weekMonday = new Date(todayDate)
  weekMonday.setDate(todayDate.getDate() + mondayOffset)
  const weekSunday = new Date(weekMonday)
  weekSunday.setDate(weekMonday.getDate() + 6)

  let weeklyTankTotal = 0
  for (let d = new Date(weekMonday); d <= weekSunday; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: tz })
    weeklyTankTotal += scheduleByDate[dateStr]?.tanks || 0
  }

  const lastFullEnd = history[0]?.fullEnd != null ? history[0].fullEnd : 0
  const currentStock = lastFullEnd

  return { history, tankCalendar, scheduleByDate, expectedDelivery, weeklyTankTotal, today, currentStock }
}

module.exports = { buildTankCalendarData }
