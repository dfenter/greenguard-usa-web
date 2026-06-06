import { getAccessToken } from './drive'

export type TagMap = Record<string, string[]> // fileId → people[]

const TAGS_FILENAME = 'photo-tags.json'

let _fileId: string | null = null
let _cache: TagMap | null = null

async function findOrCreateTagsFile(token: string): Promise<string> {
  if (_fileId) return _fileId

  // Search for existing file
  const search = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name='${TAGS_FILENAME}' and trashed=false`)}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
  )
  const { files } = await search.json()
  if (files?.length) {
    _fileId = files[0].id
    return _fileId!
  }

  // Create new empty file
  const meta = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: TAGS_FILENAME, mimeType: 'application/json' }),
    cache: 'no-store',
  })
  const { id } = await meta.json()

  // Upload empty content
  await fetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
    cache: 'no-store',
  })

  _fileId = id
  return id
}

export async function loadTags(): Promise<TagMap> {
  if (_cache) return _cache
  try {
    const token = await getAccessToken()
    const fileId = await findOrCreateTagsFile(token)
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
    )
    const text = await res.text()
    _cache = text ? JSON.parse(text) : {}
  } catch {
    _cache = {}
  }
  return _cache!
}

export async function saveTags(tags: TagMap): Promise<void> {
  const token = await getAccessToken()
  const fileId = await findOrCreateTagsFile(token)
  await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(tags),
    cache: 'no-store',
  })
  _cache = tags
}

export async function addTag(fileId: string, person: string): Promise<string[]> {
  const tags = await loadTags()
  const current = tags[fileId] ?? []
  if (!current.includes(person)) {
    tags[fileId] = [...current, person]
    await saveTags(tags)
  }
  return tags[fileId]
}

export async function removeTag(fileId: string, person: string): Promise<string[]> {
  const tags = await loadTags()
  const current = tags[fileId] ?? []
  tags[fileId] = current.filter(p => p !== person)
  if (tags[fileId].length === 0) delete tags[fileId]
  await saveTags(tags)
  return tags[fileId] ?? []
}

export function getPeople(tags: TagMap): { name: string; count: number }[] {
  const counts: Record<string, number> = {}
  for (const people of Object.values(tags)) {
    for (const p of people) counts[p] = (counts[p] ?? 0) + 1
  }
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}
