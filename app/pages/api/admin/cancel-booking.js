const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { cancelBooking } = require('../../../lib/calcom')
const { stripe, findInvoiceForBooking } = require('../../../lib/stripe')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { bookingId, reason, customerEmail, calBookingUid, serviceDate, action = 'cancel' } = req.body || {}
  if (!bookingId) return res.status(400).json({ error: 'bookingId required' })

  // Cancel or reschedule the Cal.com booking
  await cancelBooking(bookingId, reason || 'Cancelled by admin')

  // Handle THIS booking's Stripe invoice.
  //
  // This block previously looked up "the customer's most recent draft-or-open
  // invoice" by email alone and voided it. Voiding is irreversible in Stripe, so
  // cancelling an appointment for a customer who had an unrelated unpaid invoice
  // destroyed that invoice. We now resolve the invoice by booking identity and
  // treat "no confident match" as a no-op — never a guess.
  let invoiceAction = null
  let invoiceError = null
  if (customerEmail && (calBookingUid || serviceDate)) {
    try {
      const match = await findInvoiceForBooking(customerEmail, { calBookingUid, serviceDate })
      if (!match) {
        invoiceAction = 'skipped_no_match'
      } else if (action === 'reschedule') {
        // Leave the draft alone — it gets updated when the visit is completed.
        invoiceAction = 'kept_as_draft'
      } else {
        // findInvoiceForBooking is cached (30s). Re-read the invoice immediately
        // before mutating so we never void based on a stale status.
        const invoice = await stripe.invoices.retrieve(match.id)
        if (invoice.status === 'open') {
          await stripe.invoices.voidInvoice(invoice.id)
          invoiceAction = 'voided'
        } else if (invoice.status === 'draft') {
          await stripe.invoices.del(invoice.id)
          invoiceAction = 'deleted'
        } else {
          // paid / uncollectible / already void — never touch it.
          invoiceAction = `skipped_${invoice.status}`
        }
      }
    } catch (err) {
      // The Cal.com cancellation already succeeded, so don't fail the request —
      // but don't silently claim success either. Surface it so the UI can show it.
      console.error('cancel-booking invoice error:', err.message)
      invoiceAction = 'error'
      invoiceError = err.message
    }
  } else if (customerEmail) {
    // Email given but no booking identifier — cannot match safely.
    invoiceAction = 'skipped_no_identifier'
  }

  res.status(200).json({ ok: true, invoiceAction, ...(invoiceError ? { invoiceError } : {}) })
}
