const { getSessionFromRequest } = require('../../../lib/auth')
const { Resend } = require('resend')
const { escapeHtml } = require('../../../lib/email')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || session.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' })

  const { to, name, lineItems = [], total, notes } = req.body || {}
  if (!to) return res.status(400).json({ error: 'to required' })

  const resend = new Resend(process.env.RESEND_API_KEY)
  const FROM = process.env.PORTAL_FROM_EMAIL || 'noreply@greenguard-usa.com'
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'

  const rows = lineItems.map((l) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.06);color:#444;">${escapeHtml(l.label)}</td>
      <td style="padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.06);text-align:right;font-weight:700;color:#1a2e1f;">$${parseFloat(l.amount || 0).toFixed(2)}</td>
    </tr>`).join('')

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:12px;color:#1a2e1f;">
      <div style="background:#0d1a10;borderRadius:8px;padding:18px 20px;marginBottom:28px;">
        <h1 style="color:#7dffaa;font-size:1.2rem;margin:0;letter-spacing:-0.01em;">GreenGuard USA</h1>
        <p style="color:rgba(212,230,202,0.5);font-size:0.78rem;margin:4px 0 0;letter-spacing:0.1em;text-transform:uppercase;">Smart · Safe · Effective</p>
      </div>
      <h2 style="font-size:1.1rem;margin:0 0 6px;">Service Quote${name ? ` for ${name}` : ''}</h2>
      <p style="color:#777;font-size:0.88rem;margin:0 0 24px;">This quote is valid for 30 days from today.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">${rows}</table>
      <div style="display:flex;justify-content:space-between;padding:14px 0;border-top:2px solid #1a2e1f;margin-bottom:${notes ? '20px' : '28px'};">
        <strong style="font-size:1rem;">Total</strong>
        <strong style="font-size:1.1rem;color:#0d8a3c;">$${total.toFixed(2)}</strong>
      </div>
      ${notes ? `<p style="font-size:0.85rem;color:#777;border-top:1px solid #eee;padding-top:16px;margin-bottom:28px;">${notes}</p>` : ''}
      <a href="${APP_URL}" style="display:inline-block;background:#1a2e1f;color:#7dffaa;font-weight:700;font-size:0.9rem;padding:14px 28px;border-radius:6px;text-decoration:none;">
        View My Account
      </a>
      <p style="font-size:0.78rem;color:#bbb;margin-top:28px;">Questions? Reply to this email or call us — GreenGuard USA, Austin TX</p>
    </div>`

  await resend.emails.send({
    from: `GreenGuard USA <${FROM}>`,
    to,
    subject: `Your GreenGuard Service Quote${name ? ` — ${name}` : ''}`,
    html,
  })

  res.status(200).json({ ok: true })
}
