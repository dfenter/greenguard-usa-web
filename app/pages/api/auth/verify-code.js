// In-app code sign-in — completes login INSIDE the standalone home-screen PWA.
//
// Bruce's app is display:standalone, which on iOS has its own cookie jar,
// isolated from Safari. Tapping the magic link opens Safari, so the session
// cookie set there never reaches the installed app — he had to log in every
// time. Typing the emailed 6-digit code here sets gg_session in the PWA's own
// context. Codes are single-use, hashed at rest, 15-min TTL, 5-try lockout
// (see lib/auth.js).

const { stripe } = require('../../../lib/stripe')
const {
  consumeLoginCode,
  createSessionToken,
  isAdminEmail,
  isOwnerEmail,
  escapeStripeSearch,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
} = require('../../../lib/auth')
const { serialize } = require('cookie')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email, code } = req.body || {}
  if (!email || !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' })
  }
  const codeStr = String(code || '').trim()
  if (!/^\d{6}$/.test(codeStr)) {
    return res.status(400).json({ error: 'Enter the 6-digit code from your email.' })
  }

  try {
    const ok = await consumeLoginCode(email, codeStr)
    if (!ok) {
      return res.status(401).json({ error: 'That code is incorrect or has expired. Request a new one.' })
    }

    const customers = await stripe.customers.search({
      query: `email:"${escapeStripeSearch(email)}"`,
      limit: 1,
    })
    const stripeCustomerId = customers.data[0]?.id || null

    const sessionToken = await createSessionToken(email, stripeCustomerId)
    res.setHeader('Set-Cookie', serialize(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS))

    const dest = (!isAdminEmail(email) && !stripeCustomerId)
      ? '/prospect'
      : isAdminEmail(email)
        ? (isOwnerEmail(email) ? '/admin/home' : '/admin/tech')
        : '/dashboard'

    // Fresh backup token so the PWA can self-restore its cookie after any
    // future iOS eviction (mirrors auth-success's gg_backup mechanism).
    const backupToken = await createSessionToken(email, stripeCustomerId)
    return res.json({ ok: true, dest, backupToken })
  } catch (err) {
    console.error('verify-code error:', err.message)
    return res.status(500).json({ error: 'Something went wrong. Please try again.' })
  }
}
