/**
 * POST /api/admin/send-message
 * Send a freeform email to a customer from either admin.
 * Body: { to, toName, subject, body }
 */
const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { Resend } = require('resend')

const FROM = process.env.PORTAL_FROM_EMAIL || 'noreply@greenguard-usa.com'

function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }
  return String(str ?? '').replace(/[&<>"']/g, (c) => map[c])
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { to, toName, subject, body } = req.body || {}
  if (!to || !subject || !body) return res.status(400).json({ error: 'to, subject, and body are required' })

  if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: 'Email not configured' })

  const resend = new Resend(process.env.RESEND_API_KEY)
  const senderName = session.email.startsWith('bruce') ? 'Bruce at GreenGuard USA' : 'GreenGuard USA'

  const htmlBody = escapeHtml(body).replace(/\n/g, '<br/>')

  try {
    await resend.emails.send({
      from: `${senderName} <${FROM}>`,
      to,
      subject,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#1a2e1f;border-radius:12px;color:#d4e6ca;">
          ${toName ? `<p style="margin:0 0 20px;font-size:1rem;font-weight:700;">Hi ${escapeHtml(toName.split(' ')[0])},</p>` : ''}
          <div style="font-size:0.95rem;line-height:1.75;color:rgba(212,230,202,0.85);">${htmlBody}</div>
          <div style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(122,171,130,0.2);font-size:0.78rem;color:rgba(212,230,202,0.4);">
            GreenGuard USA · Austin, TX · <a href="https://portal.greenguard-usa.com" style="color:rgba(125,255,170,0.6);">Customer Portal</a>
          </div>
        </div>
      `,
      reply_to: session.email,
    })

    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
