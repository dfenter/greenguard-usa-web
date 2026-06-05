import { NextRequest, NextResponse } from 'next/server'
import { getFileStream } from '../../../../lib/drive'
import sharp from 'sharp'

const THUMB_WIDTH = 400
const FULL_WIDTH = 1400

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
  const size = req.nextUrl.searchParams.get('size') === 'full' ? FULL_WIDTH : THUMB_WIDTH

  try {
    const stream = await getFileStream(id)
    const buffer = await streamToBuffer(stream)
    const jpeg = await sharp(buffer)
      .resize(size, undefined, { withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer()

    return new NextResponse(jpeg, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (err: any) {
    console.error('Image proxy error:', err.message)
    return new NextResponse('Failed to load image', { status: 500 })
  }
}
