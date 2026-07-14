// Daily scan for invoices in the payment-resurrection escalation series.
//
// T+48h: send second reminder email + SMS
// T+7d : draft admin alert, mark HubSpot churn_risk
//
// Triggered daily by .github/workflows/cron-payment-resurrection.yml.
// Auth: x-cron-key header must match CRON_SECRET.

const { stripe } = require('../../../lib/stripe')
const { sendT48hReminder, sendT7dAdminAlert, markStage } = require('../../../lib/payment-resurrection')
const { authorize } = require('../../../lib/cron-auth')
const { consumeJtiStrict } = require('../../../lib/auth')

const HOURS = 3600 * 1000
const STAGE_T48_AFTER_MS = 48 * HOURS
const STAGE_T7D_AFTER_MS = 7 * 24 * HOURS
const STAGE_CLAIM_TTL_SEC = 6 * HOURS / 1000

async function listOpenInvoicesNeedingFollowup() {
  // Open status only; we don't chase voided or paid invoices.
  const out = []
  let starting_after
  do {
    const page = await stripe.invoices.list({
      status: 'open', limit: 100,
      ...(starting_after ? { starting_after } : {}),
      expand: ['data.customer'],
    })
    for (const inv of page.data) {
      // Has a T+0 marker = entered the series
      if (inv.metadata?.payfail_t0_at) out.push(inv)
    }
    starting_after = page.has_more ? page.data[page.data.length - 1]?.id : undefined
  } while (starting_after && out.length < 500)
  return out
}

export default async function handler(req, res) {
  // Accept both Vercel Cron (GET + Bearer auth) and manual POST + x-cron-key.
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end()
  if (!authorize(req, res)) return

  const now = Date.now()
  const results = { scanned: 0, t48_sent: 0, t7d_sent: 0, errors: [] }

  try {
    const invs = await listOpenInvoicesNeedingFollowup()
    results.scanned = invs.length

    for (const inv of invs) {
      const t0Ms = new Date(inv.metadata.payfail_t0_at).getTime()
      const age = now - t0Ms
      const customer = inv.customer && typeof inv.customer === 'object'
        ? inv.customer
        : await stripe.customers.retrieve(inv.customer).catch(() => null)
      if (!customer) continue

      try {
        if (age >= STAGE_T7D_AFTER_MS && !inv.metadata.payfail_t7d_at) {
          let claimed
          try {
            claimed = await consumeJtiStrict(`cron:payment-resurrection:${inv.id}:t7d`, STAGE_CLAIM_TTL_SEC)
          } catch (e) {
            results.errors.push(`${inv.id} t7d claim: ${e.message.slice(0, 100)}`)
            continue
          }
          if (!claimed) continue
          const sent = await sendT7dAdminAlert(inv, customer)
          if (!sent.sent) {
            results.errors.push(`${inv.id} t7d: ${sent.error || 'no channel confirmed'}`)
            continue
          }
          await markStage(inv.id, 't7d')
          results.t7d_sent++
        } else if (age >= STAGE_T48_AFTER_MS && !inv.metadata.payfail_t48_at) {
          let claimed
          try {
            claimed = await consumeJtiStrict(`cron:payment-resurrection:${inv.id}:t48`, STAGE_CLAIM_TTL_SEC)
          } catch (e) {
            results.errors.push(`${inv.id} t48 claim: ${e.message.slice(0, 100)}`)
            continue
          }
          if (!claimed) continue
          const sent = await sendT48hReminder(inv, customer)
          if (!sent.sent) {
            results.errors.push(`${inv.id} t48: no channel confirmed`)
            continue
          }
          await markStage(inv.id, 't48')
          results.t48_sent++
        }
      } catch (e) {
        results.errors.push(`${inv.id}: ${e.message.slice(0, 100)}`)
      }
    }
  } catch (e) {
    return res.status(500).json({ error: e.message, ...results })
  }

  res.status(200).json(results)
}
