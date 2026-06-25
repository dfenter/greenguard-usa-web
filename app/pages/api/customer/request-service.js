const { getSessionFromRequest } = require('../../../lib/auth')
const { findContactByEmail } = require('../../../lib/hubspot')
const { sendServiceRequest } = require('../../../lib/email')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

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

  const { kind = 'service', bookingDate = null, requestedDate = null } = req.body || {}

  const contact = await findContactByEmail(session.email).catch(() => null)
  const p = contact?.properties || {}
  const name = [p.firstname, p.lastname].filter(Boolean).join(' ') || session.email

  const { subject, heading, message, confirmHeading } = buildRequest(kind, { name, bookingDate, requestedDate })

  const customerInfo = {
    name: [p.firstname, p.lastname].filter(Boolean).join(' ') || null,
    email: session.email,
    address: p.address || null,
    systemType: p.system_type || null,
    bookingDate: bookingDate || null,
  }

  try {
    await sendServiceRequest(ADMIN_EMAIL, customerInfo, message, { subject, heading, confirmHeading })
  } catch (err) {
    console.error('request-service email error:', err)
    return res.status(500).json({ error: 'Failed to send' })
  }

  res.status(200).json({ sent: true })
}
