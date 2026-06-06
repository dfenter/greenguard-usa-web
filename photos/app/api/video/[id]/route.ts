import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken } from '../../../../lib/drive'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const token = await getAccessToken()

    // Get file metadata for content type
    const meta = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?fields=mimeType,size`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
    ).then(r => r.json())

    // Support range requests for video seeking
    const rangeHeader = req.headers.get('range')
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    }
    if (rangeHeader) headers['Range'] = rangeHeader

    const upstream = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
      { headers, cache: 'no-store' }
    )

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': meta.mimeType ?? 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=3600',
        ...(upstream.headers.get('Content-Range')
          ? { 'Content-Range': upstream.headers.get('Content-Range')! }
          : {}),
        ...(upstream.headers.get('Content-Length')
          ? { 'Content-Length': upstream.headers.get('Content-Length')! }
          : {}),
      },
    })
  } catch (err: any) {
    console.error('Video proxy error:', err.message)
    return new NextResponse('Video load failed', { status: 500 })
  }
}
