// Daily 7am "morning brief" — cash position, upcoming charges, A/R risk,
// vendor anomalies, churn signals.

const { q } = require('./db')
const { stripe } = require('./stripe')

async function stripeBalance() {
  const b = await stripe.balance.retrieve()
  const available = b.available.reduce((s, x) => s + x.amount, 0)
  const pending   = b.pending.reduce((s, x) => s + x.amount, 0)
  return { available, pending }
}

async function upcomingRecurringCharges() {
  // Active subscriptions × their unit price = projected next billing
  const subs = await stripe.subscriptions.list({ status: 'active', limit: 100, expand: ['data.items.data.price'] })
  let total = 0; const lines = []
  for (const s of subs.data) {
    const amount = s.items.data.reduce((sum, it) => sum + (it.price?.unit_amount || 0) * (it.quantity || 1), 0)
    total += amount
    lines.push({ id: s.id, amount, customer: s.customer, status: s.status, next: s.current_period_end })
  }
  return { total, count: subs.data.length, lines }
}

async function arOverdue() {
  const open = await stripe.invoices.list({ status: 'open', limit: 100, expand: ['data.customer'] })
  const now = Date.now()
  const aged = []
  for (const inv of open.data) {
    const age = (now - inv.created * 1000) / 86400000
    if (age > 30) {
      const c = inv.customer
      aged.push({
        id: inv.id,
        name: (typeof c === 'object' ? c?.name || c?.email : null) || inv.customer_email || '—',
        amount_cents: inv.amount_due,
        age_days: Math.round(age),
        url: inv.hosted_invoice_url,
      })
    }
  }
  aged.sort((a, b) => b.age_days - a.age_days)
  return aged
}

async function vendorAnomalies() {
  // Expenses (negative amounts) this month vs trailing-3-month average per category.
  const r = await q(`
    WITH this_month AS (
      SELECT category_label, ABS(SUM(amount_cents))::bigint AS spent
      FROM transactions
      WHERE amount_cents < 0
        AND occurred_at >= DATE_TRUNC('month', NOW())
        AND category_label LIKE 'Expense:%'
      GROUP BY category_label
    ),
    avg_3mo AS (
      SELECT category_label, ABS(SUM(amount_cents))::bigint/3 AS avg_monthly
      FROM transactions
      WHERE amount_cents < 0
        AND occurred_at >= DATE_TRUNC('month', NOW()) - INTERVAL '3 months'
        AND occurred_at <  DATE_TRUNC('month', NOW())
        AND category_label LIKE 'Expense:%'
      GROUP BY category_label
    )
    SELECT t.category_label, t.spent, a.avg_monthly,
           ROUND(100.0 * (t.spent - COALESCE(a.avg_monthly,0)) / NULLIF(COALESCE(a.avg_monthly, 1), 0), 0) AS pct_change
    FROM this_month t
    LEFT JOIN avg_3mo a USING (category_label)
    WHERE t.spent > COALESCE(a.avg_monthly, 0) * 1.5
      AND t.spent > 2000  -- $20 floor to dodge noise
    ORDER BY pct_change DESC NULLS LAST
  `)
  return r.rows
}

async function churnRisk() {
  // Customers with an active sub who haven't had a positive transaction
  // in 50+ days — early warning a charge may have failed silently.
  const r = await q(`
    SELECT customer_email, customer_name, MAX(occurred_at) AS last_paid
    FROM transactions
    WHERE customer_email IS NOT NULL AND amount_cents > 0
    GROUP BY customer_email, customer_name
    HAVING MAX(occurred_at) < NOW() - INTERVAL '50 days'
    ORDER BY last_paid DESC
    LIMIT 25
  `)
  return r.rows.map((row) => ({
    customer: row.customer_name || row.customer_email,
    email: row.customer_email,
    last_paid: row.last_paid,
    days_since: Math.floor((Date.now() - new Date(row.last_paid).getTime()) / 86400000),
  }))
}

function dollar(cents) { return '$' + (Math.abs(cents) / 100).toFixed(2) }
function fmtDate(d) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }

async function buildDailyBrief() {
  const [bal, sub, ar, anom, churn] = await Promise.all([
    stripeBalance(),
    upcomingRecurringCharges(),
    arOverdue(),
    vendorAnomalies(),
    churnRisk(),
  ])

  const projectedEOM = bal.available + bal.pending + sub.total - ar.reduce((s, r) => s + r.amount_cents * 0.3, 0)  // assume 30% A/R aged collects

  const arHtml = ar.length === 0 ? '<p style="color:#0d8a3c;">✓ No invoices over 30 days old.</p>' : `
    <table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
      ${ar.slice(0, 10).map((r) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.name}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:${r.age_days > 60 ? '#a02020' : '#cc6600'};font-weight:700;">${r.age_days}d</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:700;">${dollar(r.amount_cents)}</td>
      </tr>`).join('')}
    </table>`

  const anomHtml = anom.length === 0 ? '<p style="color:#0d8a3c;">✓ Spending within normal range.</p>' : `
    <table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
      ${anom.map((r) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.category_label}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${dollar(r.spent)} <span style="color:#888;">(avg ${dollar(r.avg_monthly || 0)})</span></td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#a02020;font-weight:700;">+${r.pct_change}%</td>
      </tr>`).join('')}
    </table>`

  const churnHtml = churn.length === 0 ? '<p style="color:#0d8a3c;">✓ No silent-churn signals.</p>' : `
    <table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
      ${churn.slice(0, 10).map((r) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.customer}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#cc6600;font-weight:700;">${r.days_since}d ago</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:0.78rem;color:#888;">${r.email}</td>
      </tr>`).join('')}
    </table>`

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1a2e1f;">
      <div style="background:#0d1a10;border-radius:10px;padding:18px 22px;margin-bottom:20px;">
        <h1 style="color:#7dffaa;font-size:1.2rem;margin:0;">Morning Brief · GreenGuard</h1>
        <p style="color:rgba(212,230,202,0.55);font-size:0.78rem;margin:4px 0 0;letter-spacing:0.1em;text-transform:uppercase;">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      <div style="background:#f7fbf6;border:1px solid #e3eedb;border-radius:8px;padding:14px 16px;margin-bottom:16px;">
        <div style="font-size:0.7rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#0d8a3c;margin-bottom:8px;">Cash Position</div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Stripe available</span><strong>${dollar(bal.available)}</strong></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;color:#666;"><span>Stripe pending</span><span>${dollar(bal.pending)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;color:#666;"><span>Active subs (monthly inflow)</span><span>${dollar(sub.total)} × ${sub.count}</span></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0 0;border-top:1px solid #c4dec9;margin-top:6px;font-weight:800;color:#0d8a3c;"><span>Projected position EOM</span><span>${dollar(projectedEOM)}</span></div>
      </div>

      <h2 style="font-size:0.72rem;letter-spacing:0.12em;text-transform:uppercase;color:#666;margin:20px 0 6px;">⚠ Aged A/R (30+ days)</h2>
      ${arHtml}

      <h2 style="font-size:0.72rem;letter-spacing:0.12em;text-transform:uppercase;color:#666;margin:20px 0 6px;">📈 Vendor / Expense Anomalies (vs 3-mo avg)</h2>
      ${anomHtml}

      <h2 style="font-size:0.72rem;letter-spacing:0.12em;text-transform:uppercase;color:#666;margin:20px 0 6px;">🚪 Silent-Churn Watch (no payment 50+ days)</h2>
      ${churnHtml}

      <p style="margin-top:24px;font-size:0.75rem;color:#888;">
        Generated by GreenGuard Books · <a href="https://portal.greenguard-usa.com/admin/books" style="color:#888;">Open Books</a> · <a href="https://portal.greenguard-usa.com/admin/books/chat" style="color:#888;">Ask</a>
      </p>
    </div>`

  return { html, bal, sub, ar, anomalies: anom, churnRisk: churn, projectedEOM }
}

module.exports = { buildDailyBrief }
