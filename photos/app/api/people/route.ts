import { NextResponse } from 'next/server'
import { loadTags, getPeople } from '../../../lib/photo-tags'

export async function GET() {
  try {
    const tags = await loadTags()
    return NextResponse.json({ people: getPeople(tags) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
