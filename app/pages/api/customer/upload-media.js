import { put } from '@vercel/blob'
import crypto from 'crypto'
import { getSessionFromRequest } from '../../../lib/auth'
import { findContactByEmail, addNote } from '../../../lib/hubspot'
import { extFor, readLimitedBody } from '../../../lib/upload-guard'

export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'Media storage not configured — contact support' })
  }

  const contentType = req.headers['content-type'] || ''
  const ext = extFor(contentType)
  if (!ext) {
    return res.status(415).json({ error: `Unsupported file type: ${contentType.split(';')[0]}. Allowed: jpg, png, heic, webp, mp4, webm, mov` })
  }

  let buffer
  try {
    buffer = await readLimitedBody(req)
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message })
  }

  try {
    const caption = String(req.headers['x-caption'] || '').slice(0, 500)
    // SHA-256 of the email keeps the blob path stable per customer (so you can
    // still list one customer's uploads with a prefix scan) without putting
    // PII in the URL. 16 hex chars = 64 bits of entropy, plenty for a
    // collision-resistant prefix on this scale.
    const emailHash = crypto.createHash('sha256').update(String(session.email).toLowerCase()).digest('hex').slice(0, 16)
    const isVideo = ext === 'mp4' || ext === 'webm' || ext === 'mov'
    const filename = `customer/${emailHash}/${Date.now()}.${ext}`

    const blob = await put(filename, buffer, { access: 'public', contentType })

    try {
      const contact = await findContactByEmail(session.email)
      if (contact?.id) {
        await addNote(contact.id, `[CUSTOMER-MEDIA] ${isVideo ? 'Video' : 'Photo'} uploaded: ${blob.url}${caption ? `\nCaption: ${caption}` : ''}`)
      }
    } catch {}

    res.status(200).json({ url: blob.url })
  } catch (e) {
    res.status(500).json({ error: 'Upload failed' })
  }
}
