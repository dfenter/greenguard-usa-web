import { put } from '@vercel/blob'
import { requireAdmin } from '../../../lib/auth'
import { extFor, readLimitedBody } from '../../../lib/upload-guard'
import { assessPhoto } from '../../../lib/photo-qa'

export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await requireAdmin(req, res)
  if (!session) return

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'Media storage not configured' })
  }

  const contentType = req.headers['content-type'] || ''
  const ext = extFor(contentType)
  if (!ext) {
    return res.status(415).json({ error: `Unsupported file type: ${contentType.split(';')[0]}` })
  }

  let buffer
  try {
    buffer = await readLimitedBody(req)
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message })
  }

  try {
    const filename = `visits/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const blob = await put(filename, buffer, { access: 'public', contentType })

    // Optional x-customer-email header lets Rounds attach the QA note to the
    // right customer. x-skip-qa=1 disables (e.g. equipment-only photos).
    const customerEmail = req.headers['x-customer-email'] || null
    const caption = req.headers['x-caption'] || ''
    const skipQA = req.headers['x-skip-qa'] === '1'
    const isImage = ext === 'jpg' || ext === 'png' || ext === 'webp' || ext === 'heic'

    let qa = null
    if (isImage && !skipQA && process.env.GOOGLE_GEMINI_API_KEY) {
      // Fire-and-forget: don't block the upload response on the AI roundtrip.
      assessPhoto({ imageUrl: blob.url, customerEmail, caption }).catch((e) =>
        console.error('photo-qa:', e.message)
      )
      qa = { queued: true }
    }

    res.status(200).json({ url: blob.url, qa })
  } catch (e) {
    res.status(500).json({ error: 'Upload failed' })
  }
}
