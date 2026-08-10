#!/usr/bin/env node
// Stdio MCP server exposing GreenGuard portal tools to the local chat daemon's
// `claude -p` runs. Spawned per-request by chat-daemon.js with identity and
// tier fixed in the child environment — the model can never choose them:
//
//   GG_CHAT_AUDIENCE   'customer' | 'admin' — which tool tier to register
//   GG_CHAT_USER_EMAIL authenticated portal user (customer tools are pinned
//                      to this email; admin invoice calls are attributed to it)
//   GG_CHAT_CONTEXT_JSON  optional customer context blob from the portal
//   GG_ACTIONS_FILE    JSONL path; every executed tool is appended so the
//                      daemon can rebuild {actions, escalated} for the portal
//
// Tool implementations reuse app/lib/* directly from the checkout (same trick
// as local-notify-daemon.js). Invoice mutations go through the DEPLOYED portal
// endpoints instead — that code carries the double-billing guards (KV lock,
// UID dedup, idempotency keys, recurring→one-time conversion) and must stay
// the single live implementation.

const fs = require('fs')
const path = require('path')

// launchd/claude spawn with a clean env — load repo env the same way the
// notify daemon does (no dotenv dependency).
function loadEnvFile(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!m) continue
      let v = m[2]
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (process.env[m[1]] === undefined) process.env[m[1]] = v
    }
  } catch {}
}
const APP_DIR = path.resolve(__dirname, '..')
loadEnvFile(path.join(APP_DIR, '.env'))
loadEnvFile(path.join(APP_DIR, '.env.local'))

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { z } = require('zod')

const AUDIENCE = process.env.GG_CHAT_AUDIENCE === 'admin' ? 'admin' : 'customer'
const USER_EMAIL = (process.env.GG_CHAT_USER_EMAIL || '').trim().toLowerCase()
const ACTIONS_FILE = process.env.GG_ACTIONS_FILE || ''
let CONTEXT = {}
try { CONTEXT = JSON.parse(process.env.GG_CHAT_CONTEXT_JSON || '{}') } catch {}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'
const PORTAL_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com').replace(/\/$/, '')
// Bruce + Zeke — the "GreenGuard USA" group thread participants alongside the customer.
const STAFF_PHONES = (process.env.STAFF_PHONES || '5127973348,5127873263').split(',').map((s) => s.trim()).filter(Boolean)

// Tools with side effects. Their invocation is recorded to the actions file
// BEFORE the effect runs, so a process kill mid-mutation still leaves a
// `phase:'started'` marker. The daemon treats any such marker as proof a tool
// ran and refuses the fresh-session retry (finding #1: no double-run).
const MUTATING = new Set([
  'request_service_visit', 'request_reschedule', 'escalate_to_team',
  'send_on_my_way_sms', 'book_appointment', 'reschedule_appointment',
  'cancel_appointment', 'add_appointment_note', 'add_tech_note', 'add_customer_note',
  'create_invoice_for_visit', 'add_invoice_item', 'remove_invoice_line', 'send_invoice',
])

function record(entry) {
  if (!ACTIONS_FILE) return
  try { fs.appendFileSync(ACTIONS_FILE, JSON.stringify(entry) + '\n') } catch {}
}

const server = new McpServer({ name: 'gg', version: '1.0.0' })

// Register a tool whose handler returns a JSON-able object. Errors are
// returned to the model as { error } rather than crashing the run.
function tool(name, description, shape, run) {
  const mutating = MUTATING.has(name)
  server.registerTool(name, { description, inputSchema: shape }, async (input) => {
    if (mutating) record({ name, phase: 'started', input })
    let out
    try {
      out = await run(input || {})
    } catch (e) {
      out = { error: String(e.message || e).slice(0, 300) }
    }
    record({ name, phase: 'ended', input, resultSummary: out?.error ? `error: ${out.error}` : 'ok', ...(out?.__meta || {}) })
    if (out && out.__meta) delete out.__meta
    return { content: [{ type: 'text', text: JSON.stringify(out) }] }
  })
}

// ── Customer tier ────────────────────────────────────────────────────────────
function registerCustomerTools() {
  const { findContactByEmail, addNote } = require('../lib/hubspot')
  const { stripe, getInvoices } = require('../lib/stripe')
  const { sendServiceRequest } = require('../lib/email')
  const { sendSms } = require('../lib/sms')
  const pricing = require('../lib/quote-pricing')
  const { SKU_PRICES } = require('../lib/sku-engine')

  const customerInfo = async () => {
    const c = await findContactByEmail(USER_EMAIL).catch(() => null)
    const p = c?.properties || {}
    return {
      contactId: c?.id || null,
      name: [p.firstname, p.lastname].filter(Boolean).join(' ') || CONTEXT.name || null,
      phone: p.phone || null,
      address: p.address || CONTEXT.address || null,
      systemType: p.system_type || null,
      planType: p.plan_type || null,
      trapCount: p.trap_count || null,
      recurringAddons: p.recurring_addons || null,
      customerStatus: p.customer_status || null,
    }
  }

  tool('get_my_invoices', 'List this customer\'s Stripe invoices (open and recent) with amounts, dates, status, and payment links. Use for any "what do I owe / did my payment go through / send me my invoice" question.', {}, async () => {
    const search = await stripe.customers.search({ query: `email:"${USER_EMAIL.replace(/"/g, '')}"`, limit: 1 })
    const customer = search.data[0]
    if (!customer) return { invoices: [], note: 'No billing record found for this account.' }
    const invs = await getInvoices(customer.id, 10)
    return {
      invoices: invs.map((i) => ({
        status: i.status,
        amountDue: (i.amount_due || 0) / 100,
        amountPaid: (i.amount_paid || 0) / 100,
        created: new Date(i.created * 1000).toISOString().slice(0, 10),
        dueDate: i.due_date ? new Date(i.due_date * 1000).toISOString().slice(0, 10) : null,
        description: (i.lines?.data || []).map((l) => l.description).filter(Boolean).slice(0, 6),
        payLink: i.status === 'open' ? i.hosted_invoice_url : null,
      })),
      openBalance: invs.filter((i) => i.status === 'open').reduce((s, i) => s + i.amount_due, 0) / 100,
    }
  })

  tool('get_my_plan', 'This customer\'s plan, system type, trap count, add-ons, and the standard monthly price for their configuration.', {}, async () => {
    const info = await customerInfo()
    const traps = parseInt(info.trapCount, 10) || null
    return {
      ...info,
      contactId: undefined,
      phone: undefined,
      standardPricing: {
        bgCo2RentalMonthlyByTrapCount: pricing.BG_RENTAL_PRICE,
        starterNonCo2RentalPerTrapMonthly: pricing.STARTER_NONCO2_PER_TRAP,
        bgNonCo2ServicePerTrapMonthly: pricing.BG_NONCO2_PER_TRAP,
        mosqitter: pricing.MQ_PRICE,
        yourTrapCount: traps,
      },
    }
  })

  tool('get_service_pricing', 'Standard GreenGuard pricing catalog: services, products, add-ons, tank exchange. Use to answer any "how much does X cost" question. All prices are one-time or monthly as labeled.', {}, async () => ({
    skuPrices: SKU_PRICES,
    bgCo2RentalMonthlyByTrapCount: pricing.BG_RENTAL_PRICE,
    starterNonCo2RentalPerTrapMonthly: pricing.STARTER_NONCO2_PER_TRAP,
    bgNonCo2ServicePerTrapMonthly: pricing.BG_NONCO2_PER_TRAP,
    bgHookupPerTrap: pricing.BG_HOOKUP_PER_TRAP,
    mosqitter: pricing.MQ_PRICE,
    tankExchange: pricing.TANK_PRICE,
    localServices: pricing.QUOTE_LOCAL_SERVICES,
    serviceAddons: pricing.serviceAddons,
  }))

  tool('request_service_visit', 'Request that the team schedule a service visit / tank swap for this customer. Use when they want someone to come out.', { note: z.string().optional().describe('Optional detail from the customer about what they need.') }, async ({ note }) => {
    const info = await customerInfo()
    await sendServiceRequest(ADMIN_EMAIL, { name: info.name, email: USER_EMAIL, address: info.address, systemType: info.systemType },
      `${info.name || 'A customer'} would like to request a service visit.${note ? ' Note: ' + note : ''}`,
      { subject: `Service Visit Request: ${info.name || USER_EMAIL}`, heading: 'Customer requested a service visit (via assistant)', confirmHeading: 'We received your service visit request and will reach out to schedule a time.' })
    return { sent: true }
  })

  tool('request_reschedule', 'Request that the team reschedule the customer\'s upcoming visit. Use when they want to move their appointment.', { note: z.string().optional().describe('Optional preferred timing or reason.') }, async ({ note }) => {
    const info = await customerInfo()
    const when = CONTEXT.nextVisit?.date ? new Date(CONTEXT.nextVisit.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : null
    await sendServiceRequest(ADMIN_EMAIL, { name: info.name, email: USER_EMAIL, address: info.address, systemType: info.systemType, bookingDate: when },
      `${info.name || 'A customer'} would like to reschedule their upcoming visit${when ? ' on ' + when : ''}.${note ? ' Note: ' + note : ''}`,
      { subject: `Reschedule Request: ${info.name || USER_EMAIL}`, heading: 'Customer wants to reschedule (via assistant)', confirmHeading: 'We received your reschedule request and will reach out to confirm a new time.' })
    return { sent: true }
  })

  tool('escalate_to_team', 'Flag this conversation for a human. Use for cancellations, refunds, billing disputes, complaints, or anything you cannot safely handle. Forwards the question to the GreenGuard team chat.', { reason: z.string().describe('Why this needs a human.'), customer_message: z.string().optional().describe('The customer\'s question, verbatim.') }, async ({ reason, customer_message }) => {
    const info = await customerInfo()
    try {
      if (info.contactId) await addNote(info.contactId, `[CHAT-ESCALATION] ${reason}\n\nCustomer: "${customer_message || ''}"`)
    } catch {}
    // Forward into the customer's "GreenGuard USA" group thread (customer +
    // techs). Goes through the notify daemon's iMessage path via the shared KV
    // queue — that process holds the Messages automation grant. May lag up to
    // 15 min (daemon poll cadence).
    let forwarded = false
    if (info.phone) {
      const to = [info.phone, ...STAFF_PHONES].join(',')
      const first = (info.name || '').split(' ')[0] || 'A customer'
      const body = `GreenGuard portal chat: ${first} asked "${(customer_message || reason).slice(0, 300)}". The team will follow up here.`
      const r = await sendSms({ to, body }).catch(() => ({ ok: false }))
      forwarded = !!r.ok
    }
    return { escalated: true, forwarded, __meta: { escalated: true, escalateReason: reason } }
  })
}

// ── Admin tier ───────────────────────────────────────────────────────────────
function registerAdminTools() {
  const { getTodaysBookings, getBookingsForDate, getUpcomingBookingsForEmail } = require('../lib/gcal')
  const { findContactByEmail, findContactsByNames, tanksForCustomer, addNote, getContactNotes, upsertContact } = require('../lib/hubspot')
  const { invalidate } = require('../lib/cache')
  const { buildTankCalendarData } = require('../lib/tank-data')
  const { sendSms } = require('../lib/sms')
  const { stripe, getInvoices } = require('../lib/stripe')
  const actions = require('../lib/booking-actions')
  const { createSessionToken } = require('../lib/auth')
  const TZ = process.env.CALENDAR_TIMEZONE || 'America/Chicago'

  // Cal.com uid lives in the event's reschedule URL (cal.com/reschedule/UID).
  const calUidOf = (b) => (b.rescheduleUrl || '').match(/reschedule\/([^/?#]+)/)?.[1] || null

  const fmtStop = (b) => ({
    name: b.customerName || b.title || 'Customer',
    time: b.startTime ? new Date(b.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }) : null,
    service: b.title || null,
    address: b.address || null,
    email: b.email || null,
    eventId: b.id || b.gcalEventId || null,
    calBookingUid: calUidOf(b),
  })

  // Authenticated call to the deployed portal (invoice endpoints only). The
  // minted session JWT never enters the model context.
  async function portalPost(pathName, body) {
    const token = await createSessionToken(USER_EMAIL, null)
    const resp = await fetch(`${PORTAL_URL}${pathName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `gg_session=${token}` },
      body: JSON.stringify(body),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) throw new Error(data.error || `portal ${pathName} failed (${resp.status})`)
    return data
  }

  async function stripeCustomerForEmail(email) {
    const search = await stripe.customers.search({ query: `email:"${String(email).trim().toLowerCase().replace(/"/g, '')}"`, limit: 1 })
    return search.data[0] || null
  }

  tool('get_todays_route', "Get today's scheduled stops (name, time, service, address, event id).", {}, async () => {
    const bookings = await getTodaysBookings().catch(() => [])
    return { count: bookings.length, stops: bookings.map(fmtStop) }
  })

  tool('get_route_for_date', 'Get scheduled stops for a specific date (YYYY-MM-DD).', { date: z.string().describe('YYYY-MM-DD') }, async ({ date }) => {
    const bookings = await getBookingsForDate(date).catch(() => [])
    return { date, count: bookings.length, stops: bookings.map(fmtStop) }
  })

  tool('lookup_customer', 'Look up a customer by email (preferred) or full name. Returns contact + system details and their upcoming appointments (with event ids for reschedule/cancel).', { email: z.string().optional(), name: z.string().optional() }, async ({ email, name }) => {
    let c = null
    if (email) c = await findContactByEmail(email).catch(() => null)
    if (!c && name) {
      const parts = name.trim().split(/\s+/)
      const map = await findContactsByNames([{ name, first: parts[0], last: parts.slice(1).join(' ') }]).catch(() => new Map())
      c = map.get(name.trim().toLowerCase()) || null
    }
    if (!c) return { found: false }
    const p = c.properties || {}
    const upcoming = p.email ? await getUpcomingBookingsForEmail(p.email, 3).catch(() => []) : []
    return {
      found: true,
      name: [p.firstname, p.lastname].filter(Boolean).join(' '),
      email: p.email, phone: p.phone, address: p.address,
      systemType: p.system_type, planType: p.plan_type,
      tanks: tanksForCustomer(p), customerStatus: p.customer_status,
      newCustomer: p.first_appointment === 'true',
      upcomingAppointments: upcoming.map((b) => ({
        eventId: b.id, start: b.startTime, service: b.title,
        calBookingUid: calUidOf(b),
      })),
    }
  })

  tool('get_tank_inventory', 'Current CO2 tank stock at the depot, tanks needed this week, and expected delivery.', {}, async () => {
    const t = await buildTankCalendarData(TZ).catch(() => null)
    if (!t) return { error: 'inventory unavailable' }
    return { currentStock: t.currentStock, tanksNeededThisWeek: t.weeklyTankTotal, expectedDelivery: t.expectedDelivery }
  })

  tool('send_on_my_way_sms', 'Text a customer that the tech is on the way. Provide their email (phone is looked up) or a phone number, and optional ETA minutes.', {
    email: z.string().optional().describe('Customer email (phone resolved from HubSpot).'),
    phone: z.string().optional(), name: z.string().optional(), etaMinutes: z.number().optional(),
  }, async ({ email, phone, name, etaMinutes }) => {
    let to = phone
    if (!to && email) {
      const c = await findContactByEmail(email).catch(() => null)
      to = c?.properties?.phone || null
      if (!name) name = [c?.properties?.firstname, c?.properties?.lastname].filter(Boolean).join(' ')
    }
    if (!to) return { sent: false, error: 'No phone number on file for that customer.' }
    const first = (name || '').split(' ')[0] || 'there'
    const eta = etaMinutes ? `~${etaMinutes} min` : 'shortly'
    const body = `Hi ${first}, this is GreenGuard USA. Your tech is on the way (${eta}). Please ensure backyard access is clear. Reply STOP to opt out. - GreenGuard`
    const r = await sendSms({ to, body })
    return r.ok ? { sent: true, to } : { sent: false, error: r.error || 'SMS failed' }
  })

  tool('book_appointment', 'Create a new appointment directly on the calendar (silent, no customer email). Time is Central. Appointments are Mon-Fri, first start 10:00am, last start 5:30pm, on the half hour.', {
    firstName: z.string(), lastName: z.string().optional(), email: z.string(),
    phone: z.string().optional(), address: z.string(),
    startLocal: z.string().describe('Start time in Central Time, format YYYY-MM-DDTHH:mm'),
    serviceTitle: z.string().describe('Service name for the calendar title, e.g. "Trap Maintenance"'),
    notes: z.string().optional(),
  }, async (input) => actions.bookAppointment(input))

  tool('reschedule_appointment', 'Move an existing appointment to a new time (silent, customer is NOT notified). Get eventId/calBookingUid from lookup_customer or the route tools first.', {
    eventId: z.string().optional().describe('Google Calendar event id'),
    bookingUid: z.string().optional().describe('Cal.com booking uid, when known'),
    newStartIso: z.string().describe('New start time as ISO datetime (Central wall time with offset, or UTC)'),
    durationMin: z.number().optional(),
  }, async (input) => actions.rescheduleAppointment(input))

  tool('cancel_appointment', 'Cancel an appointment (silent, customer is NOT notified). Also safely handles the visit\'s Stripe invoice: voids open, deletes draft, never touches paid, does nothing without a confident match.', {
    eventId: z.string().optional(), bookingUid: z.string().optional(),
    customerEmail: z.string().optional().describe('Needed for invoice cleanup'),
    serviceDate: z.string().optional().describe('YYYY-MM-DD of the visit, for invoice matching'),
    reason: z.string().optional(),
  }, async (input) => actions.cancelAppointment(input))

  tool('add_appointment_note', 'Append a NOTE to an appointment. Written to the calendar event description and the admin notes panel. Never goes to the customer.', {
    eventId: z.string(), note: z.string(), customerEmail: z.string().optional(),
  }, async ({ eventId, note, customerEmail }) => actions.appendEventNote({ eventId, note, customerEmail, authorEmail: USER_EMAIL }))

  tool('add_tech_note', "Save a note to the tech's day log (general observations, reminders, anything not tied to one customer or appointment).", {
    body: z.string().describe('The note text.'),
  }, async ({ body }) => {
    const text = (body || '').trim()
    if (!text) return { saved: false, error: 'empty note' }
    let contact = await findContactByEmail('bruce@greenguard-usa.com').catch(() => null)
    if (!contact?.id) contact = await upsertContact({ email: 'bruce@greenguard-usa.com', name: 'Bruce (Tech)' }).catch(() => null)
    if (!contact?.id) return { saved: false, error: 'tech contact unavailable' }
    await addNote(contact.id, `[TECH-NOTE] ${text}`)
    return { saved: true, where: 'tech day log' }
  })

  tool('add_customer_note', 'Save a note on a specific customer (gate codes, pets, access issues, follow-ups, service details). Appears on their profile and rounds cards. For notes about one APPOINTMENT use add_appointment_note instead.', {
    email: z.string().describe('Customer email. Look the customer up first if you only have a name.'),
    body: z.string().describe('The note text.'),
  }, async ({ email, body }) => {
    const text = (body || '').trim()
    if (!text) return { saved: false, error: 'empty note' }
    const c = await findContactByEmail(email).catch(() => null)
    if (!c?.id) return { saved: false, error: `no customer found for ${email}` }
    await addNote(c.id, `[ADMIN-NOTE ${USER_EMAIL} ${new Date().toISOString()}] ${text}`)
    await invalidate(`hs:notes:${c.id}`).catch(() => {})
    return { saved: true, customer: [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' ') || email }
  })

  tool('get_customer_notes', 'Read the most recent notes on a customer by email.', {
    email: z.string(),
  }, async ({ email }) => {
    const c = await findContactByEmail(email).catch(() => null)
    if (!c?.id) return { found: false }
    const raw = await getContactNotes(c.id, 10).catch(() => [])
    return { found: true, notes: raw.map((n) => ({ body: n.body, timestamp: n.timestamp || null })) }
  })

  tool('list_customer_invoices', 'List a customer\'s Stripe invoices with ids, status, amounts, and line items. Use before editing or sending an invoice.', { email: z.string() }, async ({ email }) => {
    const customer = await stripeCustomerForEmail(email)
    if (!customer) return { found: false }
    const invs = await getInvoices(customer.id, 10)
    return {
      found: true,
      stripeCustomerId: customer.id,
      invoices: invs.map((i) => ({
        invoiceId: i.id, status: i.status,
        amountDue: (i.amount_due || 0) / 100, amountPaid: (i.amount_paid || 0) / 100,
        created: new Date(i.created * 1000).toISOString().slice(0, 10),
        serviceDate: i.metadata?.service_date || null,
        lines: (i.lines?.data || []).map((l) => ({ lineId: l.id, invoiceItemId: l.invoice_item || null, description: l.description, amount: (l.amount || 0) / 100 })),
        payLink: i.hosted_invoice_url || null,
      })),
    }
  })

  tool('create_invoice_for_visit', 'Generate (or top up) the Stripe invoice for a service visit. Uses the portal\'s guarded invoice pipeline (dedup by booking, no double billing). Items are SKUs with qty, or custom label+price lines.', {
    customerEmail: z.string(), customerName: z.string().optional(),
    serviceDate: z.string().optional().describe('YYYY-MM-DD of the visit'),
    calBookingUid: z.string().optional(),
    items: z.array(z.object({
      sku: z.string().optional().describe('Known SKU, e.g. TANK-REFILL, TRAP-MAINT-1, TIMER-INSTALL'),
      label: z.string().describe('Line description shown to the customer'),
      price: z.number().describe('Unit price in dollars (used when no SKU price applies)'),
      qty: z.number().default(1),
    })).min(1),
  }, async ({ customerEmail, customerName, serviceDate, calBookingUid, items }) => {
    const out = await portalPost('/api/admin/generate-invoice', {
      customerEmail, customerName, serviceDate, calBookingUid,
      lineItems: items.map((i) => ({ sku: i.sku, label: i.label, price: i.price, qty: i.qty || 1 })),
    })
    return { ok: true, invoiceId: out.invoiceId, invoiceUrl: out.invoiceUrl || null, status: out.status || null, deduped: out.deduped || false }
  })

  tool('add_invoice_item', 'Add a line item to a customer\'s draft invoice by SKU (or use create_invoice_for_visit for custom lines).', {
    email: z.string(), sku: z.string(), qty: z.number().default(1),
    invoiceId: z.string().optional().describe('Target draft; defaults to the most recent draft'),
  }, async ({ email, sku, qty, invoiceId }) => {
    const customer = await stripeCustomerForEmail(email)
    if (!customer) return { error: 'No Stripe customer for that email' }
    await portalPost('/api/admin/invoice-items', { action: 'add', customerId: customer.id, sku, qty, invoiceId, requestId: `chat-${Date.now()}` })
    return { ok: true }
  })

  tool('remove_invoice_line', 'Remove a line from a draft invoice. Pass the invoiceItemId (ii_...) or lineId (il_...) from list_customer_invoices.', {
    itemId: z.string(), invoiceId: z.string().optional().describe('Required when passing a lineId (il_...)'),
  }, async ({ itemId, invoiceId }) => {
    await portalPost('/api/admin/invoice-items', { action: 'delete-line', itemId, invoiceId })
    return { ok: true }
  })

  tool('send_invoice', 'Finalize a draft invoice and send it to the customer (Stripe emails the payment link, or auto-charges a card on file).', {
    email: z.string(), invoiceId: z.string().optional().describe('Defaults to the most recent draft'),
  }, async ({ email, invoiceId }) => {
    const customer = await stripeCustomerForEmail(email)
    if (!customer) return { error: 'No Stripe customer for that email' }
    const out = await portalPost('/api/admin/invoice-items', { action: 'send', customerId: customer.id, invoiceId })
    return { ok: true, ...out }
  })
}

async function main() {
  if (!USER_EMAIL) { console.error('GG_CHAT_USER_EMAIL required'); process.exit(1) }
  if (AUDIENCE === 'admin') registerAdminTools()
  else registerCustomerTools()
  await server.connect(new StdioServerTransport())
}

main().catch((e) => { console.error('chat-mcp-server fatal:', e); process.exit(1) })
