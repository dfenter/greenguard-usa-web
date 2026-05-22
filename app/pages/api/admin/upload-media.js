import { put } from '@vercel/blob'
import { getSessionFromRequest, isAdminEmail } from '../../../lib/auth'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'Media storage not configured' })
  }

  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const buffer = Buffer.concat(chunks)

    const contentType = req.headers['content-type'] || 'application/octet-stream'
    const ext = contentType.includes('video') ? 'mp4' : contentType.includes('webm') ? 'webm' : 'jpg'
    const filename = `visits/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const blob = await put(filename, buffer, { access: 'public', contentType })
    res.status(200).json({ url: blob.url })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
