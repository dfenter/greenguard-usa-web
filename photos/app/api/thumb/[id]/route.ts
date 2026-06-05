import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken } from '../../../../lib/drive'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // id is base64url-encoded thumbnail URL (no padding)
  const padded = id.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((id.length * 3) % 4 === 0 ? 2 : (id.length * 3) % 4 === 1 ? 1 : 0)
  const thumbUrl = Buffer.from(padded, 'base64').toString('utf8')
  if (!thumbUrl.startsWith('https://')) {
    return new NextResponse('Bad request', { status: 400 })
  }

  try {
    const token = await getAccessToken()
    const res = await fetch(thumbUrl, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) return new NextResponse('Thumbnail not found', { status: 404 })

    const buf = await res.arrayBuffer()
    return new NextResponse(buf, {
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=604800',
      },
    })
  } catch (err: any) {
    return new NextResponse('Error', { status: 500 })
  }
}
