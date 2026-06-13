import { NextRequest, NextResponse } from 'next/server'
import { trashPhoto } from '../../../../lib/drive'
import { addDeleted } from '../../../../lib/photo-tags'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    await trashPhoto(id)
    await addDeleted(id)
    return new NextResponse(null, { status: 204 })
  } catch (e: any) {
    console.error('Delete error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
