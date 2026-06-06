import { NextRequest, NextResponse } from 'next/server'
import { getFileStream, getAccessToken } from '../../../../lib/drive'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const token = await getAccessToken()
    const meta = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?fields=name,mimeType`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
    ).then(r => r.json())

    const stream = await getFileStream(id)
    const filename = encodeURIComponent(meta.name ?? 'photo')
    return new NextResponse(stream, {
      headers: {
        'Content-Type': meta.mimeType ?? 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: any) {
    console.error('Download error:', err.message)
    return new NextResponse('Download failed', { status: 500 })
  }
}
