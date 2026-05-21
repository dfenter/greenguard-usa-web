const { getSessionFromRequest } = require('../../../lib/auth')
const { addNote, findContactByEmail, upsertContact, getNotesForContact } = require('../../../lib/hubspot')
const { getBookingsForWeek } = require('../../../lib/gcal')
const { resolveByTitle, normalizeEventTitle } = require('../../../lib/sku-engine')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'
const INVENTORY_EMAIL = 'inventory@greenguard-usa.com'
const SAFETY_STOCK = 3
const PROJECTION_DAYS = 56

async function getOrCreateInventoryContact() {
  let contact = await findContactByEmail(INVENTORY_EMAIL).catch(() => null)
  if (!contact) {
    await upsertContact({ email: INVENTORY_EMAIL, name: 'GreenGuard Inventory Tracker', metadata: {} })
    contact = await findContactByEmail(INVENTORY_EMAIL)
  }
  return contact
}

function toISODate(date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date, n) {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + n)
  return d
}

// Returns the Wednesday of the week containing date (UTC)
function getWednesdayOf(date) {
  const d = new Date(date)
  const day = d.getUTCDay() // 0=Sun, 3=Wed
  const diff = (3 - day + 7) % 7
  d.setUTCDate(d.getUTCDate() + diff)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

// Returns the Wednesday >= today (i.e. this Wednesday or next if today is past Wed)
function getNextOrCurrentWednesday(from) {
  const d = new Date(from)
  d.setUTCHours(0, 0, 0, 0)
  const day = d.getUTCDay()
  const diff = (3 - day + 7) % 7
  d.setUTCDate(d.getUTCDate() + diff)
  return d
}

function parseTankNote(noteBody, ts) {
  if (!noteBody) return null
  const lines = noteBody.split('\n')
  const obj = {}
  for (const line of lines) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    obj[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }

  if (obj.Type === 'TankExchange') {
    return {
      type: 'exchange',
      week: obj.Week || '',
      emptiesPickedUp: parseInt(obj.EmptiesPickedUp) || 0,
      fullsReceived: parseInt(obj.FullsReceived) || 0,
      damagedTanks: parseInt(obj.DamagedTanks) || 0,
      notes: obj.Notes || '',
      ts,
    }
  }

  if (obj.Type === 'TankOverride') {
    return {
      type: 'override',
      week: obj.Week || '',
      fullTanksActual: parseInt(obj.FullTanksActual) || 0,
      notes: obj.Notes || '',
      ts,
    }
  }

  if (obj.Date) {
    return {
      type: 'inventory',
      fullTanks: parseInt(obj['Full CO₂ tanks']) || 0,
      emptyTanks: parseInt(obj['Empty CO₂ tanks']) || 0,
      damagedTanks: parseInt(obj['Damaged CO₂ tanks']) || 0,
      ts,
    }
  }

  return null
}

async function computeProjection(rawNotes) {
  const parsed = rawNotes
    .map((n) => parseTankNote(n.properties?.hs_note_body, n.properties?.hs_timestamp))
    .filter(Boolean)
    .sort((a, b) => new Date(a.ts) - new Date(b.ts))

  const inventoryNotes = parsed.filter((n) => n.type === 'inventory')
  const exchangeRecords = parsed.filter((n) => n.type === 'exchange')
  const overrideRecords = parsed.filter((n) => n.type === 'override')

  const latest = inventoryNotes[inventoryNotes.length - 1] ?? { fullTanks: 0, emptyTanks: 0, damagedTanks: 0 }
  const currentFull = latest.fullTanks
  const currentEmpty = latest.emptyTanks

  const damagedTotal =
    exchangeRecords.reduce((s, r) => s + r.damagedTanks, 0) +
    inventoryNotes.reduce((s, r) => s + (r.damagedTanks || 0), 0)

  const latestExchange = exchangeRecords[exchangeRecords.length - 1]
  const nextDelivery = latestExchange?.emptiesPickedUp ?? 0

  const overridesByWed = {}
  overrideRecords.forEach((r) => { overridesByWed[r.week] = r.fullTanksActual })

  const exchangeByWed = {}
  exchangeRecords.forEach((r) => { exchangeByWed[r.week] = r })

  // Build daily booking map: date string → { appts, tanksNeeded }
  const now = new Date()
  const startDate = addDays(now, 1)
  startDate.setUTCHours(0, 0, 0, 0)
  const endDate = addDays(startDate, PROJECTION_DAYS)

  let gcalBookings = []
  try {
    gcalBookings = await getBookingsForWeek(startDate.toISOString(), endDate.toISOString())
  } catch {
    // Cal.com / GCal not configured — projection shows 0 appointments
  }

  const dailyMap = {}
  for (const booking of gcalBookings) {
    const dateStr = (booking.startTime || '').slice(0, 10)
    if (!dateStr) continue
    const resolved = resolveByTitle(normalizeEventTitle(booking.title || ''))
    const tankCount = resolved?.tankCount || 0
    if (!dailyMap[dateStr]) dailyMap[dateStr] = { appts: 0, tanksNeeded: 0 }
    dailyMap[dateStr].appts += 1
    dailyMap[dateStr].tanksNeeded += tankCount
  }

  // Project day by day
  const days = []
  let fullsRunning = currentFull
  let nextWedDelivery = nextDelivery

  for (let d = 0; d < PROJECTION_DAYS; d++) {
    const date = addDays(startDate, d)
    const dateStr = toISODate(date)
    const isWed = date.getUTCDay() === 3
    const wedOfWeek = toISODate(getWednesdayOf(date))

    let delivery = 0
    if (isWed) {
      delivery = nextWedDelivery
      fullsRunning += delivery
      if (overridesByWed[dateStr] !== undefined) {
        fullsRunning = overridesByWed[dateStr]
      }
    }

    const dayData = dailyMap[dateStr] || { appts: 0, tanksNeeded: 0 }
    const { appts, tanksNeeded } = dayData
    const fullsAvailable = fullsRunning
    const fullsEnd = fullsRunning - tanksNeeded
    const deficit = Math.max(0, tanksNeeded - fullsAvailable)

    days.push({
      date: dateStr,
      weekOf: wedOfWeek,
      isWednesday: isWed,
      delivery,
      appointments: appts,
      tanksNeeded,
      fullsAvailable,
      fullsEnd,
      deficit,
      status: deficit > 0 ? 'short' : fullsEnd < SAFETY_STOCK ? 'low' : 'ok',
      isOverridden: isWed && overridesByWed[dateStr] !== undefined,
      logged: isWed && !!exchangeByWed[dateStr],
      loggedData: isWed ? (exchangeByWed[dateStr] || null) : null,
    })

    fullsRunning = fullsEnd

    // At end of each Wednesday, set next delivery = total tanks used in this week
    if (isWed) {
      const weekDays = days.filter((x) => x.weekOf === wedOfWeek)
      const weekTanksUsed = weekDays.reduce((s, x) => s + x.tanksNeeded, 0)
      nextWedDelivery = weekTanksUsed
    }
  }

  // Build weekly summary rows
  const weekMap = {}
  for (const day of days) {
    const w = day.weekOf
    if (!weekMap[w]) {
      weekMap[w] = {
        wednesday: w,
        totalAppts: 0,
        totalTanksNeeded: 0,
        delivery: 0,
        startStock: 0,
        endStock: 0,
        totalDeficit: 0,
        worstStatus: 'ok',
      }
    }
    const wk = weekMap[w]
    wk.totalAppts += day.appointments
    wk.totalTanksNeeded += day.tanksNeeded
    wk.totalDeficit += day.deficit
    if (day.isWednesday) {
      wk.delivery = day.delivery
      wk.startStock = day.fullsAvailable
    }
    wk.endStock = day.fullsEnd
    if (day.status === 'short') wk.worstStatus = 'short'
    else if (day.status === 'low' && wk.worstStatus !== 'short') wk.worstStatus = 'low'
  }
  const weeks = Object.values(weekMap)

  // Build alerts: scan for any short/low days in next 14 days
  const alerts = []
  const cutoffWarn = addDays(now, 7)
  const cutoffError = addDays(now, 14)
  const seen = new Set()
  for (const day of days) {
    if (day.status === 'ok') continue
    const dayDate = new Date(day.date + 'T12:00:00Z')
    if (seen.has(day.weekOf)) continue
    seen.add(day.weekOf)
    const level = dayDate <= cutoffError ? 'error' : 'warn'
    if (day.status === 'short') {
      alerts.push({ level, type: 'shortage', affectedDate: day.date, deficit: day.deficit })
    } else {
      alerts.push({ level, type: 'low', affectedDate: day.date })
    }
  }

  return {
    summary: {
      fullTanks: currentFull,
      emptyTanks: currentEmpty,
      damagedTotal,
      totalPool: currentFull + currentEmpty + damagedTotal,
      nextDelivery,
      nextWednesday: toISODate(getNextOrCurrentWednesday(now)),
    },
    days,
    weeks,
    alerts,
    exchangeHistory: exchangeRecords.slice(-10).reverse(),
  }
}

export default async function handler(req, res) {
  const session = await getSessionFromRequest(req)
  if (!session || session.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const contact = await getOrCreateInventoryContact().catch(() => null)
  if (!contact) return res.status(500).json({ error: 'Inventory contact unavailable' })

  if (req.method === 'GET') {
    try {
      const rawNotes = await getNotesForContact(contact.id, 60)
      const data = await computeProjection(rawNotes)
      return res.status(200).json(data)
    } catch (err) {
      console.error('tank-calendar GET error:', err)
      return res.status(500).json({ error: 'Failed to compute projection' })
    }
  }

  if (req.method === 'POST') {
    const { action, week, notes = '' } = req.body || {}

    if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) {
      return res.status(400).json({ error: 'Invalid week date' })
    }

    try {
      if (action === 'exchange') {
        const emptiesPickedUp = parseInt(req.body.emptiesPickedUp) || 0
        const fullsReceived = parseInt(req.body.fullsReceived) || 0
        const damagedTanks = parseInt(req.body.damagedTanks) || 0
        if (emptiesPickedUp < 0 || fullsReceived < 0 || damagedTanks < 0) {
          return res.status(400).json({ error: 'Counts must be non-negative' })
        }
        const lines = [
          'Type: TankExchange',
          `Week: ${week}`,
          `EmptiesPickedUp: ${emptiesPickedUp}`,
          `FullsReceived: ${fullsReceived}`,
          `DamagedTanks: ${damagedTanks}`,
        ]
        if (notes) lines.push(`Notes: ${notes}`)
        await addNote(contact.id, lines.join('\n'))
        return res.status(200).json({ success: true })
      }

      if (action === 'override') {
        const fullTanksActual = parseInt(req.body.fullTanksActual)
        if (isNaN(fullTanksActual) || fullTanksActual < 0) {
          return res.status(400).json({ error: 'fullTanksActual must be a non-negative integer' })
        }
        const lines = [
          'Type: TankOverride',
          `Week: ${week}`,
          `FullTanksActual: ${fullTanksActual}`,
        ]
        if (notes) lines.push(`Notes: ${notes}`)
        await addNote(contact.id, lines.join('\n'))
        return res.status(200).json({ success: true })
      }

      return res.status(400).json({ error: 'action must be exchange or override' })
    } catch (err) {
      console.error('tank-calendar POST error:', err)
      return res.status(500).json({ error: 'Failed to save record' })
    }
  }

  res.status(405).end()
}
