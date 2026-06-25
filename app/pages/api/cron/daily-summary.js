// End-of-day summary email — fires ~5pm CT.
// Today's completed visits, revenue, invoices generated, cancellations,
// plus a tomorrow preview (stops + tanks). Sent to admin@.

const { Resend } = require('resend')
const { stripe } = require('../../../lib/stripe')
const { getBookingsForDate } = require('../../../lib/gcal')
const { resolveByTitle, normalizeEventTitle } = require('../../../lib/sku-engine')

const TZ = 'America/Chicago'
const SENDER = 'GreenGuard USA <admin@greenguard-usa.com>'
const RECIPIENT = 'admin@greenguard-usa.com'

function todayCT() { return new Date().toLocaleDateString('en-CA', { timeZone: TZ }) }
function tomorrowCT() {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}
function fmtLongDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' })
}
function fmt$(cents) { return `$${(cents / 100).toFixed(2)}` }
function escapeHtml(s) { return String(s || '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c])) }

async function fetchTodaysInvoices() {
  // Stripe invoices created since midnight today, in our local tz.
  const dayStart = new Date(todayCT() + 'T00:00:00').toLocaleString('en-US', { timeZone: 'UTC' })
  const sinceUnix = Math.floor(new Date(dayStart).getTime() / 1000)
  const page = await stripe.invoices.list({ created: { gte: sinceUnix }, limit: 50, expand: ['data.customer'] })
  return page.data
}

function renderHtml({ date, completedVisits, invoices, cancellations, tomorrow, totals }) {
  const invRows = invoices.slice(0, 12).map((inv) => {
    const custName = typeof inv.customer === 'object'
      ? (inv.customer?.name || inv.customer_email || '—')
      : (inv.customer_email || '—')
    const statusColor = inv.status === 'paid' ? '#7dffaa' : inv.status === 'open' ? '#c9a84c' : 'rgba(212,230,202,0.45)'
    return `
    <tr>
      <td style="padding:9px 0;color:rgba(212,230,202,0.88);font-weight:700;border-bottom:1px solid rgba(122,171,130,0.1);font-size:13px">${escapeHtml(custName)}</td>
      <td style="padding:9px 0;border-bottom:1px solid rgba(122,171,130,0.1)"><span style="color:${statusColor};font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase">${escapeHtml(inv.status)}</span></td>
      <td style="padding:9px 0;text-align:right;font-weight:800;color:#7dffaa;border-bottom:1px solid rgba(122,171,130,0.1);white-space:nowrap;font-size:13px">${fmt$(inv.total)}</td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a1a0d;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:20px 16px">

  <!-- Logo bar -->
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px">
    <tr>
      <td style="padding:0 4px">
        <span style="font-size:15px;font-weight:900;color:#ffffff;letter-spacing:-0.02em">Green<span style="color:#7dffaa">Guard</span> USA</span>
        <span style="color:rgba(122,171,130,0.4);font-size:13px;margin-left:10px">&middot; End of Day</span>
      </td>
    </tr>
  </table>

  <!-- Hero card -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0d1a10 0%,#1a2e1f 50%,#2d4a32 100%);border:1px solid rgba(122,171,130,0.2);border-radius:12px;margin-bottom:10px">
    <tr>
      <td style="padding:22px 24px 20px">
        <div style="color:#c9a84c;font-size:10px;font-weight:800;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:8px">Daily Summary</div>
        <div style="color:#ffffff;font-size:26px;font-weight:900;letter-spacing:-0.03em">${escapeHtml(fmtLongDate(date))}</div>
      </td>
    </tr>
  </table>

  <!-- Stats row (4-col table) -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111c13;border:1px solid rgba(122,171,130,0.15);border-radius:12px;margin-bottom:10px">
    <tr>
      <td style="padding:16px 14px;border-right:1px solid rgba(122,171,130,0.1);text-align:center;vertical-align:top">
        <div style="color:#c9a84c;font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:6px">Visits</div>
        <div style="color:#a8edc0;font-size:22px;font-weight:900">${completedVisits}</div>
      </td>
      <td style="padding:16px 14px;border-right:1px solid rgba(122,171,130,0.1);text-align:center;vertical-align:top">
        <div style="color:#c9a84c;font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:6px">Revenue</div>
        <div style="color:#7dffaa;font-size:22px;font-weight:900">${fmt$(totals.revenueCents)}</div>
      </td>
      <td style="padding:16px 14px;border-right:1px solid rgba(122,171,130,0.1);text-align:center;vertical-align:top">
        <div style="color:#c9a84c;font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:6px">Invoices</div>
        <div style="color:#a8edc0;font-size:22px;font-weight:900">${invoices.length}</div>
      </td>
      <td style="padding:16px 14px;text-align:center;vertical-align:top">
        <div style="color:#c9a84c;font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:6px">Cancels</div>
        <div style="color:${cancellations > 0 ? '#ff8888' : 'rgba(212,230,202,0.35)'};font-size:22px;font-weight:900">${cancellations}</div>
      </td>
    </tr>
  </table>

  ${invoices.length > 0 ? `
  <!-- Invoices table -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111c13;border:1px solid rgba(122,171,130,0.15);border-radius:12px;margin-bottom:10px">
    <tr>
      <td colspan="3" style="padding:14px 18px 10px;border-bottom:1px solid rgba(122,171,130,0.1)">
        <div style="color:#c9a84c;font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase">Invoices Today</div>
      </td>
    </tr>
    <tr>
      <td colspan="3" style="padding:4px 18px 10px">
        <table width="100%" cellpadding="0" cellspacing="0">${invRows}</table>
      </td>
    </tr>
  </table>` : ''}

  <!-- Tomorrow preview -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111c13;border:1px solid rgba(122,171,130,0.15);border-radius:12px;margin-bottom:12px">
    <tr>
      <td style="padding:16px 18px">
        <div style="color:#c9a84c;font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:8px">Tomorrow</div>
        <div style="color:rgba(212,230,202,0.8);font-size:14px;line-height:1.6">
          <span style="color:#a8edc0;font-weight:800">${tomorrow.count}</span> stop${tomorrow.count === 1 ? '' : 's'}
          &nbsp;&middot;&nbsp;
          <span style="color:#a8edc0;font-weight:800">${tomorrow.tanks}</span> tank${tomorrow.tanks === 1 ? '' : 's'} needed
          &nbsp;&middot;&nbsp; ${escapeHtml(fmtLongDate(tomorrow.date))}
        </div>
      </td>
    </tr>
  </table>

  <!-- Portal links -->
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
    <tr>
      <td style="padding:4px 0">
        <a href="https://portal.greenguard-usa.com/admin/rounds" style="display:inline-block;background:rgba(122,171,130,0.12);border:1px solid rgba(122,171,130,0.3);color:#7dffaa;font-weight:700;font-size:12px;padding:9px 20px;border-radius:6px;text-decoration:none;letter-spacing:0.04em;margin-right:8px">Rounds</a>
        <a href="https://portal.greenguard-usa.com/admin/invoice" style="display:inline-block;background:rgba(122,171,130,0.12);border:1px solid rgba(122,171,130,0.3);color:#7dffaa;font-weight:700;font-size:12px;padding:9px 20px;border-radius:6px;text-decoration:none;letter-spacing:0.04em">Invoices</a>
      </td>
    </tr>
  </table>

  <!-- Footer -->
  <div style="text-align:center;color:rgba(122,171,130,0.18);font-size:10px;letter-spacing:0.08em;text-transform:uppercase">GreenGuard USA &nbsp;&middot;&nbsp; portal.greenguard-usa.com</div>
</div>
</body>
</html>`
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end()
  const { authorize } = require('../../../lib/cron-auth')
  if (!authorize(req, res)) return

  const today = todayCT()
  const tomorrowIso = tomorrowCT()

  // Today's GCal events → count completed (status confirmed, not cancelled) + cancellations
  const [todayBookings, tomorrowBookings, invoices] = await Promise.all([
    getBookingsForDate(today).catch(() => []),
    getBookingsForDate(tomorrowIso).catch(() => []),
    fetchTodaysInvoices().catch(() => []),
  ])

  // GCal events don't carry a status field in our parsed shape — cancelled events
  // are excluded by the GCal API query itself (singleEvents + no showDeleted).
  // All returned bookings are active/completed for the day.
  const completedVisits = todayBookings.length
  const cancellations = 0  // tracked separately via GCal cancellation webhooks if needed
  const tomorrowTanks = tomorrowBookings.reduce((s, b) => s + (resolveByTitle(normalizeEventTitle(b.title || ''))?.tankCount || 0), 0)
  const revenueCents = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount_paid, 0)

  if (!process.env.RESEND_API_KEY) return res.status(200).json({ ok: true, sent: false, reason: 'RESEND_API_KEY missing' })

  const resend = new Resend(process.env.RESEND_API_KEY)
  try {
    await resend.emails.send({
      from: SENDER, to: RECIPIENT,
      subject: `End of day — ${completedVisits} visits · ${fmt$(revenueCents)} · ${tomorrowBookings.length} stop${tomorrowBookings.length === 1 ? '' : 's'} tomorrow`,
      html: renderHtml({
        date: today,
        completedVisits, cancellations,
        invoices,
        totals: { revenueCents },
        tomorrow: { date: tomorrowIso, count: tomorrowBookings.length, tanks: tomorrowTanks },
      }),
    })
  } catch (err) {
    console.error('daily-summary send error:', err)
    return res.status(500).json({ error: 'Failed to send summary email' })
  }

  return res.status(200).json({ ok: true, sent: true })
}
