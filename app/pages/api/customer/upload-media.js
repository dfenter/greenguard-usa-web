import { put } from '@vercel/blob'
import { getSessionFromRequest } from '../../../lib/auth'
import { findContactByEmail, addNote } from '../../../lib/hubspot'

export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'Media storage not configured — contact support' })
  }

  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const buffer = Buffer.concat(chunks)

    const contentType = req.headers['content-type'] || 'application/octet-stream'
    const caption = req.headers['x-caption'] || ''
    const isVideo = contentType.startsWith('video')
    const ext = isVideo ? (contentType.includes('webm') ? 'webm' : 'mp4') : 'jpg'
    const filename = `customer/${session.email}/${Date.now()}.${ext}`

    const blob = await put(filename, buffer, { access: 'public', contentType })

    // Log to HubSpot
    try {
      const contact = await findContactByEmail(session.email)
      if (contact?.id) {
        await addNote(contact.id, `[CUSTOMER-MEDIA] ${isVideo ? 'Video' : 'Photo'} uploaded: ${blob.url}${caption ? `\nCaption: ${caption}` : ''}`)
      }
    } catch {}

    res.status(200).json({ url: blob.url })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
