// Annual customer review email.
//
// Runs weekly. For every Stripe customer whose FIRST paid invoice was
// between 11 months ago and 11 months + 7 days ago, send a "year in review"
// email summarizing their visits, tanks, and inviting renewal/feedback.
// Idempotent via Stripe customer metadata flag `annual_review_sent_at`.
//
// Auth: x-cron-key header matching CRON_SECRET.
// Triggered by .github/workflows/cron-annual-review.yml (Mondays).

const { stripe } = require('../../../lib/stripe')
const { Resend } = require('resend')

const SENDER = 'GreenGuard USA <admin@greenguard-usa.com>'
const REVIEW_URL = 'https://g.page/r/CW33u4YWYh17EAE/review'

function fmtDate(ts) {
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

async function findEligibleCustomers() {
  // Eligible: customer with paid invoices, oldest one ~11 months ago, not
  // yet flagged annual_review_sent_at. We sample broadly (200 customers)
  // and filter — small enough to not require pagination heroics.
  const eleven = 11 * 30 * 86400 * 1000
  const twelve = 12 * 30 * 86400 * 1000
  const now = Date.now()
  const eligible = []

  const customers = await stripe.customers.list({ limit: 100 })
  for (const cust of customers.data) {
    if (cust.metadata?.annual_review_sent_at) continue
    if (!cust.email) continue

    const invs = await stripe.invoices.list({ customer: cust.id, status: 'paid', limit: 100 })
    if (invs.data.length === 0) continue

    // First paid invoice
    const sortedAsc = [...invs.data].sort((a, b) => (a.status_transitions?.paid_at || a.created) - (b.status_transitions?.paid_at || b.created))
    const first = sortedAsc[0]
    const firstPaidAt = (first.status_transitions?.paid_at || first.created) * 1000
    const age = now - firstPaidAt
    if (age < eleven || age > twelve) continue

    const totalPaid = invs.data.reduce((s, i) => s + (i.amount_paid || 0), 0) / 100
    eligible.push({
      customer: cust,
      firstPaidAt: first.status_transitions?.paid_at || first.created,
      visitCount: invs.data.length,
      totalPaid,
    })
  }
  return eligible
}

function buildEmail({ customer, firstPaidAt, visitCount, totalPaid }) {
  const name = (customer.name || '').split(' ')[0] || 'there'
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:540px;margin:0 auto;padding:24px 18px;color:#1a2e1f;">
      <div style="background:#0d1a10;border-radius:10px;padding:18px 22px;margin-bottom:24px;">
        <h1 style="color:#7dffaa;font-size:1.2rem;margin:0;letter-spacing:-0.01em;">GreenGuard USA</h1>
        <p style="color:rgba(212,230,202,0.55);font-size:0.78rem;margin:4px 0 0;letter-spacing:0.1em;text-transform:uppercase;">Your year in review</p>
      </div>

      <h2 style="font-size:1.1rem;margin:0 0 14px;">Hi ${name} — a quick look back at your year with us</h2>

      <div style="background:#f7fbf6;border:1px solid #e3eedb;border-radius:10px;padding:18px;margin:0 0 18px;">
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e3eedb;">
          <span>Customer since</span><strong>${fmtDate(firstPaidAt)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e3eedb;">
          <span>Visits this year</span><strong>${visitCount}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;">
          <span>Total invested in your backyard</span><strong>$${totalPaid.toFixed(2)}</strong>
        </div>
      </div>

      <p style="font-size:0.92rem;line-height:1.5;color:#3a3a3a;margin:0 0 16px;">
        Thank you for trusting us with your mosquito control this year. We've been honored to be part of your home and look forward to another season ahead.
      </p>

      <p style="font-size:0.92rem;line-height:1.5;color:#3a3a3a;margin:0 0 22px;">
        If you've been happy with the service, a quick Google review goes a long way for a small Austin business like ours. If something hasn't been right, reply to this email and we'll make it right.
      </p>

      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <a href="${REVIEW_URL}" style="flex:1 1 200px;text-align:center;background:#c9a84c;color:#0d1a10;font-weight:800;padding:14px 18px;border-radius:8px;text-decoration:none;">
          ⭐ Leave a Google review
        </a>
        <a href="mailto:admin@greenguard-usa.com?subject=Re: my year with GreenGuard" style="flex:1 1 200px;text-align:center;background:transparent;color:#0d8a3c;font-weight:700;padding:14px 18px;border-radius:8px;text-decoration:none;border:1px solid #0d8a3c;">
          ✉ Reply with feedback
        </a>
      </div>

      <p style="font-size:0.75rem;color:#888;margin:24px 0 0;text-align:center;">
        GreenGuard USA · 1519 Parkway, Austin TX 78703 · 512-560-4129
      </p>
    </div>`
  return {
    from: SENDER,
    to: customer.email,
    subject: `${name}, here's your year with GreenGuard`,
    html,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (req.headers['x-cron-key'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const results = { eligible: 0, sent: 0, errors: [] }

  try {
    const list = await findEligibleCustomers()
    results.eligible = list.length

    for (const item of list) {
      try {
        await resend.emails.send(buildEmail(item))
        await stripe.customers.update(item.customer.id, {
          metadata: { ...item.customer.metadata, annual_review_sent_at: new Date().toISOString() },
        }).catch(() => {})
        results.sent++
      } catch (e) {
        results.errors.push({ email: item.customer.email, error: e.message })
      }
    }
    return res.status(200).json(results)
  } catch (e) {
    return res.status(500).json({ error: e.message, ...results })
  }
}
