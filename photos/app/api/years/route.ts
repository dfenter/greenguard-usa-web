import { NextResponse } from 'next/server'
import { getAccessToken } from '../../../lib/drive'

export async function GET() {
  const folderId = process.env.DRIVE_PHOTOS_FOLDER_ID!
  const token = await getAccessToken()
  const base = `https://www.googleapis.com/drive/v3/files`
  const q = encodeURIComponent(`'${folderId}' in parents and mimeType contains 'image/' and trashed = false`)
  const fields = 'files(createdTime)'

  const [newestRes, oldestRes] = await Promise.all([
    fetch(`${base}?q=${q}&orderBy=createdTime+desc&pageSize=1&fields=${fields}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    }),
    fetch(`${base}?q=${q}&orderBy=createdTime&pageSize=1&fields=${fields}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    }),
  ])

  const [newest, oldest] = await Promise.all([newestRes.json(), oldestRes.json()])
  const newestYear = new Date(newest.files?.[0]?.createdTime ?? new Date()).getFullYear()
  const oldestPhotoYear = new Date(oldest.files?.[0]?.createdTime ?? new Date()).getFullYear()

  // Also include years from the iPhoto folder index
  let iphotoYears: number[] = []
  try {
    const idx = require('../../../lib/folder-index.json') as Record<string, string[]>
    iphotoYears = Object.keys(idx).map(Number)
  } catch {}

  const allYears = new Set<number>()
  for (let y = newestYear; y >= oldestPhotoYear; y--) allYears.add(y)
  for (const y of iphotoYears) allYears.add(y)

  const years = [...allYears].sort((a, b) => b - a)
  return NextResponse.json({ years })
}
