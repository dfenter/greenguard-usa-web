// Cron endpoint authenticator. Accepts requests from two sources:
//
//   1. Vercel Cron — sends GET with `Authorization: Bearer <CRON_SECRET>`
//      header. Vercel signs the header using the project's CRON_SECRET env
//      var if set, otherwise sends an unsigned header from its own pool.
//   2. External invoker (manual ops, or a Render cron hitting the portal) —
//      sends POST with `x-cron-key: <CRON_SECRET>` header.
//
// Both must match `process.env.CRON_SECRET`. Returns true on auth success,
// otherwise writes the appropriate response and returns false.

function authorize(req, res) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    res.status(503).json({ error: 'CRON_SECRET not configured' })
    return false
  }
  // Vercel Cron: GET + Authorization: Bearer <secret>
  const authHeader = req.headers['authorization'] || ''
  if (authHeader === `Bearer ${secret}`) return true
  // External: POST + x-cron-key
  if (req.headers['x-cron-key'] === secret) return true
  res.status(401).json({ error: 'Unauthorized' })
  return false
}

module.exports = { authorize }
