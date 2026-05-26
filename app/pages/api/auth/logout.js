const { serialize } = require('cookie')
const { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } = require('../../../lib/auth')

export default function handler(req, res) {
  // POST-only to prevent CSRF logout (e.g. <img src=".../logout">)
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed — use POST' })
  }
  res.setHeader('Set-Cookie', serialize(SESSION_COOKIE_NAME, '', { ...SESSION_COOKIE_OPTIONS, maxAge: 0 }))
  res.status(200).json({ ok: true })
}
