import { NextRequest, NextResponse } from 'next/server'
import { getFileStream } from '../../../../lib/drive'
import sharp from 'sharp'
import heicConvert from 'heic-convert'

const FULL_WIDTH = 1400

// Module-level token cache — shared across concurrent requests in a warm function
let cachedToken: string | null = null
let tokenExpiry = 0

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.PHOTOS_GOOGLE_CLIENT_ID!,
      client_secret: process.env.PHOTOS_GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.PHOTOS_GOOGLE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  })
  const t = await res.json()
  if (!t.access_token) throw new Error('Token refresh failed')
  cachedToken = t.access_token
  tokenExpiry = Date.now() + 55 * 60 * 1000
  return cachedToken!
}

async function streamToBuffer(stream: ReadableStream): Promise<Buffer> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const isFull = req.nextUrl.searchParams.get('size') === 'full'

  try {
    const token = await getToken()

    // Thumbnails: fetch a fresh thumbnailLink from Drive and redirect browser to CDN
    if (!isFull) {
      const meta = await fetch(
        `https://www.googleapis.com/drive/v3/files/${id}?fields=thumbnailLink,mimeType`,
        { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
      )
      if (meta.ok) {
        const data = await meta.json()
        if (data.thumbnailLink) {
          const url = /=s\d+/.test(data.thumbnailLink)
            ? data.thumbnailLink.replace(/=s\d+/, '=s400')
            : data.thumbnailLink + '=s400'
          // Proxy the bytes so browser auth cookies aren't needed
          const thumb = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
          if (thumb.ok) {
            return new NextResponse(await thumb.arrayBuffer(), {
              headers: {
                'Content-Type': thumb.headers.get('Content-Type') ?? 'image/jpeg',
                'Cache-Control': 'public, max-age=3600',
              },
            })
          }
        }
      }
    }

    // Full size or thumbnail fallback: download and process
    const stream = await getFileStream(id)
    let buffer = await streamToBuffer(stream)

    // HEIC → JPEG via pure-JS converter
    if (buffer.slice(4, 8).toString() === 'ftyp') {
      try {
        const jpeg = await heicConvert({ buffer: new Uint8Array(buffer), format: 'JPEG', quality: 0.9 })
        buffer = Buffer.from(jpeg)
      } catch {
        return new NextResponse(buffer, {
          headers: { 'Content-Type': 'image/heic', 'Cache-Control': 'public, max-age=86400' },
        })
      }
    }

    const jpeg = await sharp(buffer)
      .resize(isFull ? FULL_WIDTH : 400, undefined, { withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer()

    return new NextResponse(jpeg, {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' },
    })
  } catch (err: any) {
    console.error('Image proxy error:', err.message)
    return new NextResponse('Failed', { status: 500 })
  }
}
