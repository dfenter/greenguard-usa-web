'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { signOut } from 'next-auth/react'

interface Photo {
  id: string
  name: string
  createdTime: string
  thumbnailLink?: string
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function thumbSrc(photo: Photo) {
  if (photo.thumbnailLink) {
    const b64 = btoa(photo.thumbnailLink).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
    return `/api/thumb/${b64}`
  }
  return `/api/img/${photo.id}?size=thumb`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function groupByMonth(photos: Photo[]) {
  const groups: { label: string; photos: Photo[] }[] = []
  for (const p of photos) {
    const d = new Date(p.createdTime)
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    const last = groups[groups.length - 1]
    if (last?.label === label) last.photos.push(p)
    else groups.push({ label, photos: [p] })
  }
  return groups
}

function PhotoTile({
  photo, onClick, selecting, selected, onToggle,
}: {
  photo: Photo
  onClick: () => void
  selecting: boolean
  selected: boolean
  onToggle: () => void
}) {
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handlePointerDown() {
    if (selecting) return
    longPressTimer.current = setTimeout(onToggle, 500)
  }
  function handlePointerUp() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }
  function handleClick() {
    if (selecting) { onToggle(); return }
    onClick()
  }

  return (
    <div
      className={`photo-tile${loaded ? ' loaded' : ''}${selected ? ' selected' : ''}`}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {!errored && (
        <img
          src={thumbSrc(photo)}
          alt={photo.name}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => { setErrored(true); setLoaded(true) }}
          draggable={false}
        />
      )}
      {errored && <div className="tile-error">!</div>}
      {selecting && (
        <div className={`tile-check${selected ? ' checked' : ''}`}>
          {selected && <span>✓</span>}
        </div>
      )}
      {!selecting && <div className="overlay">{formatDate(photo.createdTime)}</div>}
    </div>
  )
}

function Lightbox({ photos, index, onClose, onPrev, onNext, onDelete }: {
  photos: Photo[]
  index: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onDelete: (id: string) => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)

  useEffect(() => {
    setImgLoaded(false)
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [index, onClose, onPrev, onNext])

  const photo = photos[index]

  async function handleDelete() {
    if (!confirm(`Move "${photo.name}" to trash?`)) return
    setDeleting(true)
    try {
      const r = await fetch(`/api/photos/${photo.id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      onDelete(photo.id)
    } catch {
      alert('Could not delete photo. Try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose}>×</button>
      <button
        className={`lightbox-delete${deleting ? ' busy' : ''}`}
        onClick={e => { e.stopPropagation(); handleDelete() }}
        disabled={deleting}
        title="Move to trash"
      >
        {deleting ? '…' : '⌫'}
      </button>
      <button className="lightbox-nav prev" onClick={e => { e.stopPropagation(); onPrev() }}>‹</button>
      <div className="lightbox-img-wrap" onClick={e => e.stopPropagation()}>
        {!imgLoaded && <div className="lightbox-spinner" />}
        <img
          src={`/api/img/${photo.id}?size=full`}
          alt={photo.name}
          onLoad={() => setImgLoaded(true)}
          style={{ opacity: imgLoaded ? 1 : 0 }}
        />
      </div>
      <button className="lightbox-nav next" onClick={e => { e.stopPropagation(); onNext() }}>›</button>
      <div className="lightbox-info">
        <span>{photo.name.replace(/\.[^.]+$/, '')}</span>
        <span className="lightbox-info-sep">·</span>
        <span>{formatDate(photo.createdTime)}</span>
        <span className="lightbox-info-sep">·</span>
        <span>{index + 1} / {photos.length}</span>
      </div>
    </div>
  )
}

export default function GalleryPage() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const [years, setYears] = useState<number[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)

  // Selection mode
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)
  const cursorRef = useRef<string | null>(null)
  const hasMoreRef = useRef(true)

  useEffect(() => {
    fetch('/api/years').then(r => r.json()).then(d => setYears(d.years ?? []))
  }, [])

  const buildUrl = useCallback((cur?: string | null) => {
    const p = new URLSearchParams()
    if (cur) p.set('cursor', cur)
    if (selectedYear) p.set('year', String(selectedYear))
    if (selectedMonth) p.set('month', String(selectedMonth))
    return `/api/photos?${p}`
  }, [selectedYear, selectedMonth])

  const loadMore = useCallback(async (reset = false) => {
    if (loadingRef.current) return
    if (!reset && !hasMoreRef.current) return
    loadingRef.current = true
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(buildUrl(reset ? null : cursorRef.current))
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? `Error ${res.status}`)
        setHasMore(false); hasMoreRef.current = false
        return
      }
      const incoming: Photo[] = data.photos ?? []
      setPhotos(prev => reset ? incoming : [...prev, ...incoming])
      const next = data.nextPageToken ?? null
      cursorRef.current = next
      setCursor(next)
      hasMoreRef.current = !!next
      setHasMore(!!next)
    } catch (e: any) {
      setError(e.message ?? 'Failed to load photos')
      setHasMore(false); hasMoreRef.current = false
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [buildUrl])

  // After each page loads, re-check if the sentinel is still visible.
  // IntersectionObserver only fires on state *change*, so if the sentinel
  // was already in view when observer mounted it fires once then stops.
  // This covers the case where 50 photos don't fill the screen.
  useEffect(() => {
    if (loading) return
    const el = sentinelRef.current
    if (!el || !hasMoreRef.current) return
    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight + 600) loadMore()
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cursorRef.current = null; hasMoreRef.current = true
    setPhotos([]); setCursor(null); setHasMore(true); setError(null)
    setSelecting(false); setSelected(new Set())
    loadMore(true)
  }, [selectedYear, selectedMonth]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore() },
      { rootMargin: '400px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore])

  // Close selection on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selecting) { setSelecting(false); setSelected(new Set()) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [selecting])

  function toggleSelect(id: string) {
    if (!selecting) setSelecting(true)
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(photos.map(p => p.id)))
  }

  async function bulkDelete() {
    if (selected.size === 0) return
    if (!confirm(`Move ${selected.size} photo${selected.size === 1 ? '' : 's'} to trash?`)) return
    setBulkDeleting(true)
    const ids = [...selected]
    const results = await Promise.allSettled(
      ids.map(id => fetch(`/api/photos/${id}`, { method: 'DELETE' }))
    )
    const deleted = ids.filter((_, i) => results[i].status === 'fulfilled' && (results[i] as PromiseFulfilledResult<Response>).value.ok)
    setPhotos(prev => prev.filter(p => !deleted.includes(p.id)))
    setSelected(new Set())
    setSelecting(false)
    setBulkDeleting(false)
    const failed = ids.length - deleted.length
    if (failed > 0) alert(`${failed} photo${failed === 1 ? '' : 's'} could not be deleted.`)
  }

  function handleDelete(id: string) {
    setPhotos(prev => prev.filter(p => p.id !== id))
    setLightboxIndex(null)
  }

  function selectYear(y: number) {
    if (selectedYear === y) { setSelectedYear(null); setSelectedMonth(null) }
    else { setSelectedYear(y); setSelectedMonth(null) }
  }

  const groups = groupByMonth(photos)

  return (
    <>
      <div className="header">
        <div className="header-top">
          <span className="header-title">Fenter Family Photos</span>
          <div className="header-actions">
            {photos.length > 0 && !selecting && (
              <span className="photo-count">{photos.length.toLocaleString()}{hasMore ? '+' : ''}</span>
            )}
            {!selecting ? (
              <button
                className="select-btn"
                onClick={() => setSelecting(true)}
                title="Select photos"
              >
                Select
              </button>
            ) : (
              <button
                className="select-btn cancel"
                onClick={() => { setSelecting(false); setSelected(new Set()) }}
              >
                Cancel
              </button>
            )}
            <button className="signout-btn" onClick={() => signOut()}>Sign out</button>
          </div>
        </div>

        {!selecting && (
          <>
            <div className="year-bar">
              <button
                className={`year-pill${!selectedYear ? ' active' : ''}`}
                onClick={() => { setSelectedYear(null); setSelectedMonth(null) }}
              >
                All
              </button>
              {years.map(y => (
                <button
                  key={y}
                  className={`year-pill${selectedYear === y ? ' active' : ''}`}
                  onClick={() => selectYear(y)}
                >
                  {y}
                </button>
              ))}
            </div>

            {selectedYear && (
              <div className="month-bar">
                {MONTHS.map((name, i) => (
                  <button
                    key={i}
                    className={`month-pill${selectedMonth === i + 1 ? ' active' : ''}`}
                    onClick={() => setSelectedMonth(selectedMonth === i + 1 ? null : i + 1)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="gallery-container">
        {error && <div className="error-banner">Failed to load photos: {error}</div>}

        {groups.map(group => (
          <div key={group.label}>
            <div className="month-heading">{group.label}</div>
            <div className="photo-grid">
              {group.photos.map(photo => (
                <PhotoTile
                  key={photo.id}
                  photo={photo}
                  onClick={() => { if (!selecting) setLightboxIndex(photos.indexOf(photo)) }}
                  selecting={selecting}
                  selected={selected.has(photo.id)}
                  onToggle={() => toggleSelect(photo.id)}
                />
              ))}
            </div>
          </div>
        ))}

        {photos.length === 0 && !loading && !error && (
          <div className="empty-state">No photos found</div>
        )}

        {loading && (
          <div className="load-row">
            <div className="dot-spinner"><span /><span /><span /></div>
          </div>
        )}

        <div ref={sentinelRef} style={{ height: 1 }} />

        {!hasMore && photos.length > 0 && !loading && (
          <div className="count-label">{photos.length.toLocaleString()} photos</div>
        )}
      </div>

      {/* Bulk action bar */}
      {selecting && (
        <div className="bulk-bar">
          <span className="bulk-count">
            {selected.size > 0 ? `${selected.size} selected` : 'Tap to select'}
          </span>
          <div className="bulk-actions">
            {selected.size < photos.length && (
              <button className="bulk-btn" onClick={selectAll}>
                Select all ({photos.length})
              </button>
            )}
            <button
              className={`bulk-btn delete${selected.size === 0 ? ' disabled' : ''}`}
              onClick={bulkDelete}
              disabled={selected.size === 0 || bulkDeleting}
            >
              {bulkDeleting ? 'Deleting…' : `Trash ${selected.size || ''}`}
            </button>
          </div>
        </div>
      )}

      {lightboxIndex !== null && !selecting && (
        <Lightbox
          photos={photos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex(i => Math.max(0, (i ?? 0) - 1))}
          onNext={() => setLightboxIndex(i => Math.min(photos.length - 1, (i ?? 0) + 1))}
          onDelete={handleDelete}
        />
      )}
    </>
  )
}
