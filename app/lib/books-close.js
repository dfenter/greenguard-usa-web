// Monthly close package generator.
//
// Builds P&L, A/R aging, sales-tax accrual, and mileage log for a given
// month, packages as HTML, and ships to admin@ via Resend.

const fs = require('fs')
const path = require('path')
const { q } = require('./db')
const { stripe } = require('./stripe')

const TAXABLE_CATEGORIES = new Set([
  'Revenue:Tanks:Refill', 'Revenue:Tanks:DeliveryFee', 'Revenue:Tanks:HookupMaint',
  'Revenue:Tanks:Rental', 'Revenue:Equipment:Sale', 'Revenue:Addons:Other',
])
const TX_RATE_BPS = 825  // 8.25% Austin

// IRS standard business mileage rate (2026 estimate; user can override later)
const IRS_MILEAGE_CENTS = 67

function monthBounds(yyyymm) {
  // yyyymm is like "2026-05"; returns [start, end) as ISO dates
  const [y, m] = yyyymm.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 1))
  return { start, end, label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }
}

async function pnlForMonth({ start, end }) {
  const r = await q(`
    SELECT category_label,
           SUM(amount_cents)::bigint AS net_cents,
           COUNT(*)::int AS n
    FROM transactions
    WHERE occurred_at >= $1 AND occurred_at < $2
    GROUP BY category_label
    ORDER BY SUM(amount_cents) DESC
  `, [start.toISOString(), end.toISOString()])
  const inflow = r.rows.filter((row) => /^Revenue:/.test(row.category_label)).reduce((s, row) => s + Number(row.net_cents), 0)
  const outflow = r.rows.filter((row) => /^(Expense|COGS):/.test(row.category_label)).reduce((s, row) => s + Number(row.net_cents), 0)
  const fees = r.rows.filter((row) => row.category_label === 'Expense:PaymentProcessing').reduce((s, row) => s + Number(row.net_cents), 0)
  return { byCategory: r.rows, inflow, outflow, fees, net: inflow + outflow }
}

async function arAging() {
  // Open Stripe invoices grouped by age bucket.
  const all = await stripe.invoices.list({ status: 'open', limit: 100, expand: ['data.customer'] })
  const now = Date.now()
  const buckets = { '0-30': [], '31-60': [], '61-90': [], '90+': [] }
  for (const inv of all.data) {
    const age = (now - inv.created * 1000) / 86400000
    const bucket = age <= 30 ? '0-30' : age <= 60 ? '31-60' : age <= 90 ? '61-90' : '90+'
    const c = inv.customer
    buckets[bucket].push({
      id: inv.id,
      number: inv.number,
      name: (typeof c === 'object' ? c?.name : null) || (typeof c === 'object' ? c?.email : null) || inv.customer_email || '—',
      amount_cents: inv.amount_due,
      age_days: Math.round(age),
      hosted_url: inv.hosted_invoice_url,
    })
  }
  const totals = Object.fromEntries(Object.entries(buckets).map(([k, rows]) => [k, rows.reduce((s, r) => s + r.amount_cents, 0)]))
  return { buckets, totals }
}

async function salesTaxAccrual({ start, end }) {
  const r = await q(`
    SELECT category_label, SUM(amount_cents)::bigint AS gross_cents
    FROM transactions
    WHERE occurred_at >= $1 AND occurred_at < $2 AND amount_cents > 0
    GROUP BY category_label
  `, [start.toISOString(), end.toISOString()])
  let taxableGross = 0
  const taxableLines = []
  for (const row of r.rows) {
    if (TAXABLE_CATEGORIES.has(row.category_label)) {
      taxableGross += Number(row.gross_cents)
      taxableLines.push({ category: row.category_label, gross_cents: Number(row.gross_cents) })
    }
  }
  const accruedCents = Math.round(taxableGross * TX_RATE_BPS / 10000)
  return { rateBps: TX_RATE_BPS, taxableGross, accruedCents, taxableLines }
}

async function mileageForMonth({ start, end }) {
  // Parse route_plan_*.json files from public/data and sum miles for any
  // date in [start, end). Mileage isn't computed by the optimizer itself —
  // approximate using stop count × 8 miles average (Austin metro) until we
  // wire a real distance matrix log.
  const dir = path.join(process.cwd(), 'public', 'data')
  let files = []
  try { files = fs.readdirSync(dir).filter((f) => /^route_plan_/.test(f)) } catch { return { miles: 0, days: 0, dollarValue: 0 } }
  const datesInMonth = []
  for (const f of files) {
    const plan = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
    for (const day of plan.days || []) {
      const d = new Date(day.date + 'T12:00:00Z')
      if (d >= start && d < end) {
        const stops = day.stops?.length || 0
        if (stops > 0) datesInMonth.push({ date: day.date, stops, est_miles: stops * 8 })
      }
    }
  }
  const totalMiles = datesInMonth.reduce((s, d) => s + d.est_miles, 0)
  const dollarValue = totalMiles * IRS_MILEAGE_CENTS / 100
  return { miles: totalMiles, days: datesInMonth.length, rate_cents: IRS_MILEAGE_CENTS, dollarValue, breakdown: datesInMonth }
}

function dollar(cents) {
  const sign = cents < 0 ? '-' : ''
  return sign + '$' + (Math.abs(cents) / 100).toFixed(2)
}

function renderClosePackageHtml({ label, pnl, ar, tax, mileage }) {
  const pnlRows = pnl.byCategory.map((r) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.category_label || '—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:${r.net_cents >= 0 ? '#0d8a3c' : '#a02020'};">${dollar(r.net_cents)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#888;font-size:0.85em;">${r.n}</td>
    </tr>`).join('')

  const arRows = ['0-30', '31-60', '61-90', '90+'].map((bucket) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${bucket} days</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${ar.buckets[bucket].length} invoice${ar.buckets[bucket].length === 1 ? '' : 's'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:700;color:${bucket === '90+' ? '#a02020' : bucket === '61-90' ? '#cc6600' : '#1a2e1f'};">${dollar(ar.totals[bucket])}</td>
    </tr>`).join('')

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1a2e1f;">
      <div style="background:#0d1a10;border-radius:10px;padding:18px 22px;margin-bottom:24px;">
        <h1 style="color:#7dffaa;font-size:1.3rem;margin:0;">GreenGuard USA — Monthly Close</h1>
        <p style="color:rgba(212,230,202,0.65);font-size:0.85rem;margin:6px 0 0;">${label}</p>
      </div>

      <h2 style="font-size:0.78rem;letter-spacing:0.12em;text-transform:uppercase;color:#666;margin:24px 0 8px;">P&amp;L Summary</h2>
      <div style="background:#f7fbf6;border:1px solid #e3eedb;border-radius:8px;padding:14px 16px;">
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Revenue (inflow)</span><strong style="color:#0d8a3c;">${dollar(pnl.inflow)}</strong></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Expenses + COGS</span><strong style="color:#a02020;">${dollar(pnl.outflow)}</strong></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;color:#888;font-size:0.88rem;"><span>&nbsp;&nbsp;of which Stripe fees</span><span>${dollar(pnl.fees)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0 0;border-top:2px solid #0d8a3c;margin-top:6px;font-weight:800;color:${pnl.net >= 0 ? '#0d8a3c' : '#a02020'};">
          <span>Net</span><span>${dollar(pnl.net)}</span>
        </div>
      </div>

      <h2 style="font-size:0.78rem;letter-spacing:0.12em;text-transform:uppercase;color:#666;margin:24px 0 8px;">P&amp;L by Category</h2>
      <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
        <thead><tr style="background:#f4f4f4;"><th style="padding:6px 10px;text-align:left;">Category</th><th style="padding:6px 10px;text-align:right;">Net</th><th style="padding:6px 10px;text-align:right;">Txns</th></tr></thead>
        <tbody>${pnlRows}</tbody>
      </table>

      <h2 style="font-size:0.78rem;letter-spacing:0.12em;text-transform:uppercase;color:#666;margin:24px 0 8px;">A/R Aging</h2>
      <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
        <thead><tr style="background:#f4f4f4;"><th style="padding:6px 10px;text-align:left;">Bucket</th><th style="padding:6px 10px;text-align:right;">Invoices</th><th style="padding:6px 10px;text-align:right;">Total</th></tr></thead>
        <tbody>${arRows}</tbody>
      </table>

      <h2 style="font-size:0.78rem;letter-spacing:0.12em;text-transform:uppercase;color:#666;margin:24px 0 8px;">Sales Tax Accrued (TX 8.25%)</h2>
      <div style="background:#fdfaee;border:1px solid #f0e3c1;border-radius:8px;padding:14px 16px;">
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Taxable gross</span><strong>${dollar(tax.taxableGross)}</strong></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;font-weight:800;color:#7a5400;"><span>Accrued (set aside)</span><span>${dollar(tax.accruedCents)}</span></div>
      </div>

      <h2 style="font-size:0.78rem;letter-spacing:0.12em;text-transform:uppercase;color:#666;margin:24px 0 8px;">Mileage Log (IRS standard rate)</h2>
      <div style="background:#f4f9fb;border:1px solid #d9e6eb;border-radius:8px;padding:14px 16px;">
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Service days</span><strong>${mileage.days}</strong></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Estimated miles</span><strong>${mileage.miles.toFixed(0)}</strong></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;font-weight:800;color:#1565c0;"><span>Deduction @ ${(mileage.rate_cents || IRS_MILEAGE_CENTS) / 100}¢/mi</span><span>$${(mileage.dollarValue || 0).toFixed(2)}</span></div>
        <p style="font-size:0.75rem;color:#888;margin:6px 0 0;">Note: estimated from route plans at ~8 mi/stop. Wire real distance log when ready for tighter audit defense.</p>
      </div>

      <p style="margin-top:30px;font-size:0.78rem;color:#888;text-align:center;">
        Forward to your CPA · Generated by GreenGuard Books · ${new Date().toISOString().slice(0, 10)}
      </p>
    </div>`
}

async function buildClosePackage(yyyymm) {
  const { start, end, label } = monthBounds(yyyymm)
  const [pnl, ar, tax, mileage] = await Promise.all([
    pnlForMonth({ start, end }),
    arAging(),
    salesTaxAccrual({ start, end }),
    mileageForMonth({ start, end }),
  ])
  const html = renderClosePackageHtml({ label, pnl, ar, tax, mileage })
  return { yyyymm, label, pnl, ar, tax, mileage, html }
}

module.exports = { buildClosePackage, monthBounds, IRS_MILEAGE_CENTS, TX_RATE_BPS }
