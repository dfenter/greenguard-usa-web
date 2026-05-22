#!/usr/bin/env node
/**
 * One-time script to get QuickBooks Online OAuth2 refresh token
 * Run: node _scripts/get-qbo-token.js
 * Then paste the resulting refresh token into Vercel as QBO_REFRESH_TOKEN
 *
 * Prerequisites:
 *   QBO_CLIENT_ID and QBO_CLIENT_SECRET in your local .env or shell env
 *   Redirect URI "http://localhost:3001/callback" added in developer.intuit.com app settings
 */

const http = require('http')
const { exec } = require('child_process')
require('dotenv').config({ path: require('path').join(__dirname, '../app/.env.local') })

const CLIENT_ID = process.env.QBO_CLIENT_ID
const CLIENT_SECRET = process.env.QBO_CLIENT_SECRET

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set QBO_CLIENT_ID and QBO_CLIENT_SECRET in app/.env.local first')
  process.exit(1)
}

const REDIRECT_URI = 'http://localhost:3001/callback'
const SCOPES = 'com.intuit.quickbooks.accounting'
const STATE = Math.random().toString(36).slice(2)

const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPES)}&state=${STATE}`

console.log('\nOpening browser for QuickBooks authorization...\n')
console.log('If browser does not open, visit:\n', authUrl, '\n')
exec(`open "${authUrl}"`)

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/callback')) return
  const url = new URL(req.url, 'http://localhost:3001')
  const code = url.searchParams.get('code')
  const realmId = url.searchParams.get('realmId')

  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end('<html><body><h2>Authorization received! Check your terminal.</h2></body></html>')

  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
  const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
  })

  const tokens = await tokenRes.json()
  if (tokens.error) {
    console.error('Token error:', tokens.error_description)
    server.close()
    process.exit(1)
  }

  console.log('\n=== QuickBooks OAuth Tokens ===')
  console.log('Add these to Vercel environment variables:\n')
  console.log(`QBO_REFRESH_TOKEN=${tokens.refresh_token}`)
  console.log(`QBO_REALM_ID=${realmId}`)
  console.log('\nAccess token (expires in 1hr, not needed — refresh token handles it):')
  console.log(tokens.access_token.slice(0, 40) + '...\n')

  server.close()
  process.exit(0)
})

server.listen(3001, () => {
  console.log('Listening on http://localhost:3001 for OAuth callback...')
})
