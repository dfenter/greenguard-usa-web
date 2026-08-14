const { getSessionFromRequest, isAdminEmail, newJti } = require('../../../lib/auth')
const { SignJWT } = require('jose')
const { sendEmail, escapeHtml } = require('../../../lib/email')
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

// Two-column "label … amount" row. Flexbox doesn't render in most email
// clients (Outlook, Gmail mobile, iOS Mail), which is why labels and totals
// were smushing together. Use a <table> so the right column stays right.
function spreadRow({ label, amount, color = '#1a2e1f', weight = 400, borderTop = false, size = '0.9rem', pad = '4px 0' }) {
  const borderStyle = borderTop ? `border-top:2px solid ${color};margin-top:6px;` : ''
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;${borderStyle}border-collapse:collapse;font-size:${size};color:${color};font-weight:${weight};">
    <tr>
      <td style="padding:${pad};text-align:left;">${escapeHtml(label)}</td>
      <td style="padding:${pad};text-align:right;white-space:nowrap;">${escapeHtml(amount)}</td>
    </tr>
  </table>`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const {
    to, name, lineItems = [], total, taxRate = 0, taxAmount = 0, shippingTotal = 0, notes,
    customerAddress, serviceLines = [], addonLines = [], productLines = [],
    recurringTotal = 0, oneTimeTotal = 0, serviceDate, machPins = [],
    options = null, localDelivery = false,
  } = req.body || {}
  if (!to) return res.status(400).json({ error: 'to required' })

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'

  // Signed JWT for the public quote page; jti uniquely tags this quote version
  // so the follow-up agent can track engagement and skip after checkout.
  const jti = newJti()
  const token = await new SignJWT({
    customerName: name, customerEmail: to, customerAddress,
    serviceLines, addonLines, productLines,
    options: options || null,
    localDelivery: localDelivery === true,
    total, recurringTotal, oneTimeTotal, taxRate, taxAmount,
    shippingTotal: shippingTotal || 0, serviceDate, machPins, type: 'quote',
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
  const dueToday = oneTimeTotal + taxAmount + parseFloat(shippingTotal || 0)
  const monthlyAfter = recurringTotal

  const sectionStyle = 'margin:0 0 24px;padding:16px 18px;background:#f7fbf6;border-radius:10px;border:1px solid #e3eedb;'
  const sectionTitle = (color) => `font-size:0.7rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${color};margin:0 0 10px;`

  // Which system photo headlines the proposal — inferred from the line labels.
  function systemPhotoUrl() {
    const labels = [...serviceLines, ...(options?.rental?.serviceLines || [])].map((l) => l?.label || '').join(' ')
    if (/mosqitter/i.test(labels)) return `${APP_URL}/system-icons/mosqitter.jpg`
    if (/non-co/i.test(labels)) return `${APP_URL}/system-icons/biogents-nonco2.webp`
    if (/tank/i.test(labels) && !/trap|rental/i.test(labels)) return `${APP_URL}/system-icons/tank.jpeg`
    return `${APP_URL}/system-icons/biogents-co2.jpg`
  }

  // One option card (Rental or Purchase) for the comparison email. Table-based
  // so it renders correctly in Outlook / Gmail / iOS Mail.
  function optionCardHtml({ eyebrow, title, tagline, opt, accent, accentSoft, badge }) {
    const allOpt = [...(opt.serviceLines || []), ...(opt.productLines || []), ...(opt.addonLines || [])]
    const monthly = allOpt.filter((l) => l.recurring && (l.amount || 0) > 0)
    const oneTime = allOpt.filter((l) => !l.recurring && (l.amount || 0) > 0)
    const rows = (lines, suffix) => lines.map((l) => `
      <tr>
        <td style="padding:7px 0;border-bottom:1px solid rgba(0,0,0,0.05);color:#444;font-size:0.85rem;font-family:Arial,sans-serif;">${escapeHtml(l.label)}</td>
        <td style="padding:7px 0;border-bottom:1px solid rgba(0,0,0,0.05);text-align:right;font-weight:700;color:${accent};font-size:0.85rem;white-space:nowrap;font-family:Arial,sans-serif;">${fmt$(l.amount)}${suffix}</td>
      </tr>`).join('')
    return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
      <tr><td style="border:2px solid ${accentSoft};border-radius:12px;padding:20px 22px;background:#ffffff;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${accent};font-family:Arial,sans-serif;">${eyebrow}</td>
          ${badge ? `<td align="right"><span style="display:inline-block;background:#c9a84c;color:#111800;font-size:9px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;padding:4px 10px;border-radius:20px;font-family:Arial,sans-serif;">${badge}</span></td>` : ''}
        </tr></table>
        <p style="margin:6px 0 2px;font-size:19px;font-weight:900;color:#111f14;font-family:Arial,sans-serif;">${title}</p>
        <p style="margin:0 0 14px;font-size:13px;color:#6b7f6e;line-height:1.55;font-family:Arial,sans-serif;">${tagline}</p>
        <p style="margin:0;font-size:26px;font-weight:900;color:${accent};font-family:Arial,sans-serif;">${fmt$(opt.recurringTotal)}<span style="font-size:13px;color:#6b7f6e;font-weight:700;"> /month</span></p>
        <p style="margin:2px 0 8px;font-size:13px;font-weight:700;color:#3a4b3e;font-family:Arial,sans-serif;">${fmt$(opt.total)} due today <span style="font-weight:400;color:#8a9a8d;">(first month${(opt.oneTimeTotal || 0) > 0 ? ' + equipment' : ''}, tax included)</span></p>
        ${localDelivery
          ? `<p style="margin:0 0 14px;"><span style="display:inline-block;background:#eaf6ec;border:1px solid #bfe3c8;color:#0d8a3c;font-size:11px;font-weight:800;padding:4px 12px;border-radius:20px;font-family:Arial,sans-serif;">&#128666; Free Local Delivery</span></p>`
          : (opt.shippingTotal || 0) > 0
            ? `<p style="margin:0 0 14px;font-size:12px;color:#8a9a8d;font-family:Arial,sans-serif;">&#128666; Includes ${fmt$(opt.shippingTotal)} shipping</p>`
            : '<p style="margin:0 0 6px;"></p>'}
        ${monthly.length ? `<p style="margin:0 0 4px;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#8a9a8d;font-family:Arial,sans-serif;">Monthly service</p><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:${oneTime.length ? '12px' : '0'};">${rows(monthly, '/mo')}</table>` : ''}
        ${oneTime.length ? `<p style="margin:0 0 4px;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#8a9a8d;font-family:Arial,sans-serif;">Yours to keep (one-time)</p><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows(oneTime, '')}</table>` : ''}
      </td></tr>
    </table>`
  }

  const monthlyHtml = recurringLines.length > 0 ? `
    <div style="${sectionStyle}">
      <div style="${sectionTitle('#0d8a3c')}">Monthly Recurring</div>
      <table style="width:100%;border-collapse:collapse;">${lineRows(recurringLines, '#0d8a3c')}</table>
      ${spreadRow({ label: 'Total per month', amount: `${fmt$(monthlyAfter)}/mo`, color: '#0d8a3c', weight: 800, borderTop: true, pad: '10px 0 0' })}
    </div>` : ''

  const oneTimeHtml = oneTimeLines.length > 0 ? `
    <div style="${sectionStyle}background:#f6f9fb;border-color:#dde6ed;">
      <div style="${sectionTitle('#1565c0')}">One-Time Charges (Due With First Visit)</div>
      <table style="width:100%;border-collapse:collapse;">${lineRows(oneTimeLines, '#1565c0')}</table>
      ${parseFloat(shippingTotal || 0) > 0
        ? spreadRow({ label: '🚚 Shipping', amount: fmt$(shippingTotal), color: '#666', size: '0.85rem', pad: '6px 0' })
        : (localDelivery ? spreadRow({ label: '🚚 Delivery', amount: 'Free Local Delivery', color: '#0d8a3c', weight: 700, size: '0.85rem', pad: '6px 0' }) : '')}
      ${taxAmount > 0 ? spreadRow({ label: `Tax (${taxRate}%)`, amount: fmt$(taxAmount), color: '#666', size: '0.85rem', pad: '6px 0' }) : ''}
      ${spreadRow({ label: 'Total due with first visit', amount: fmt$(dueToday), color: '#1565c0', weight: 800, borderTop: true, pad: '10px 0 0' })}
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
      <div style="${sectionTitle('#c9a84c')}">First Available Service Date</div>
      <p style="margin:0;color:#3a2e0f;font-size:1rem;font-weight:700;">${formatServiceDate(serviceDate)}</p>
      <p style="margin:6px 0 0;color:#776644;font-size:0.82rem;">We confirm your exact time window as soon as you approve the quote.</p>
    </div>` : ''

  // Dual-option comparison — hero photo, both option cards, break-even note.
  let comparisonHtml = ''
  if (options?.rental && options?.purchase) {
    const r = options.rental, p = options.purchase
    const monthlySavings = (r.recurringTotal || 0) - (p.recurringTotal || 0)
    const breakEven = monthlySavings > 0 ? Math.ceil((p.oneTimeTotal || 0) / monthlySavings) : null
    comparisonHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
      <tr><td style="border-radius:12px;overflow:hidden;">
        <img src="${systemPhotoUrl()}" alt="Your GreenGuard mosquito control system" width="524" style="display:block;width:100%;max-width:524px;border-radius:12px;border:1px solid #dde8de;" />
      </td></tr>
    </table>
    <p style="margin:0 0 4px;font-size:18px;font-weight:900;color:#111f14;font-family:Arial,sans-serif;">Two ways to get protected</p>
    <p style="margin:0 0 16px;font-size:13px;color:#6b7f6e;font-family:Arial,sans-serif;">Same equipment, same service standard. Compare both and choose on your quote page.</p>
    ${optionCardHtml({
      eyebrow: 'Option 1', title: 'Monthly Rental',
      tagline: 'We provide and maintain everything: trap, CO&#8322; tank, timer, bait and refills. Cancel anytime, nothing to buy.',
      opt: r, accent: '#0d8a3c', accentSoft: '#bfe3c8', badge: 'Most popular',
    })}
    ${optionCardHtml({
      eyebrow: 'Option 2', title: 'Purchase &amp; Service',
      tagline: 'Own your equipment outright. We deliver fresh CO&#8322; every month, hook it up and keep it catching.',
      opt: p, accent: '#1565c0', accentSoft: '#c4d9f0',
    })}
    ${breakEven && breakEven > 1 && breakEven < 61 ? `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr>
      <td bgcolor="#fdfaee" style="border-radius:10px;border:1px solid #f0e3c1;padding:14px 16px;">
        <p style="margin:0;font-size:13px;color:#3a2e0f;line-height:1.6;font-family:Arial,sans-serif;"><strong style="color:#a8842c;">Worth knowing:</strong> purchasing runs ${fmt$(monthlySavings)} less per month, so the equipment pays for itself in about ${breakEven} months. Renting keeps your upfront cost at one month of service.</p>
      </td>
    </tr></table>` : ''}`
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f0f4f1;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0f4f1">
<tr><td align="center" style="padding:32px 16px;">
  <table width="580" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;font-family:Arial,sans-serif;">
    <tr>
      <td align="center" bgcolor="#1a3320" style="border-radius:10px 10px 0 0;padding:24px 32px;">
        <p style="margin:0;font-size:20px;font-weight:900;color:#ffffff;font-family:Arial,sans-serif;">GreenGuard USA</p>
        <p style="margin:4px 0 0;font-size:11px;font-weight:700;color:#7dbc8a;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;">Austin, TX</p>
      </td>
    </tr>
    <tr>
      <td bgcolor="#ffffff" style="padding:28px 28px 8px;border-left:1px solid #dde8de;border-right:1px solid #dde8de;">
        <h2 style="margin:0 0 4px;font-size:20px;font-weight:900;color:#111f14;font-family:Arial,sans-serif;">Service Quote${name ? ` for ${name}` : ''}</h2>
        <p style="margin:0 0 20px;font-size:13px;color:#6b7f6e;font-family:Arial,sans-serif;">This quote is valid for 30 days from today.</p>
        ${serviceDateHtml}
        ${comparisonHtml || `${monthlyHtml}${oneTimeHtml}`}
        ${mapHtml}
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
          <tr>
            <td bgcolor="#1a3320" style="border-radius:8px;padding:16px 20px;">
              <p style="margin:0 0 8px;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#7dbc8a;font-family:Arial,sans-serif;">At a Glance</p>
              ${comparisonHtml ? `
              <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:14px;color:#ffffff;font-family:Arial,sans-serif;padding:3px 0;">Monthly Rental</td><td align="right" style="font-size:14px;font-weight:800;color:#ffffff;white-space:nowrap;font-family:Arial,sans-serif;padding:3px 0;">${fmt$(options.rental.recurringTotal)}/mo &nbsp;&#183;&nbsp; ${fmt$(options.rental.total)} today</td></tr></table>
              <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:14px;color:#a8edc0;font-family:Arial,sans-serif;padding:3px 0;">Purchase &amp; Service</td><td align="right" style="font-size:14px;font-weight:800;color:#a8edc0;white-space:nowrap;font-family:Arial,sans-serif;padding:3px 0;">${fmt$(options.purchase.recurringTotal)}/mo &nbsp;&#183;&nbsp; ${fmt$(options.purchase.total)} today</td></tr></table>` : `
              ${oneTimeLines.length > 0 ? `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:14px;color:#ffffff;font-family:Arial,sans-serif;padding:3px 0;">Due with first visit</td><td align="right" style="font-size:14px;font-weight:800;color:#ffffff;white-space:nowrap;font-family:Arial,sans-serif;padding:3px 0;">${fmt$(dueToday)}</td></tr></table>` : ''}
              ${recurringLines.length > 0 ? `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:14px;color:#a8edc0;font-family:Arial,sans-serif;padding:3px 0;">Then monthly</td><td align="right" style="font-size:14px;font-weight:800;color:#a8edc0;white-space:nowrap;font-family:Arial,sans-serif;padding:3px 0;">${fmt$(monthlyAfter)}/mo</td></tr></table>` : ''}`}
            </td>
          </tr>
        </table>
        ${notes ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;"><tr><td bgcolor="#fdfaee" style="border-radius:8px;border:1px solid #f0e3c1;padding:14px 16px;"><p style="margin:0 0 6px;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">Notes</p><p style="margin:0;font-size:14px;color:#3a2e0f;font-family:Arial,sans-serif;">${escapeHtml(notes)}</p></td></tr></table>` : ''}
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
          <tr>
            <td align="center">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#c9a84c" style="border-radius:6px;">
                    <a href="${quoteUrl}" style="display:inline-block;padding:16px 40px;font-size:16px;font-weight:800;color:#111800;text-decoration:none;font-family:Arial,sans-serif;">${comparisonHtml ? 'Compare Options &amp; Get Started &rarr;' : 'Review &amp; Approve Quote &rarr;'}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 24px;font-size:13px;color:#9aab9c;text-align:center;font-family:Arial,sans-serif;">
          Questions? Reply to this email or call <a href="tel:+15125604129" style="color:#2d6a3f;font-weight:700;">512-560-4129</a>
        </p>
      </td>
    </tr>
    <tr>
      <td align="center" bgcolor="#dde8de" style="border-radius:0 0 10px 10px;padding:18px 32px;border:1px solid #dde8de;border-top:0;">
        <p style="margin:0 0 3px;font-size:12px;font-weight:700;color:#1a3320;font-family:Arial,sans-serif;">GreenGuard USA</p>
        <p style="margin:0;font-size:11px;color:#4a6650;font-family:Arial,sans-serif;">Austin, TX &nbsp;&#183;&nbsp; 512-560-4129 &nbsp;&#183;&nbsp; <a href="https://www.greenguard-usa.com" style="color:#2d6a3f;">greenguard-usa.com</a></p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>`

  await sendEmail({
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
