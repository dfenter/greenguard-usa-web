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

// Parse EXIF date "YYYY:MM:DD HH:MM:SS" → ISO string. Returns null if invalid.
function parseExifDate(raw: string | undefined): string | null {
  if (!raw) return null
  const p = raw.split(/[: ]/)
  if (p.length < 3 || !p[0] || p[0] === '0000') return null
  return `${p[0]}-${p[1]}-${p[2]}T${p[3] ?? '00'}:${p[4] ?? '00'}:${p[5] ?? '00'}.000Z`
}

function mapFile(f: any): DrivePhoto {
  return {
    id: f.id,
    name: f.name,
    // Prefer EXIF date (real photo date) over upload date
    createdTime: parseExifDate(f.imageMediaMetadata?.time) ?? f.createdTime,
    size: parseInt(f.size ?? '0', 10),
    mimeType: f.mimeType,
    thumbnailLink: f.thumbnailLink?.replace(/=s\d+$/, '=s400'),
  }
}

export async function listPhotos(
  pageToken?: string,
  year?: string,
  month?: string
): Promise<{ photos: DrivePhoto[]; nextPageToken?: string }> {
  const token = await getAccessToken()
  const targetYear  = year  ? parseInt(year)  : null
  const targetMonth = month ? parseInt(month) : null

  const q = `mimeType contains 'image/' and trashed = false`

  // For filtered views we scan up to 10 Drive pages (×200 = 2000 photos) to
  // collect 50 that match the requested year/month. Unfiltered views return the
  // first 50 photos with a normal cursor.
  const DRIVE_PAGE = targetYear ? 200 : 50
  const TARGET     = 50
  const MAX_SCAN   = targetYear ? 10 : 1

  let collected: DrivePhoto[] = []
  let driveToken: string | undefined = pageToken
  let scans = 0

  while (scans < MAX_SCAN) {
    const params = new URLSearchParams({
      q,
      orderBy: 'createdTime desc',
      pageSize: String(DRIVE_PAGE),
      fields: 'nextPageToken,files(id,name,createdTime,size,mimeType,thumbnailLink,imageMediaMetadata)',
    })
    if (driveToken) params.set('pageToken', driveToken)

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Drive list failed: ${await res.text()}`)

    const data = await res.json()
    const page: DrivePhoto[] = (data.files ?? []).map(mapFile)

    const matching = targetYear
      ? page.filter(p => {
          const d = new Date(p.createdTime)
          if (isNaN(d.getTime())) return false
          if (d.getFullYear() !== targetYear) return false
          if (targetMonth && d.getMonth() + 1 !== targetMonth) return false
          return true
        })
      : page

    collected = [...collected, ...matching]
    driveToken = data.nextPageToken
    scans++

    if (!driveToken) break
    if (collected.length >= TARGET) break
  }

  return {
    photos: collected.slice(0, TARGET),
    nextPageToken: collected.length >= TARGET ? driveToken : undefined,
  }
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
