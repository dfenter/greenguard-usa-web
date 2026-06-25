// POST /api/customer/chat
// Body: { message, history: [{role, content}] }
//
// Customer assistant powered by Claude with tool-calling. It answers questions
// from the signed-in customer's own context and can take TWO safe actions on
// their behalf: request a service visit and request a reschedule (both just
// notify the team + email the customer a confirmation — no money, no calendar
// edits). Anything riskier (cancel, refund, complaint) is escalated to a human.

const { getSessionFromRequest } = require('../../../lib/auth')
const { findContactByEmail, addNote } = require('../../../lib/hubspot')
const { getInvoices } = require('../../../lib/stripe')
const { getUpcomingBookingsForEmail, getPastBookingsForEmail } = require('../../../lib/gcal')
const { sendServiceRequest } = require('../../../lib/email')
const { runAssistant } = require('../../../lib/assistant')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

const SYSTEM_TEMPLATE = `You are the GreenGuard USA customer assistant. You help the signed-in customer with questions about their CO₂ mosquito-control service and can take two safe actions for them.

GROUND RULES:
1. Be warm, brief, plain-English. No marketing language. No emojis unless the customer used one first. Never use em dashes.
2. Answer only from the CUSTOMER CONTEXT below or general service facts. Never invent amounts, dates, or details.
3. You CAN take these actions with the tools provided:
   - request_service_visit: when the customer wants someone to come out / service their trap / a tank swap.
   - request_reschedule: when they want to move their upcoming visit.
   After calling a tool, tell them plainly that the request was sent and the team will confirm.
4. You may NOT cancel service, issue refunds, change billing, or promise specific times. For those, or any complaint/upset customer, call escalate_to_team and tell them the team will reach out within one business day.
5. If you can't confidently answer, say you'll have someone follow up (escalate_to_team).

CUSTOMER CONTEXT:
{context}`

async function buildContext(session) {
  const ctx = { email: session.email }
  try {
    const contact = await findContactByEmail(session.email)
    if (contact) {
      const p = contact.properties || {}
      ctx.name = [p.firstname, p.lastname].filter(Boolean).join(' ')
      ctx.address = p.address
      ctx.systemType = p.system_type
      ctx.trapCount = p.trap_count
      ctx.planType = p.plan_type
    }
  } catch {}
  try {
    const [upcoming, past] = await Promise.all([
      getUpcomingBookingsForEmail(session.email, 3).catch(() => []),
      getPastBookingsForEmail(session.email, 3).catch(() => []),
    ])
    ctx.nextVisit = upcoming[0] ? { date: upcoming[0].startTime, service: upcoming[0].title } : null
    ctx.lastVisit = past[0] ? { date: past[0].startTime, service: past[0].title } : null
  } catch {}
  if (session.stripeCustomerId) {
    try {
      const invs = await getInvoices(session.stripeCustomerId, 5)
      const openSum = invs.filter((i) => i.status === 'open').reduce((s, i) => s + i.amount_due, 0) / 100
      ctx.openBalance = openSum.toFixed(2)
    } catch {}
  }
  return ctx
}

function ctxToText(ctx) {
  return [
    `Name: ${ctx.name || ctx.email}`,
    ctx.address ? `Address: ${ctx.address}` : null,
    ctx.systemType ? `System: ${ctx.systemType} (plan=${ctx.planType || '?'}, traps=${ctx.trapCount || '?'})` : null,
    ctx.nextVisit
      ? `Next service visit: ${new Date(ctx.nextVisit.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} — ${ctx.nextVisit.service}`
      : 'Next service visit: not currently scheduled',
    ctx.lastVisit
      ? `Last service visit: ${new Date(ctx.lastVisit.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} — ${ctx.lastVisit.service}`
      : null,
    `Open balance: $${ctx.openBalance && Number(ctx.openBalance) > 0 ? ctx.openBalance : '0'}`,
  ].filter(Boolean).join('\n')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })

  const { message, history = [] } = req.body || {}
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message required' })
  if (message.length > 2000) return res.status(400).json({ error: 'message too long' })

  try {
    const ctx = await buildContext(session)
    const customerInfo = {
      name: ctx.name || null, email: session.email, address: ctx.address || null, systemType: ctx.systemType || null,
    }
    let escalated = false
    let escalateReason = null

    const tools = [
      {
        name: 'request_service_visit',
        description: 'Request that the team schedule a service visit / tank swap for this customer. Use when they want someone to come out.',
        input_schema: { type: 'object', properties: { note: { type: 'string', description: 'Optional detail from the customer about what they need.' } } },
        run: async ({ note }) => {
          await sendServiceRequest(ADMIN_EMAIL, customerInfo,
            `${customerInfo.name || 'A customer'} would like to request a service visit.${note ? ' Note: ' + note : ''}`,
            { subject: `Service Visit Request: ${customerInfo.name || session.email}`, heading: 'Customer requested a service visit (via assistant)', confirmHeading: 'We received your service visit request and will reach out to schedule a time.' })
          return { sent: true }
        },
      },
      {
        name: 'request_reschedule',
        description: 'Request that the team reschedule the customer\'s upcoming visit. Use when they want to move their appointment.',
        input_schema: { type: 'object', properties: { note: { type: 'string', description: 'Optional preferred timing or reason.' } } },
        run: async ({ note }) => {
          const when = ctx.nextVisit ? new Date(ctx.nextVisit.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : null
          await sendServiceRequest(ADMIN_EMAIL, { ...customerInfo, bookingDate: when },
            `${customerInfo.name || 'A customer'} would like to reschedule their upcoming visit${when ? ' on ' + when : ''}.${note ? ' Note: ' + note : ''}`,
            { subject: `Reschedule Request: ${customerInfo.name || session.email}`, heading: 'Customer wants to reschedule (via assistant)', confirmHeading: 'We received your reschedule request and will reach out to confirm a new time.' })
          return { sent: true }
        },
      },
      {
        name: 'escalate_to_team',
        description: 'Flag this conversation for a human. Use for cancellations, refunds, billing changes, complaints, or anything you cannot safely handle.',
        input_schema: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] },
        run: async ({ reason }) => {
          escalated = true; escalateReason = reason || 'customer needs help'
          try {
            const contact = await findContactByEmail(session.email).catch(() => null)
            if (contact?.id) await addNote(contact.id, `[CHAT-ESCALATION] ${escalateReason}\n\nCustomer: "${message}"`)
          } catch {}
          return { escalated: true }
        },
      },
    ]

    const { reply } = await runAssistant({
      system: SYSTEM_TEMPLATE.replace('{context}', ctxToText(ctx)),
      history, userMessage: message, tools, maxTokens: 700,
    })

    // Low-priority transcript log for non-escalated chats.
    if (!escalated) {
      try {
        const contact = await findContactByEmail(session.email).catch(() => null)
        if (contact?.id) await addNote(contact.id, `[CHAT] Q: ${message.slice(0, 200)}\n   A: ${reply.slice(0, 400)}`)
      } catch {}
    }

    return res.status(200).json({ reply, escalated, escalateReason })
  } catch (e) {
    console.error('customer chat error:', e.message)
    return res.status(500).json({ error: 'Chat unavailable right now — please email admin@greenguard-usa.com' })
  }
}
