// Receipt upload → Vercel Blob. Same shape as /api/admin/upload-media (raw
// body, Content-Type header) so the phone can POST a camera capture directly.
//
// PDFs are allowed here (a lot of receipts arrive as one) but videos are not.
// Blob URLs are unguessable but not access-controlled, which is the same trade
// the visit photos already make — so the stored path deliberately carries no
// employee name or amount.
import { put } from '@vercel/blob'
import { requireAdmin } from '../../../lib/auth'
import { readLimitedBody } from '../../../lib/upload-guard'

export const config = { api: { bodyParser: false } }

const RECEIPT_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

const MAX_RECEIPT_BYTES = 12 * 1024 * 1024   // a photo of a receipt, not a movie

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const session = await requireAdmin(req, res)
  if (!session) return
  res.setHeader('Cache-Control', 'no-store')

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'Receipt storage is not configured (BLOB_READ_WRITE_TOKEN)' })
  }

  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
  const ext = RECEIPT_TYPES[contentType]
  if (!ext) {
    return res.status(415).json({
      error: `Receipts must be a photo or PDF — got ${contentType || 'nothing'}`,
    })
  }

  let buffer
  try {
    buffer = await readLimitedBody(req, MAX_RECEIPT_BYTES)
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message })
  }
  if (!buffer.length) return res.status(400).json({ error: 'Empty upload' })

  try {
    const name = `receipts/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const blob = await put(name, buffer, { access: 'public', contentType, addRandomSuffix: true })
    return res.status(200).json({ url: blob.url, mime: contentType, bytes: buffer.length })
  } catch (e) {
    console.error('[expense-receipt] upload failed:', e.message)
    return res.status(500).json({ error: 'Upload failed — try again' })
  }
}
