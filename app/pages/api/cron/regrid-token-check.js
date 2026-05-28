// Daily check of REGRID_API_KEY expiry.
//
// Regrid's free-tier API tokens are JWTs with a 30-day exp claim. This
// cron decodes the token, computes days until expiry, and emails admin
// when there are <= WARN_DAYS days left so a rotation can be done before
// the lookup silently 401s. Idempotent — sends at most once per day.
//
// Authorized like the other crons (Authorization: Bearer CRON_SECRET).

const { Resend } = require('resend')
const { authorize } = require('../../../lib/cron-auth')

const ADMIN_EMAIL = 'admin@greenguard-usa.com'
const WARN_DAYS = 7

function decodeJwtPayload(jwt) {
  if (!jwt || typeof jwt !== 'string') return null
  const parts = jwt.split('.')
  if (parts.length < 2) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = Buffer.from(b64, 'base64').toString('utf-8')
    return JSON.parse(json)
  } catch { return null }
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end()
  if (!authorize(req, res)) return

  const token = process.env.REGRID_API_KEY
  if (!token) {
    return res.status(200).json({ ok: true, configured: false, note: 'REGRID_API_KEY not set' })
  }

  const payload = decodeJwtPayload(token)
  if (!payload || !payload.exp) {
    // Token isn't a standard JWT (maybe a paid-plan persistent key) — nothing to warn about.
    return res.status(200).json({ ok: true, format: 'not-a-jwt', message: 'Token does not have an exp claim — assuming persistent.' })
  }

  const now = Math.floor(Date.now() / 1000)
  const secondsLeft = payload.exp - now
  const daysLeft = Math.floor(secondsLeft / 86400)
  const expiresAt = new Date(payload.exp * 1000).toISOString()

  if (daysLeft > WARN_DAYS) {
    return res.status(200).json({ ok: true, daysLeft, expiresAt, warned: false })
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(200).json({ ok: true, daysLeft, expiresAt, warned: false, note: 'RESEND_API_KEY missing' })
  }

  const expired = daysLeft <= 0
  const subject = expired
    ? '🚨 Regrid API key has EXPIRED — quote builder lot lookup is down'
    : `⏰ Regrid API key expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — rotate it`
  const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:520px;padding:24px;color:#1a2e1f;">
      <h2 style="margin:0 0 12px;color:#1a2e1f;">${expired ? 'Regrid API key expired' : 'Regrid API key expiring soon'}</h2>
      <p style="color:#555;line-height:1.6;">
        The Regrid token used for the quote builder lot-size lookup
        ${expired ? 'has expired' : `expires on <strong>${new Date(payload.exp * 1000).toUTCString()}</strong> (${daysLeft} day${daysLeft === 1 ? '' : 's'} from now)`}.
        ${expired ? 'The auto-recommendation in /quote/new is currently falling back to the manual picker.' : 'Rotate it before the deadline so customers keep seeing automatic trap recommendations.'}
      </p>
      <ol style="color:#555;line-height:1.7;">
        <li>Sign in at <a href="https://regrid.com/api">regrid.com/api</a> with the admin account</li>
        <li>Generate a new API token</li>
        <li>From <code>greenguard-usa-web/app</code> run:
          <pre style="background:#f3f3f3;padding:10px;border-radius:6px;font-size:0.85rem;">vercel env rm REGRID_API_KEY production -y
echo "&lt;new-token&gt;" | vercel env add REGRID_API_KEY production
./scripts/deploy.sh portal</pre>
        </li>
        <li>Or upgrade to a paid Regrid plan for a persistent token.</li>
      </ol>
      <p style="font-size:0.75rem;color:#888;margin-top:18px;">Watcher cron at /api/cron/regrid-token-check — runs daily via cron-job.org.</p>
    </div>`

  try {
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: 'GreenGuard Ops <noreply@greenguard-usa.com>',
      to: ADMIN_EMAIL,
      subject,
      html,
    })
    return res.status(200).json({ ok: true, daysLeft, expiresAt, warned: true })
  } catch (e) {
    console.error('regrid-token-check email failed:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
