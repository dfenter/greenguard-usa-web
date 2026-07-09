#!/usr/bin/env node
/**
 * One-time: mint a refresh token with Search Console + GA4-edit scopes.
 *
 *   cd app && node scripts/mint-gsc-token.js
 *
 * Opens a browser for Google consent (sign in as admin@greenguard-usa.com),
 * then prints the GSC_REFRESH_TOKEN line to add to app/.env and Vercel.
 * Deliberately a SEPARATE token from GOOGLE_REFRESH_TOKEN so the shared
 * calendar/analytics/GBP token is never touched (June-2026 lesson).
 */
const fs = require('fs')
const http = require('http')
const { google } = require('googleapis')

for (const line of fs.readFileSync(__dirname + '/../.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}

const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',   // Search Console
  'https://www.googleapis.com/auth/analytics.edit',        // GA4 key-event admin
]
const PORT = 53682

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET,
  `http://localhost:${PORT}/`
)
const url = auth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES })

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`)
  const code = u.searchParams.get('code')
  if (!code) { res.end('waiting…'); return }
  const { tokens } = await auth.getToken(code)
  res.end('Done — you can close this tab.')
  server.close()
  console.log('\nAdd to app/.env AND Vercel (portal project):')
  console.log(`GSC_REFRESH_TOKEN=${tokens.refresh_token}\n`)
})
server.listen(PORT, () => {
  console.log('Opening browser for consent — sign in as admin@greenguard-usa.com')
  require('child_process').exec(`open "${url}"`)
  console.log('If no browser opens, visit:\n' + url)
})
