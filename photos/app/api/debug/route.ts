import { NextResponse } from 'next/server'
export async function GET() {
  const clientId = process.env.PHOTOS_GOOGLE_CLIENT_ID ?? ''
  const secret = process.env.PHOTOS_GOOGLE_CLIENT_SECRET ?? ''
  return NextResponse.json({
    clientIdLen: clientId.length,
    clientIdStart: clientId.slice(0, 12),
    secretLen: secret.length,
    secretStart: secret.slice(0, 8),
  })
}
