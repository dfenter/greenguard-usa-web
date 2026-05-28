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
  const invRows = invoices.slice(0, 12).map((inv) => `
    <tr style="border-top:1px solid #e7e7e7">
      <td style="padding:7px 8px;color:#1a2e1f;font-weight:700">${escapeHtml(typeof inv.customer === 'object' ? (inv.customer?.name || inv.customer_email || '—') : (inv.customer_email || '—'))}</td>
      <td style="padding:7px 8px;color:#666;font-size:12px">${escapeHtml(inv.status)}</td>
      <td style="padding:7px 8px;text-align:right;font-weight:700;color:#0d8a3c;white-space:nowrap">${fmt$(inv.total)}</td>
    </tr>`).join('')

  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:640px;margin:0 auto;color:#1a2e1f">
    <div style="background:#0d1a10;color:#7dffaa;padding:14px 18px;border-radius:8px 8px 0 0">
      <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700">GreenGuard USA · End of day</div>
      <div style="font-size:20px;font-weight:900;margin-top:2px;color:#fff">${escapeHtml(fmtLongDate(date))}</div>
    </div>
    <div style="border:1px solid #ddd;border-top:none;padding:18px;background:#fff">
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px">
        ${[
          ['Visits done', completedVisits],
          ['Revenue', fmt$(totals.revenueCents)],
          ['Invoices', invoices.length],
          ['Cancels', cancellations],
        ].map(([k, v]) => `
          <div style="flex:1;min-width:120px;padding:12px;background:#f6f9f7;border-radius:6px">
            <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#888;font-weight:700">${k}</div>
            <div style="font-size:18px;font-weight:900;color:#1a2e1f;margin-top:4px">${v}</div>
          </div>`).join('')}
      </div>

      ${invoices.length > 0 ? `
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#888;font-weight:700;margin-bottom:6px">Invoices today</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:18px"><tbody>${invRows}</tbody></table>
      ` : ''}

      <div style="background:#0d1a1015;padding:14px;border-radius:6px">
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#888;font-weight:700;margin-bottom:4px">Tomorrow</div>
        <div style="font-size:14px;color:#1a2e1f">
          <strong>${tomorrow.count}</strong> stop${tomorrow.count === 1 ? '' : 's'}
          · <strong>${tomorrow.tanks}</strong> tank${tomorrow.tanks === 1 ? '' : 's'} needed
          · ${escapeHtml(fmtLongDate(tomorrow.date))}
        </div>
      </div>

      <p style="margin:14px 0 0;font-size:11px;color:#aaa">Full detail on portal.greenguard-usa.com — /admin/rounds for visits, /admin/invoices for billing.</p>
    </div>
  </div>`
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end()
  if (req.headers['x-cron-key'] !== process.env.CRON_SECRET && req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const today = todayCT()
  const tomorrowIso = tomorrowCT()

  // Today's GCal events → count completed (status confirmed, not cancelled) + cancellations
  const [todayBookings, tomorrowBookings, invoices] = await Promise.all([
    getBookingsForDate(today).catch(() => []),
    getBookingsForDate(tomorrowIso).catch(() => []),
    fetchTodaysInvoices().catch(() => []),
  ])

  const cancellations = todayBookings.filter((b) => b.status === 'cancelled').length
  const completedVisits = todayBookings.filter((b) => b.status !== 'cancelled').length
  const tomorrowTanks = tomorrowBookings.reduce((s, b) => s + (resolveByTitle(normalizeEventTitle(b.title || ''))?.tankCount || 0), 0)
  const revenueCents = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount_paid, 0)

  if (!process.env.RESEND_API_KEY) return res.status(200).json({ ok: true, sent: false, reason: 'RESEND_API_KEY missing' })

  const resend = new Resend(process.env.RESEND_API_KEY)
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

  return res.status(200).json({ ok: true, sent: true })
}
