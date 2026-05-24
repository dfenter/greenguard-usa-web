const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'
const GITHUB_REPO = 'greenguard-usa/greenguard-usa-web'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const token = process.env.GITHUB_TOKEN
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN not configured in Vercel' })

  // First verify token has access by checking workflow exists
  const checkResp = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/route-optimizer.yml`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    }
  )

  if (checkResp.status === 401) {
    return res.status(502).json({ error: 'GITHUB_TOKEN is invalid or expired. Regenerate in GitHub > Settings > Tokens and update in Vercel.' })
  }
  if (checkResp.status === 404) {
    return res.status(502).json({ error: `Workflow not found at ${GITHUB_REPO}/route-optimizer.yml — verify token has access to private repo.` })
  }

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
  let detail = text
  if (resp.status === 403) {
    detail = `Token missing "workflow" scope. Token must be a Fine-grained PAT with Actions: Write, OR a Classic PAT with "workflow" scope. ${text}`
  }
  return res.status(502).json({ error: `GitHub API error ${resp.status}: ${detail}` })
}
