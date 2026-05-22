const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'
const GITHUB_REPO = 'greenguard-usa/greenguard-usa-web'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const token = process.env.GITHUB_TOKEN
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN not configured in Vercel' })

  const resp = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/route-optimizer.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  )

  if (resp.status === 204) return res.status(200).json({ ok: true })
  const text = await resp.text()
  return res.status(502).json({ error: `GitHub API error ${resp.status}: ${text}` })
}
