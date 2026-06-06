import { NextRequest, NextResponse } from 'next/server'
import { addTag, removeTag, loadTags } from '../../../lib/photo-tags'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ people: [] })
  try {
    const tags = await loadTags()
    return NextResponse.json({ people: tags[id] ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { id, person, action } = await req.json()
    if (!id || !person || !['add', 'remove'].includes(action)) {
      return NextResponse.json({ error: 'invalid params' }, { status: 400 })
    }
    const people = action === 'add'
      ? await addTag(id, person.trim())
      : await removeTag(id, person.trim())
    return NextResponse.json({ people })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
