import { NextRequest, NextResponse } from 'next/server'
import { listPhotosFromIndex } from '../../../lib/drive'
import { loadTags } from '../../../lib/photo-tags'

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  try {
    let personIds: Set<string> | undefined
    const person = p.get('person')
    if (person) {
      const tags = await loadTags()
      personIds = new Set(
        Object.entries(tags)
          .filter(([, people]) => people.includes(person))
          .map(([id]) => id)
      )
    }

    const { photos, nextPageToken } = listPhotosFromIndex(
      p.get('cursor') ?? undefined,
      p.get('year') ?? undefined,
      p.get('month') ?? undefined,
      p.get('from') ?? undefined,
      p.get('to') ?? undefined,
      p.get('search') ?? undefined,
      p.get('shuffle') === '1',
      p.get('onthisday') === '1',
      p.get('videos') === '1',
      p.get('screenshots') === '1',
      personIds,
    )

    // Attach people tags to each photo
    const tags = person ? undefined : await loadTags().catch(() => ({}))
    const photosWithTags = photos.map(photo => ({
      ...photo,
      people: (tags ?? {})[photo.id] ?? [],
    }))

    return NextResponse.json({ photos: photosWithTags, nextPageToken: nextPageToken ?? null })
  } catch (e: any) {
    console.error('Photos error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
