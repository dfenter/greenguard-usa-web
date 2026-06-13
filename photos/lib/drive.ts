export interface DrivePhoto {
  id: string
  name: string
  createdTime: string
  size: number
  mimeType: string
  thumbnailLink?: string
}

export async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.PHOTOS_GOOGLE_CLIENT_ID!,
      client_secret: process.env.PHOTOS_GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.PHOTOS_GOOGLE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`)
  return (await res.json()).access_token
}

import { readFileSync } from 'fs'
import { join } from 'path'

interface IndexEntry { id: string; name: string; date: string; thumb?: string; mimeType?: string; size?: number }

let _index: IndexEntry[] | null = null
function getIndex(): IndexEntry[] {
  if (_index) return _index
  try {
    const raw = readFileSync(join(process.cwd(), 'lib', 'photo-index.json'), 'utf8')
    _index = JSON.parse(raw) as IndexEntry[]
  } catch {
    _index = []
  }
  return _index
}

// Serve photos from the pre-built chronological index.
// cursor is a numeric string offset into the (filtered) array.
function isScreenshot(p: IndexEntry): boolean {
  if (p.mimeType === 'image/png') return true
  const lower = p.name.toLowerCase()
  return lower.includes('screenshot') || lower.includes('screen shot') || lower.includes('screen_shot')
}

export function listPhotosFromIndex(
  cursor?: string,
  year?: string,
  month?: string,
  from?: string,
  to?: string,
  search?: string,
  shuffle?: boolean,
  onThisDay?: boolean,
  showVideos?: boolean,
  screenshotsOnly?: boolean,
  personIds?: Set<string>,
  deletedIds?: Set<string>,
  sortAsc?: boolean,
  hideSmall?: boolean,
): { photos: DrivePhoto[]; nextPageToken?: string } {
  const index = getIndex()
  const targetYear  = year  ? parseInt(year)  : null
  const targetMonth = month ? parseInt(month) : null
  const fromMs = from ? new Date(from).getTime() : null
  const toMs   = to   ? new Date(to + 'T23:59:59Z').getTime() : null
  const searchLower = search?.toLowerCase().trim()
  const now = new Date()
  const todayMonth = now.getMonth() + 1
  const todayDay   = now.getDate()

  const needsFilter = targetYear || targetMonth || fromMs || toMs || searchLower || onThisDay || personIds || deletedIds?.size
  let filtered = needsFilter
    ? index.filter(p => {
        const d = new Date(p.date)
        const t = d.getTime()
        if (targetYear  && d.getFullYear()  !== targetYear)  return false
        if (targetMonth && d.getMonth() + 1 !== targetMonth) return false
        if (fromMs && t < fromMs) return false
        if (toMs   && t > toMs)   return false
        if (onThisDay && (d.getMonth() + 1 !== todayMonth || d.getDate() !== todayDay)) return false
        if (searchLower && !p.name.toLowerCase().includes(searchLower)) return false
        if (personIds && !personIds.has(p.id)) return false
        if (deletedIds?.has(p.id)) return false
        return true
      })
    : [...index]

  // By default hide videos; only include when explicitly requested
  if (!showVideos) {
    filtered = filtered.filter(p => !p.mimeType?.startsWith('video/'))
  }

  if (screenshotsOnly) {
    filtered = filtered.filter(isScreenshot)
  }

  // Hide images smaller than 200 KB (low-quality MMS, forwards, thumbnails)
  if (hideSmall) {
    filtered = filtered.filter(p => !p.size || p.size >= 200_000)
  }

  // Shuffle returns random PAGE photos, no pagination
  if (shuffle) {
    for (let i = filtered.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [filtered[i], filtered[j]] = [filtered[j], filtered[i]]
    }
    return {
      photos: filtered.slice(0, 50).map(p => ({
        id: p.id,
        name: p.name,
        createdTime: p.date,
        size: 0,
        mimeType: p.mimeType ?? 'image/jpeg',
        thumbnailLink: p.thumb ?? null,
      })),
      nextPageToken: undefined,
    }
  }

  if (sortAsc) filtered = filtered.slice().reverse()

  const PAGE  = 50
  const start = cursor ? parseInt(cursor) : 0
  const slice = filtered.slice(start, start + PAGE)
  const next  = start + PAGE < filtered.length ? String(start + PAGE) : undefined

  return {
    photos: slice.map(p => ({
      id: p.id,
      name: p.name,
      createdTime: p.date,
      size: 0,
      mimeType: p.mimeType ?? 'image/jpeg',
      thumbnailLink: p.thumb ?? null,
    })),
    nextPageToken: next,
  }
}

// Return sorted list of years present in the index.
export function getIndexYears(): number[] {
  const index = getIndex()
  const years = new Set<number>()
  for (const p of index) {
    const y = new Date(p.date).getFullYear()
    if (y > 1990 && y <= new Date().getFullYear() + 1) years.add(y)
  }
  return [...years].sort((a, b) => b - a)
}

export async function listPhotos(
  pageToken?: string,
  year?: string,
  month?: string,
): Promise<{ photos: DrivePhoto[]; nextPageToken?: string }> {
  const token = await getAccessToken()
  const q = `mimeType contains 'image/' and trashed = false`
  const params = new URLSearchParams({
    q, orderBy: 'createdTime desc', pageSize: '50',
    fields: 'nextPageToken,files(id,name,createdTime,size,mimeType,thumbnailLink)',
  })
  if (pageToken) params.set('pageToken', pageToken)
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Drive list failed: ${await res.text()}`)
  const data = await res.json()
  const photos: DrivePhoto[] = (data.files ?? []).map((f: any) => ({
    id: f.id, name: f.name, createdTime: f.createdTime,
    size: parseInt(f.size ?? '0', 10), mimeType: f.mimeType,
    thumbnailLink: f.thumbnailLink?.replace(/=s\d+$/, '=s400'),
  }))
  return { photos, nextPageToken: data.nextPageToken }
}

export async function getFileStream(id: string): Promise<ReadableStream> {
  const token = await getAccessToken()
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`)
  return res.body!
}

export async function trashPhoto(id: string): Promise<void> {
  const token = await getAccessToken()
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Drive trash failed: ${res.status} ${await res.text()}`)
}
