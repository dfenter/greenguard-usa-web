// Auto-approve safety net for forgotten draft invoices.
//
// Triggered daily by the cron-billing-run GitHub Action.
//
// Behavior:
//   mode=warn  — find drafts whose billing_date is TOMORROW and email
//                admin@greenguard-usa.com a heads-up list. Run at ~T-1 day.
//   mode=run   — find drafts whose billing_date is TODAY or earlier and
//                finalize each. Auto-charge (charge_automatically + card on
//                file) or email the hosted link (send_invoice). Per-draft
//                errors don't abort the batch.
//
// Auth: requires header x-cron-key matching CRON_SECRET env var. The cron
// secret is set in Vercel + GitHub Secrets so only the scheduled job
// (not random internet traffic) can invoke this.

const { stripe, getTaxRateId } = require('../../../lib/stripe')
const { Resend } = require('resend')

const ALERT_EMAIL = 'admin@greenguard-usa.com'

function todayISO() { return new Date().toISOString().slice(0, 10) }
function dateISOPlusDays(n) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

async function listDraftsWithBillingDate() {
  // Pull up to 100 drafts (most pages will never approach this).
  const drafts = []
  let starting_after
  do {
    const page = await stripe.invoices.list({ status: 'draft', limit: 100, ...(starting_after ? { starting_after } : {}), expand: ['data.customer'] })
    drafts.push(...page.data)
    starting_after = page.has_more ? page.data[page.data.length - 1]?.id : undefined
  } while (starting_after && drafts.length < 500)
  return drafts.filter((d) => d.metadata?.billing_date)
}

function customerLabel(inv) {
  const c = inv.customer
  if (c && typeof c === 'object') return c.name || c.email || c.id
  return inv.customer_email || inv.customer
}

async function runWarn() {
  const target = dateISOPlusDays(1)
  const drafts = (await listDraftsWithBillingDate()).filter((d) => d.metadata.billing_date === target && (d.amount_due || 0) > 0)
  if (drafts.length === 0) return { sent: 0, drafts: [] }

  const rows = drafts.map((d) => `<li><strong>${customerLabel(d)}</strong> — $${(d.amount_due / 100).toFixed(2)} · service ${d.metadata.service_date || '?'} · inv ${d.id}</li>`).join('')
  const html = `
    <p>Heads up — these draft invoices will be <strong>auto-submitted tomorrow</strong> by the 6am CT billing cron:</p>
    <ul>${rows}</ul>
    <p>To stop the auto-submission, go to <a href="https://portal.greenguard-usa.com/admin/invoice">/admin/invoice</a> and either send, cancel, or edit the line items before then.</p>
    <p>To approve early, click Send on each.</p>
  `
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: 'GreenGuard Billing <noreply@greenguard-usa.com>',
    to: ALERT_EMAIL,
    subject: `⏰ ${drafts.length} draft invoice${drafts.length === 1 ? '' : 's'} auto-submitting tomorrow`,
    html,
  })
  return { sent: drafts.length, drafts: drafts.map((d) => ({ id: d.id, amount_due: d.amount_due, customer: customerLabel(d) })) }
}

async function runFinalize() {
  const today = todayISO()
  const drafts = (await listDraftsWithBillingDate()).filter((d) => d.metadata.billing_date <= today)
  const results = { processed: 0, charged: 0, emailed: 0, errors: [] }
  if (drafts.length === 0) return results

  const taxRateId = getTaxRateId()
  for (const inv of drafts) {
    try {
      if (!inv.lines?.data?.length || (inv.amount_due || 0) === 0) continue

      if (taxRateId) {
        try { await stripe.invoices.update(inv.id, { default_tax_rates: [taxRateId] }) }
        catch (e) { if (e?.code !== 'resource_missing') throw e }
      }

      // Repair the no-default-PM case before charging.
      if (inv.collection_method === 'charge_automatically') {
        const cust = typeof inv.customer === 'object' ? inv.customer : await stripe.customers.retrieve(inv.customer)
        if (!cust.invoice_settings?.default_payment_method) {
          const pms = await stripe.paymentMethods.list({ customer: cust.id, limit: 5 })
          if (pms.data.length > 0) {
            await stripe.customers.update(cust.id, { invoice_settings: { default_payment_method: pms.data[0].id } })
          } else {
            await stripe.invoices.update(inv.id, { collection_method: 'send_invoice', days_until_due: 14 })
            inv.collection_method = 'send_invoice'
          }
        }
      }

      await stripe.invoices.finalizeInvoice(inv.id)
      if (inv.collection_method === 'send_invoice') {
        await stripe.invoices.sendInvoice(inv.id)
        results.emailed++
      } else {
        try {
          await stripe.invoices.pay(inv.id)
          results.charged++
        } catch (e) {
          // Charge failed (declined / no PM). Fall back to emailing the link
          // so the customer can still pay.
          await stripe.invoices.update(inv.id, { collection_method: 'send_invoice', days_until_due: 14 })
          await stripe.invoices.sendInvoice(inv.id)
          results.emailed++
          results.errors.push({ id: inv.id, customer: customerLabel(inv), error: `Charge failed → emailed link instead: ${e.message}` })
        }
      }
      results.processed++
    } catch (e) {
      results.errors.push({ id: inv.id, customer: customerLabel(inv), error: e.message })
    }
  }

  // Summary email to admin.
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const lines = []
    if (results.charged > 0) lines.push(`<li>${results.charged} auto-charged</li>`)
    if (results.emailed > 0) lines.push(`<li>${results.emailed} emailed hosted invoice link</li>`)
    if (results.errors.length > 0) {
      const errs = results.errors.map((e) => `<li>${e.customer} (${e.id}): ${e.error}</li>`).join('')
      lines.push(`<li><strong>${results.errors.length} error${results.errors.length === 1 ? '' : 's'}</strong>:<ul>${errs}</ul></li>`)
    }
    await resend.emails.send({
      from: 'GreenGuard Billing <noreply@greenguard-usa.com>',
      to: ALERT_EMAIL,
      subject: `💳 Billing run: ${results.processed} invoice${results.processed === 1 ? '' : 's'} submitted${results.errors.length ? ' (with errors)' : ''}`,
      html: `<p>Daily 5-day auto-approve run completed.</p><ul>${lines.join('')}</ul>`,
    })
  } catch {}

  return results
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers['x-cron-key'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const mode = req.query.mode || 'run'
  try {
    if (mode === 'warn') return res.status(200).json({ mode, ...(await runWarn()) })
    if (mode === 'run')  return res.status(200).json({ mode, ...(await runFinalize()) })
    return res.status(400).json({ error: 'mode must be warn or run' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
