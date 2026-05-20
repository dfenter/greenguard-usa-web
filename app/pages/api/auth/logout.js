const { serialize } = require('cookie')
const { SESSION_COOKIE_NAME } = require('../../../lib/auth')

export default function handler(req, res) {
  res.setHeader('Set-Cookie', serialize(SESSION_COOKIE_NAME, '', { maxAge: 0, path: '/' }))
  res.redirect('/login')
}
