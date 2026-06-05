#!/usr/bin/env node
const http = require('http')
const { exec } = require('child_process')
const path = require('path')
const fs = require('fs')
const { google } = require('googleapis')

const envPath = path.join(__dirname, '../photos/.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
}

const PORT = 9876
const REDIRECT = `http://localhost:${PORT}/callback`
const OUT = path.join(__dirname, '../photos/.refresh-token.txt')

const oauth2Client = new google.auth.OAuth2(
  process.env.PHOTOS_GOOGLE_CLIENT_ID,
  process.env.PHOTOS_GOOGLE_CLIENT_SECRET,
  REDIRECT
)

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive'],
})

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/callback')) return
  const code = new URL(req.url, `http://localhost:${PORT}`).searchParams.get('code')
  if (!code) { res.end('No code.'); return }
  res.end('<h2>Done! Close this tab.</h2>')
  server.close()
  try {
    const { tokens } = await oauth2Client.getToken(code)
    fs.writeFileSync(OUT, tokens.refresh_token)
    process.stdout.write('\nToken saved to photos/.refresh-token.txt\n')
    process.exit(0)
  } catch (err) {
    fs.writeFileSync(OUT, 'ERROR: ' + err.message)
    process.exit(1)
  }
})

server.listen(PORT, () => {
  process.stdout.write('Opening browser...\n')
  exec(`open "${authUrl}"`)
})
