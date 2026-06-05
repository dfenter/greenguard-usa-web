import { NextRequest, NextResponse } from 'next/server'
import { listPhotos } from '../../../lib/drive'

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  try {
    const { photos, nextPageToken } = await listPhotos(
      p.get('cursor') ?? undefined,
      p.get('year') ?? undefined,
      p.get('month') ?? undefined,
    )
    return NextResponse.json({ photos, nextPageToken: nextPageToken ?? null })
  } catch (e: any) {
    console.error('Drive error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
