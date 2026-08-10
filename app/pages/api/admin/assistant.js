// POST /api/admin/assistant
// Body: { message, history: [{role, content}] }
//
// Admin/tech assistant powered by Claude with tool-calling. Read tools (route,
// customer lookup, tank inventory) plus one low-risk action (send "on my way"
// SMS). Mutating operations like booking/cancelling are intentionally NOT
// exposed yet — those stay in the UI with explicit confirmation.

const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { getTodaysBookings, getBookingsForDate } = require('../../../lib/gcal')
const { findContactByEmail, findContactsByNames, tanksForCustomer, addNote, getContactNotes, upsertContact } = require('../../../lib/hubspot')
const { invalidate } = require('../../../lib/cache')
const { buildTankCalendarData } = require('../../../lib/tank-data')
const { sendSms } = require('../../../lib/sms')
const { runAssistant } = require('../../../lib/assistant')
const { tryLocalChat, STARTED_BUT_FAILED_REPLY } = require('../../../lib/chat-local')

const TZ = process.env.CALENDAR_TIMEZONE || 'America/Chicago'

// The local (Mac daemon) path can take up to ~52s; default lambda cap is lower.
export const config = { maxDuration: 60 }

const SYSTEM = `You are the GreenGuard USA operations assistant for the owner and field tech. Be terse and direct: answer the question, surface the number, name the next stop. No marketing language, no emojis, no em dashes.

You have tools to read today's route, look up a customer, check tank inventory, send a customer an "on my way" SMS, and save notes. Use them rather than guessing. When you send an SMS, confirm plainly who it went to. For anything you cannot do (booking, cancelling, invoicing, refunds), tell the user which admin page handles it (Rounds, Calendar, Invoice) instead of pretending to do it.

Notes: when the user tells you something worth keeping (a day log, a reminder, a customer detail like a gate code, a dog, a broken trap, a follow-up), save it WITHOUT being asked to "add a note". If it is about a specific customer, use add_customer_note with their email (look them up first if you only have a name). Otherwise use add_tech_note for the day log. Confirm in a few words what you saved and where.

Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ })}.`

function fmtStop(b) {
  return {
    name: b.customerName || b.title || 'Customer',
    time: b.startTime ? new Date(b.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }) : null,
    service: b.title || null,
    address: b.address || null,
    email: b.email || null,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { message, history = [] } = req.body || {}
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message required' })
  if (message.length > 2000) return res.status(400).json({ error: 'message too long' })

  // Local-first: the Mac chat daemon is the FULL admin assistant (book,
  // reschedule, cancel, invoices). This API fallback stays read-only + SMS,
  // so mutations only ever run through the Mac's guarded tool set.
  const local = await tryLocalChat({ audience: 'admin', email: session.email, message, history })
  if (local) {
    if (!local.ok) return res.status(200).json({ reply: STARTED_BUT_FAILED_REPLY, actions: [] })
    return res.status(200).json({ reply: local.reply, actions: local.actions })
  }

  const tools = [
    {
      name: 'get_todays_route',
      description: "Get today's scheduled stops (name, time, service, address, tank count).",
      input_schema: { type: 'object', properties: {} },
      run: async () => {
        const bookings = await getTodaysBookings().catch(() => [])
        return { count: bookings.length, stops: bookings.map(fmtStop) }
      },
    },
    {
      name: 'get_route_for_date',
      description: 'Get scheduled stops for a specific date (YYYY-MM-DD).',
      input_schema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['date'] },
      run: async ({ date }) => {
        const bookings = await getBookingsForDate(date).catch(() => [])
        return { date, count: bookings.length, stops: bookings.map(fmtStop) }
      },
    },
    {
      name: 'lookup_customer',
      description: 'Look up a customer by email (preferred) or full name. Returns contact + system details.',
      input_schema: { type: 'object', properties: { email: { type: 'string' }, name: { type: 'string' } } },
      run: async ({ email, name }) => {
        let c = null
        if (email) c = await findContactByEmail(email).catch(() => null)
        if (!c && name) {
          const parts = name.trim().split(/\s+/)
          const map = await findContactsByNames([{ name, first: parts[0], last: parts.slice(1).join(' ') }]).catch(() => new Map())
          c = map.get(name.trim().toLowerCase()) || null
        }
        if (!c) return { found: false }
        const p = c.properties || {}
        return {
          found: true,
          name: [p.firstname, p.lastname].filter(Boolean).join(' '),
          email: p.email, phone: p.phone, address: p.address,
          systemType: p.system_type, planType: p.plan_type,
          tanks: tanksForCustomer(p), customerStatus: p.customer_status,
          newCustomer: p.first_appointment === 'true',
        }
      },
    },
    {
      name: 'get_tank_inventory',
      description: 'Current CO2 tank stock at the depot, tanks needed this week, and expected delivery.',
      input_schema: { type: 'object', properties: {} },
      run: async () => {
        const t = await buildTankCalendarData(TZ).catch(() => null)
        if (!t) return { error: 'inventory unavailable' }
        return { currentStock: t.currentStock, tanksNeededThisWeek: t.weeklyTankTotal, expectedDelivery: t.expectedDelivery }
      },
    },
    {
      name: 'add_tech_note',
      description: "Save a note to the tech's day log (general observations, reminders, anything not tied to one customer). Shown to the owner and tech.",
      input_schema: { type: 'object', properties: { body: { type: 'string', description: 'The note text.' } }, required: ['body'] },
      run: async ({ body }) => {
        const text = (body || '').trim()
        if (!text) return { saved: false, error: 'empty note' }
        let contact = await findContactByEmail('bruce@greenguard-usa.com').catch(() => null)
        if (!contact?.id) contact = await upsertContact({ email: 'bruce@greenguard-usa.com', name: 'Bruce (Tech)' }).catch(() => null)
        if (!contact?.id) return { saved: false, error: 'tech contact unavailable' }
        await addNote(contact.id, `[TECH-NOTE] ${text}`)
        return { saved: true, where: 'tech day log' }
      },
    },
    {
      name: 'add_customer_note',
      description: 'Save a note on a specific customer (gate codes, pets, access issues, follow-ups, service details). Appears on their profile and rounds cards.',
      input_schema: {
        type: 'object',
        properties: {
          email: { type: 'string', description: 'Customer email. Look the customer up first if you only have a name.' },
          body: { type: 'string', description: 'The note text.' },
        },
        required: ['email', 'body'],
      },
      run: async ({ email, body }) => {
        const text = (body || '').trim()
        if (!text) return { saved: false, error: 'empty note' }
        const c = await findContactByEmail(email).catch(() => null)
        if (!c?.id) return { saved: false, error: `no customer found for ${email}` }
        await addNote(c.id, `[ADMIN-NOTE ${session.email} ${new Date().toISOString()}] ${text}`)
        await invalidate(`hs:notes:${c.id}`).catch(() => {})
        return { saved: true, customer: [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' ') || email }
      },
    },
    {
      name: 'get_customer_notes',
      description: 'Read the most recent notes on a customer by email.',
      input_schema: { type: 'object', properties: { email: { type: 'string' } }, required: ['email'] },
      run: async ({ email }) => {
        const c = await findContactByEmail(email).catch(() => null)
        if (!c?.id) return { found: false }
        const raw = await getContactNotes(c.id, 10).catch(() => [])
        return { found: true, notes: raw.map((n) => ({ body: n.body, timestamp: n.timestamp || null })) }
      },
    },
    {
      name: 'send_on_my_way_sms',
      description: 'Text a customer that the tech is on the way. Provide their email (phone is looked up) or a phone number, and optional ETA minutes.',
      input_schema: {
        type: 'object',
        properties: {
          email: { type: 'string', description: 'Customer email (phone resolved from HubSpot).' },
          phone: { type: 'string' },
          name: { type: 'string' },
          etaMinutes: { type: 'number' },
        },
      },
      run: async ({ email, phone, name, etaMinutes }) => {
        let to = phone
        if (!to && email) {
          const c = await findContactByEmail(email).catch(() => null)
          to = c?.properties?.phone || null
          if (!name) name = [c?.properties?.firstname, c?.properties?.lastname].filter(Boolean).join(' ')
        }
        if (!to) return { sent: false, error: 'No phone number on file for that customer.' }
        const first = (name || '').split(' ')[0] || 'there'
        const eta = etaMinutes ? `~${etaMinutes} min` : 'shortly'
        const body = `Hi ${first}, this is GreenGuard USA — your tech is on the way (${eta}). Please ensure backyard access is clear. Reply STOP to opt out. — GreenGuard`
        const r = await sendSms({ to, body })
        return r.ok ? { sent: true, to } : { sent: false, error: r.error || 'SMS failed' }
      },
    },
  ]

  try {
    const { reply, actions } = await runAssistant({ system: SYSTEM, history, userMessage: message, tools, maxTokens: 900 })
    return res.status(200).json({ reply, actions })
  } catch (e) {
    console.error('admin assistant error:', e.message)
    return res.status(500).json({ error: 'Assistant unavailable right now.' })
  }
}
