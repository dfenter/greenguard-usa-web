const { getSessionFromRequest, isAdminEmail, newJti } = require('../../../lib/auth')
const { SignJWT } = require('jose')
const { Resend } = require('resend')
const { escapeHtml } = require('../../../lib/email')
const { findContactByEmail, upsertContact, addNote } = require('../../../lib/hubspot')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET)
}

function fmt$(n) { return `$${parseFloat(n || 0).toFixed(2)}` }

function formatServiceDate(s) {
  if (!s) return ''
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

// Build a Google Static Maps URL: customer pin (red) + N trap pins (green
// numbered). Falls back to a plain address-only map if no machPins.
function buildMapUrl({ address, machPins }) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!key || (!address && !(machPins?.length))) return null
  const params = [
    'size=560x300',
    'scale=2',
    'maptype=roadmap',
    `key=${encodeURIComponent(key)}`,
  ]
  if (address) {
    params.push(`markers=color:red%7Clabel:H%7C${encodeURIComponent(address)}`)
  }
  ;(machPins || []).forEach((p, i) => {
    params.push(`markers=color:0x7dffaa%7Clabel:${i + 1}%7C${p.lat},${p.lng}`)
  })
  return `https://maps.googleapis.com/maps/api/staticmap?${params.join('&')}`
}

function lineRows(lines, color) {
  return lines.filter((l) => (l.amount || 0) > 0).map((l) => `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid rgba(0,0,0,0.05);color:#444;font-size:0.9rem;">${escapeHtml(l.label)}</td>
      <td style="padding:9px 0;border-bottom:1px solid rgba(0,0,0,0.05);text-align:right;font-weight:700;color:${color};font-size:0.9rem;white-space:nowrap;">${fmt$(l.amount)}</td>
    </tr>`).join('')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const {
    to, name, lineItems = [], total, taxRate = 0, taxAmount = 0, notes,
    customerAddress, serviceLines = [], addonLines = [], productLines = [],
    recurringTotal = 0, oneTimeTotal = 0, serviceDate, machPins = [],
  } = req.body || {}
  if (!to) return res.status(400).json({ error: 'to required' })

  const resend = new Resend(process.env.RESEND_API_KEY)
  const FROM = process.env.PORTAL_FROM_EMAIL || 'noreply@greenguard-usa.com'
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'

  // Signed JWT for the public quote page; jti uniquely tags this quote version
  // so the follow-up agent can track engagement and skip after checkout.
  const jti = newJti()
  const token = await new SignJWT({
    customerName: name, customerEmail: to, customerAddress,
    serviceLines, addonLines, productLines,
    total, recurringTotal, oneTimeTotal, taxRate, taxAmount, notes,
    serviceDate, machPins, type: 'quote',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setJti(jti)
    .setExpirationTime('30d')
    .sign(getSecret())
  const quoteUrl = `${APP_URL}/quote/${token}`

  // Separate sections: monthly recurring vs one-time
  const recurringLines = [...serviceLines, ...addonLines].filter((l) => l.recurring)
  const oneTimeLines = [
    ...serviceLines.filter((l) => !l.recurring),
    ...addonLines.filter((l) => !l.recurring),
    ...productLines,
  ]

  const mapUrl = buildMapUrl({ address: customerAddress, machPins })
  const dueToday = oneTimeTotal + taxAmount
  const monthlyAfter = recurringTotal

  const sectionStyle = 'margin:0 0 24px;padding:16px 18px;background:#f7fbf6;border-radius:10px;border:1px solid #e3eedb;'
  const sectionTitle = (color) => `font-size:0.7rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${color};margin:0 0 10px;`

  const monthlyHtml = recurringLines.length > 0 ? `
    <div style="${sectionStyle}">
      <div style="${sectionTitle('#0d8a3c')}">Monthly Recurring</div>
      <table style="width:100%;border-collapse:collapse;">${lineRows(recurringLines, '#0d8a3c')}</table>
      <div style="display:flex;justify-content:space-between;padding:10px 0 0;border-top:2px solid #0d8a3c;margin-top:6px;font-weight:800;color:#0d8a3c;">
        <span>Total per month</span><span>${fmt$(monthlyAfter)}/mo</span>
      </div>
    </div>` : ''

  const oneTimeHtml = oneTimeLines.length > 0 ? `
    <div style="${sectionStyle}background:#f6f9fb;border-color:#dde6ed;">
      <div style="${sectionTitle('#1565c0')}">One-Time Charges (Due With First Visit)</div>
      <table style="width:100%;border-collapse:collapse;">${lineRows(oneTimeLines, '#1565c0')}</table>
      ${taxAmount > 0 ? `
      <div style="display:flex;justify-content:space-between;padding:6px 0;color:#666;font-size:0.85rem;">
        <span>Tax (${taxRate}%)</span><span>${fmt$(taxAmount)}</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:10px 0 0;border-top:2px solid #1565c0;margin-top:6px;font-weight:800;color:#1565c0;">
        <span>Total due with first visit</span><span>${fmt$(dueToday)}</span>
      </div>
    </div>` : ''

  const mapHtml = mapUrl ? `
    <div style="${sectionStyle}background:#fafafa;border-color:#e8e8e8;">
      <div style="${sectionTitle('#666')}">Service Location${machPins.length ? ` & Trap Placement (${machPins.length})` : ''}</div>
      <img src="${mapUrl}" alt="Service map" style="display:block;width:100%;max-width:520px;border-radius:6px;border:1px solid #ddd;" />
      ${customerAddress ? `<p style="font-size:0.82rem;color:#555;margin:10px 0 0;"><strong>H</strong> = your address: ${escapeHtml(customerAddress)}</p>` : ''}
      ${machPins.length ? `<p style="font-size:0.82rem;color:#0d8a3c;margin:4px 0 0;">Numbered green pins = proposed trap locations</p>` : ''}
    </div>` : ''

  const serviceDateHtml = serviceDate ? `
    <div style="${sectionStyle}background:#fefaf2;border-color:#f0e3c1;">
      <div style="${sectionTitle('#c9a84c')}">Requested First Service</div>
      <p style="margin:0;color:#3a2e0f;font-size:1rem;font-weight:700;">${formatServiceDate(serviceDate)}</p>
      <p style="margin:6px 0 0;color:#776644;font-size:0.82rem;">We'll confirm this date by reply once you approve the quote.</p>
    </div>` : ''

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px 16px;background:#fff;color:#1a2e1f;">
      <div style="background:#0d1a10;border-radius:10px;padding:18px 22px;margin-bottom:24px;">
        <h1 style="color:#7dffaa;font-size:1.25rem;margin:0;letter-spacing:-0.01em;">GreenGuard USA</h1>
        <p style="color:rgba(212,230,202,0.55);font-size:0.78rem;margin:4px 0 0;letter-spacing:0.1em;text-transform:uppercase;">Smart · Safe · Effective</p>
      </div>

      <h2 style="font-size:1.15rem;margin:0 0 6px;">Service Quote${name ? ` for ${name}` : ''}</h2>
      <p style="color:#666;font-size:0.85rem;margin:0 0 22px;">This quote is valid for 30 days from today.</p>

      ${serviceDateHtml}
      ${monthlyHtml}
      ${oneTimeHtml}
      ${mapHtml}

      <div style="background:#1a2e1f;color:#fff;border-radius:10px;padding:18px 22px;margin:0 0 24px;">
        <div style="font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:#7dffaa;margin-bottom:8px;">Summary</div>
        ${oneTimeLines.length > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Due with first visit</span><strong>${fmt$(dueToday)}</strong></div>` : ''}
        ${recurringLines.length > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Then monthly</span><strong>${fmt$(monthlyAfter)}/mo</strong></div>` : ''}
      </div>

      ${notes ? `<div style="background:#fdfaee;border:1px solid #f0e3c1;border-radius:8px;padding:14px 16px;margin:0 0 24px;"><div style="font-size:0.7rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#c9a84c;margin-bottom:6px;">Notes</div><p style="margin:0;font-size:0.88rem;color:#3a2e0f;">${escapeHtml(notes)}</p></div>` : ''}

      <a href="${quoteUrl}" style="display:block;text-align:center;background:#c9a84c;color:#0d1a10;font-weight:800;font-size:0.98rem;padding:16px 28px;border-radius:8px;text-decoration:none;margin-bottom:18px;">
        Review &amp; Approve Quote →
      </a>

      <p style="font-size:0.78rem;color:#888;margin-top:20px;text-align:center;">
        Questions? Reply to this email or call <a href="tel:+15125604129" style="color:#888;">512-560-4129</a><br>
        GreenGuard USA · Austin TX
      </p>
    </div>`

  await resend.emails.send({
    from: `GreenGuard USA <${FROM}>`,
    to,
    bcc: ['admin@greenguard-usa.com', 'bruce@greenguard-usa.com'],
    subject: `Your GreenGuard Service Quote${name ? ` — ${name}` : ''}`,
    html,
  })

  // Tag the customer's HubSpot contact so the follow-up cron can track this quote.
  // Auto-create the contact if it doesn't exist yet (new prospect from quote flow).
  try {
    let contact = await findContactByEmail(to).catch(() => null)
    if (!contact?.id) {
      const created = await upsertContact({ email: to, name: name || '', address: customerAddress })
      contact = { id: created.id }
    }
    const amount = (oneTimeTotal || 0) + (taxAmount || 0)
    await addNote(
      contact.id,
      `[QUOTE-SENT] jti=${jti} email=${to} amount=${amount.toFixed(2)} monthly=${(recurringTotal || 0).toFixed(2)} url=${quoteUrl} sent=${new Date().toISOString()}`
    )
  } catch (err) {
    console.error('send-quote HubSpot logging failed:', err.message)
  }

  res.status(200).json({ ok: true, jti })
}
