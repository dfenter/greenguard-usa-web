// Aggregate Google Calendar bookings for a given year. Returns:
//   - monthly[12] = count of scheduled events per month
//   - byType[]    = { type, qty, totalHours, unitCost, total } sorted desc by qty
// Used by /admin/reports.

const { requireAdmin } = require('../../../lib/auth')
const { getBookingsForDateRange } = require('../../../lib/gcal')
const { slugFromTitle, SKU_PRICES, prefillFromBooking, normalizeEventTitle } = require('../../../lib/sku-engine')

// Map an event-type slug → its primary SKU + display label. Used to attribute
// unit cost on the report. Falls back to the title as-is for unknown types.
const SLUG_DISPLAY = {
  'biogents-co2-1':           { label: 'Biogents CO2 Service - 1 Trap', sku: 'BG1' },
  'biogents-co2-2':           { label: 'Biogents CO2 Service - 2 Traps', sku: 'BG2' },
  'biogents-co2-3':           { label: 'Biogents CO2 Service - 3 Traps', sku: 'BG3' },
  'tank-exchange-1':          { label: 'CO2 Tank Exchange - 1 Tank',  sku: 'TANK-REFILL', mult: 1 },
  'tank-exchange-2':          { label: 'CO2 Tank Exchange - 2 Tanks', sku: 'TANK-REFILL', mult: 2 },
  'tank-exchange-3':          { label: 'CO2 Tank Exchange - 3 Tanks', sku: 'TANK-REFILL', mult: 3 },
  'tank-exchange-4':          { label: 'CO2 Tank Exchange - 4 Tanks', sku: 'TANK-REFILL', mult: 4 },
  'tank-exchange-5':          { label: 'CO2 Tank Exchange - 5 Tanks', sku: 'TANK-REFILL', mult: 5 },
  'tank-exchange-6':          { label: 'CO2 Tank Exchange - 6 Tanks', sku: 'TANK-REFILL', mult: 6 },
  'tank-exchange-10':         { label: 'CO2 Tank Exchange - 10 Tanks', sku: 'TANK-REFILL', mult: 10 },
  'tank-rental':              { label: '20 Pound CO2 Tank Rental', sku: 'TANK-REFILL' },
  'mosqitter-rental':         { label: 'Mosqitter Grand Rental', sku: 'MQ-RENT' },
  'mosqitter-installation':   { label: 'Mosqitter Grand Installation', sku: 'MQ-INST' },
  'mosqitter-service':        { label: 'Mosqitter Grand Service', sku: 'MQ-SVC' },
  'mosqitter-troubleshoot':   { label: 'Mosqitter Grand Troubleshooting', sku: 'MQ-TSHOOT' },
  'barrier-treatment':        { label: 'GreenGuard Barrier Treatment', sku: 'BARRIER' },
  'property-assessment':      { label: 'Free Property Assessment', sku: 'ASSESS' },
  'tank-refill-check':        { label: 'Tank Refill Check', sku: null },
  'equipment-pickup':         { label: 'Equipment Pickup', sku: null },
}

export default async function handler(req, res) {
  const session = await requireAdmin(req, res)
  if (!session) return

  const year = parseInt(req.query.year || String(new Date().getFullYear()), 10)
  const start = new Date(Date.UTC(year, 0, 1)).toISOString()
  const end   = new Date(Date.UTC(year + 1, 0, 1)).toISOString()

  let bookings = []
  try { bookings = await getBookingsForDateRange(start, end) } catch (e) { return res.status(500).json({ error: e.message }) }

  const monthly = Array(12).fill(0)
  const byType = {}
  let canceledCount = 0
  let noShowCount = 0

  for (const ev of bookings) {
    if (!ev.startTime) continue
    const d = new Date(ev.startTime)
    const m = d.getUTCMonth()
    if (ev.status === 'cancelled') { canceledCount++; continue }
    monthly[m] += 1
    const title = normalizeEventTitle(ev.title || '')
    const slug = slugFromTitle(title)
    const display = SLUG_DISPLAY[slug] || { label: title || 'Unknown', sku: null }
    const unitPrice = display.sku ? (SKU_PRICES[display.sku] || 0) * (display.mult || 1) : 0
    const durMin = ev.endTime && ev.startTime ? (new Date(ev.endTime) - new Date(ev.startTime)) / 60000 : 30
    const hours = durMin / 60
    const key = display.label
    if (!byType[key]) byType[key] = { type: key, qty: 0, totalHours: 0, unitCost: unitPrice, total: 0 }
    byType[key].qty += 1
    byType[key].totalHours += hours
    byType[key].total += unitPrice
  }

  const types = Object.values(byType).sort((a, b) => b.qty - a.qty)
  res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=900')
  return res.status(200).json({
    year,
    monthly,
    canceled: canceledCount,
    noShow: noShowCount,
    types,
    totalAppts: monthly.reduce((s, n) => s + n, 0),
    totalRevenue: types.reduce((s, t) => s + t.total, 0),
  })
}
