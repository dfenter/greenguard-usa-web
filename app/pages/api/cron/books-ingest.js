// Cron-triggered: pull recent Stripe balance transactions into the ledger.
// Default lookback = 7 days (idempotent — UNIQUE constraint handles dup runs).
// One-shot backfill: POST ?days=365 with the CRON_SECRET header.

const { ingestStripeBalanceTransactions } = require('../../../lib/books-ingest')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (req.headers['x-cron-key'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const days = Math.min(parseInt(req.query.days || '7', 10) || 7, 730)
  try {
    const r = await ingestStripeBalanceTransactions({ daysBack: days })
    return res.status(200).json({ ok: true, daysBack: days, ...r })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
