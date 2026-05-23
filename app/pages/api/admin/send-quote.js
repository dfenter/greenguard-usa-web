const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { SignJWT } = require('jose')
const { Resend } = require('resend')
const { escapeHtml } = require('../../../lib/email')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { to, name, lineItems = [], total, taxRate = 0, taxAmount = 0, notes,
          customerAddress, serviceLines, addonLines, productLines, recurringTotal, oneTimeTotal } = req.body || {}
  if (!to) return res.status(400).json({ error: 'to required' })

  const resend = new Resend(process.env.RESEND_API_KEY)
  const FROM = process.env.PORTAL_FROM_EMAIL || 'noreply@greenguard-usa.com'
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'

  // Generate a shareable quote token so the email links to the branded quote page
  const token = await new SignJWT({
    customerName: name, customerEmail: to, customerAddress,
    serviceLines, addonLines, productLines,
    total, recurringTotal, oneTimeTotal, taxRate, taxAmount, notes,
    type: 'quote',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret())
  const quoteUrl = `${APP_URL}/quote/${token}`

  const rows = lineItems.map((l) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.06);color:#444;">${escapeHtml(l.label)}</td>
      <td style="padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.06);text-align:right;font-weight:700;color:#1a2e1f;">$${parseFloat(l.amount || 0).toFixed(2)}</td>
    </tr>`).join('')

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:12px;color:#1a2e1f;">
      <div style="background:#0d1a10;border-radius:8px;padding:18px 20px;margin-bottom:28px;">
        <h1 style="color:#7dffaa;font-size:1.2rem;margin:0;letter-spacing:-0.01em;">GreenGuard USA</h1>
        <p style="color:rgba(212,230,202,0.5);font-size:0.78rem;margin:4px 0 0;letter-spacing:0.1em;text-transform:uppercase;">Smart · Safe · Effective</p>
      </div>
      <h2 style="font-size:1.1rem;margin:0 0 6px;">Service Quote${name ? ` for ${name}` : ''}</h2>
      <p style="color:#777;font-size:0.88rem;margin:0 0 24px;">This quote is valid for 30 days from today.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">${rows}</table>
      ${taxAmount > 0 ? `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #eee;color:#777;font-size:0.9rem;">
        <span>Subtotal</span><span>$${parseFloat(total || 0).toFixed(2)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;color:#777;font-size:0.9rem;">
        <span>Tax (${taxRate}%)</span><span>$${parseFloat(taxAmount).toFixed(2)}</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:14px 0;border-top:2px solid #1a2e1f;margin-bottom:${notes ? '20px' : '28px'};">
        <strong style="font-size:1rem;">Total due</strong>
        <strong style="font-size:1.1rem;color:#0d8a3c;">$${(parseFloat(total || 0) + parseFloat(taxAmount || 0)).toFixed(2)}</strong>
      </div>
      ${notes ? `<p style="font-size:0.85rem;color:#777;border-top:1px solid #eee;padding-top:16px;margin-bottom:28px;">${escapeHtml(notes)}</p>` : ''}
      <a href="${quoteUrl}" style="display:inline-block;background:#c9a84c;color:#0d1a10;font-weight:700;font-size:0.95rem;padding:14px 28px;border-radius:6px;text-decoration:none;">
        View Your Full Quote →
      </a>
      <p style="font-size:0.78rem;color:#bbb;margin-top:28px;">This quote is valid for 30 days · Questions? Reply to this email or call <a href="tel:+15125604129" style="color:#bbb;">512-560-4129</a> — GreenGuard USA, Austin TX</p>
    </div>`

  await resend.emails.send({
    from: `GreenGuard USA <${FROM}>`,
    to,
    bcc: ['admin@greenguard-usa.com', 'bruce@greenguard-usa.com'],
    subject: `Your GreenGuard Service Quote${name ? ` — ${name}` : ''}`,
    html,
  })

  res.status(200).json({ ok: true })
}
