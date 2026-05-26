const MAX_BYTES = 25 * 1024 * 1024 // 25 MB

const ALLOWED = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
  'video/mp4':  'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

function extFor(contentType) {
  const base = String(contentType || '').toLowerCase().split(';')[0].trim()
  return ALLOWED[base] || null
}

function sanitizeSegment(s) {
  return String(s || 'anon').toLowerCase().replace(/[^a-z0-9._-]+/g, '_').slice(0, 64)
}

// Streams the request body into a buffer with a hard size limit.
// Throws { status, message } on violation so callers can return cleanly.
async function readLimitedBody(req, max = MAX_BYTES) {
  const declared = parseInt(req.headers['content-length'] || '0', 10)
  if (declared && declared > max) {
    const err = new Error(`Upload exceeds ${max / 1024 / 1024}MB limit`)
    err.status = 413
    throw err
  }
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > max) {
      const err = new Error(`Upload exceeds ${max / 1024 / 1024}MB limit`)
      err.status = 413
      throw err
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

module.exports = { MAX_BYTES, ALLOWED, extFor, sanitizeSegment, readLimitedBody }
