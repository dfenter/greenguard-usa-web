const { serialize } = require('cookie')
const { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } = require('../../../lib/auth')

export default function handler(req, res) {
  res.setHeader('Set-Cookie', serialize(SESSION_COOKIE_NAME, '', { ...SESSION_COOKIE_OPTIONS, maxAge: 0 }))
  res.redirect('/login')
}
