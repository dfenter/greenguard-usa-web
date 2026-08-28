const { getSessionFromRequest } = require('../../../lib/auth')
const { findContactByEmail } = require('../../../lib/hubspot')
const { sendServiceRequest } = require('../../../lib/email')
const { autoReschedule } = require('../../../lib/auto-reschedule')
const biz = require('../../../lib/business.config')

const TZ = 'America/Chicago'
const fmtSlot = (d) => d.toLocaleString('en-US', {
  weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  timeZone: TZ, timeZoneName: 'short',
})

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || biz.ownerEmail

// In-process rate limit: max 3 requests per email per hour
const rateLimitMap = new Map()
function checkRateLimit(email) {
  const now = Date.now()
  const entry = rateLimitMap.get(email)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(email, { count: 1, resetAt: now + 60 * 60 * 1000 })
    return true
  }
  if (entry.count >= 3) return false
  entry.count++
  return true
}

// Each request kind defines the admin subject, the default message, and the
// confirmation line the customer sees.
function buildRequest(kind, { name, bookingDate, requestedDate }) {
  switch (kind) {
    case 'reschedule':
      return {
        subject: `Reschedule Request: ${name}`,
        heading: 'Customer wants to reschedule',
        message: [
          bookingDate ? `${name} would like to reschedule their upcoming visit on ${bookingDate}.` : `${name} would like to reschedule their upcoming visit.`,
          requestedDate ? `Requested new time: ${requestedDate}` : null,
        ].filter(Boolean).join('\n'),
        confirmHeading: requestedDate
          ? `We received your reschedule request for ${requestedDate} and will confirm shortly.`
          : 'We received your reschedule request and will reach out to confirm a new time.',
      }
    case 'pause':
      return {
        subject: `Service Pause Request: ${name}`,
        heading: 'Customer wants to pause service',
        message: `${name} would like to temporarily pause their service.`,
        confirmHeading: 'We received your request to pause service and will follow up shortly.',
      }
    case 'service':
    default:
      return {
        subject: `Service Visit Request: ${name}`,
        heading: 'Customer requested a service visit',
        message: `${name} would like to request a service visit.`,
        confirmHeading: 'We received your service visit request and will reach out to schedule a time.',
      }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const session = await getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })

  if (!checkRateLimit(session.email)) {
    return res.status(429).json({ error: 'Too many requests — please wait an hour before sending another.' })
  }

  const { kind = 'service', bookingDate = null, requestedDate = null, requestedIso = null } = req.body || {}

  const contact = await findContactByEmail(session.email).catch(() => null)
  const p = contact?.properties || {}
  const name = [p.firstname, p.lastname].filter(Boolean).join(' ') || session.email

  const customerInfo = {
    name: [p.firstname, p.lastname].filter(Boolean).join(' ') || null,
    email: session.email,
    address: p.address || null,
    systemType: p.system_type || null,
    bookingDate: bookingDate || null,
  }

  // Reschedule requests with a concrete slot are applied directly; any failure
  // falls through to the manual request-email flow below.
  if (kind === 'reschedule' && requestedIso) {
    const result = await autoReschedule(session.email, requestedIso)
    if (result.ok) {
      const oldSlot = fmtSlot(result.oldStart)
      const newSlot = fmtSlot(result.newStart)
      try {
        await sendServiceRequest(ADMIN_EMAIL, customerInfo, `${name}'s visit was moved from ${oldSlot} to ${newSlot} at their request. No action needed.`, {
          subject: `Rescheduled automatically: ${name}`,
          heading: 'Visit rescheduled automatically',
          confirmHeading: `Your visit is confirmed for ${newSlot}. No further action needed — see you then!`,
        })
      } catch (err) {
        console.error('auto-reschedule notification error:', err)
      }
      return res.status(200).json({ sent: true, rescheduled: true, newTime: newSlot })
    }
    console.log('auto-reschedule fell back to manual:', result.reason)
  }

  const { subject, heading, message, confirmHeading } = buildRequest(kind, { name, bookingDate, requestedDate })

  try {
    await sendServiceRequest(ADMIN_EMAIL, customerInfo, message, { subject, heading, confirmHeading })
  } catch (err) {
    console.error('request-service email error:', err)
    return res.status(500).json({ error: 'Failed to send' })
  }

  res.status(200).json({ sent: true, rescheduled: false })
}
