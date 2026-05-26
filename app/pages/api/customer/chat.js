// POST /api/customer/chat
// Body: { message, history: [{role, content}] }
//
// Customer chatbot. Loads HubSpot context for the signed-in customer, calls
// Gemini, and returns the answer + escalation flag.
//
// Safety: never executes destructive actions (cancel/reschedule/refund). For
// anything risky the bot says it's "letting the team know" and we log to
// HubSpot as [CHAT-ESCALATION] for admin pickup.

const { getSessionFromRequest } = require('../../../lib/auth')
const { findContactByEmail, addNote } = require('../../../lib/hubspot')
const { getInvoices, getCustomer } = require('../../../lib/stripe')
const { getUpcomingBookingsForEmail, getPastBookingsForEmail } = require('../../../lib/gcal')
const { chat: geminiChat, generateJSON } = require('../../../lib/gemini')

const SYSTEM_TEMPLATE = `You are the GreenGuard USA customer assistant. You help customers with simple questions about their CO₂ mosquito-control service.

GROUND RULES (do not break):
1. NEVER agree to cancel, reschedule, refund, or change anything. Always say: "I'll let the team know — someone will reach out within one business day." That's your only response for those topics.
2. If the customer is upset, angry, or has a service complaint → say you've alerted the team, do not try to fix it yourself.
3. If they ask a question you can't confidently answer from the provided context → say "Let me have someone get back to you on that."
4. Be warm, brief, plain-English. No marketing language. No emojis unless they used one first.
5. NEVER guess at financial amounts, dates, or service details that aren't in the context below.

CUSTOMER CONTEXT:
{context}

If you need to escalate (cancel/reschedule/complaint/refund/anything you can't handle), include the exact phrase "ESCALATE:" followed by a 1-line reason at the END of your reply. The phrase ESCALATE: is for our internal logging, customer-facing text should come BEFORE it.`

async function buildContext(session) {
  const ctx = { email: session.email }
  try {
    const contact = await findContactByEmail(session.email)
    if (contact) {
      const p = contact.properties || {}
      ctx.name = [p.firstname, p.lastname].filter(Boolean).join(' ')
      ctx.phone = p.phone
      ctx.address = p.address
      ctx.systemType = p.system_type
      ctx.trapCount = p.trap_count
      ctx.tankCount = p.tank_count
      ctx.planType = p.plan_type
    }
  } catch {}
  try {
    const [upcoming, past] = await Promise.all([
      getUpcomingBookingsForEmail(session.email, 3).catch(() => []),
      getPastBookingsForEmail(session.email, 3).catch(() => []),
    ])
    ctx.nextVisit = upcoming[0]
      ? { date: upcoming[0].startTime, service: upcoming[0].title }
      : null
    ctx.lastVisit = past[0]
      ? { date: past[0].startTime, service: past[0].title }
      : null
  } catch {}
  if (session.stripeCustomerId) {
    try {
      const invs = await getInvoices(session.stripeCustomerId, 5)
      ctx.invoices = invs.map((i) => ({
        amount: (i.amount_due / 100).toFixed(2),
        status: i.status,
        created: new Date(i.created * 1000).toISOString().slice(0, 10),
      }))
      const openSum = invs
        .filter((i) => i.status === 'open')
        .reduce((s, i) => s + i.amount_due, 0) / 100
      ctx.openBalance = openSum.toFixed(2)
    } catch {}
  }
  return ctx
}

function ctxToText(ctx) {
  const lines = [
    `Name: ${ctx.name || ctx.email}`,
    ctx.phone ? `Phone: ${ctx.phone}` : null,
    ctx.address ? `Address: ${ctx.address}` : null,
    ctx.systemType ? `System: ${ctx.systemType} (plan=${ctx.planType || '?'}, traps=${ctx.trapCount || '?'}, tanks=${ctx.tankCount || '?'})` : null,
    ctx.nextVisit ? `Next service visit: ${new Date(ctx.nextVisit.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} — ${ctx.nextVisit.service}` : `Next service visit: not currently scheduled`,
    ctx.lastVisit ? `Last service visit: ${new Date(ctx.lastVisit.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} — ${ctx.lastVisit.service}` : null,
    ctx.openBalance && Number(ctx.openBalance) > 0 ? `Open balance: $${ctx.openBalance}` : `Open balance: $0`,
    ctx.invoices?.length ? `Recent invoices: ${ctx.invoices.map((i) => `$${i.amount} ${i.status} ${i.created}`).join(', ')}` : null,
  ].filter(Boolean)
  return lines.join('\n')
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
    const system = SYSTEM_TEMPLATE.replace('{context}', ctxToText(ctx))

    // Cap history to last 10 turns
    const safeHistory = Array.isArray(history) ? history.slice(-10) : []

    const raw = await geminiChat({
      system,
      history: safeHistory,
      userMessage: message,
      maxTokens: 512,
    })

    // Extract escalation flag
    const escalateMatch = raw.match(/ESCALATE:\s*(.*)$/m)
    const reply = raw.replace(/\s*ESCALATE:.*$/m, '').trim()
    const escalated = !!escalateMatch
    const escalateReason = escalateMatch ? escalateMatch[1].trim() : null

    // Log escalations to HubSpot
    if (escalated) {
      try {
        const contact = await findContactByEmail(session.email).catch(() => null)
        if (contact?.id) {
          await addNote(contact.id,
            `[CHAT-ESCALATION] ${escalateReason}\n\nCustomer message: "${message}"\nBot reply: "${reply}"`
          )
        }
      } catch {}
    } else {
      // Log all conversations at low priority for review
      try {
        const contact = await findContactByEmail(session.email).catch(() => null)
        if (contact?.id) {
          await addNote(contact.id, `[CHAT] Q: ${message.slice(0, 200)}\n   A: ${reply.slice(0, 400)}`)
        }
      } catch {}
    }

    return res.status(200).json({ reply, escalated, escalateReason })
  } catch (e) {
    console.error('chat error:', e.message)
    return res.status(500).json({ error: 'Chat unavailable right now — please email admin@greenguard-usa.com' })
  }
}
