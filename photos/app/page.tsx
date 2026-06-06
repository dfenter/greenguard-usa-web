'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { signOut } from 'next-auth/react'

interface Photo {
  id: string
  name: string
  createdTime: string
  thumbnailLink?: string | null
  mimeType?: string
  people?: string[]
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function isVideo(p: Photo) {
  return p.mimeType?.startsWith('video/') ?? false
}

function thumbSrc(photo: Photo) {
  // Always proxy through our API — thumbnailLink CDN URLs expire within hours
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
  const video = isVideo(photo)

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
      {video && !errored && <div className="tile-video-icon">▶</div>}
      {selecting && (
        <div className={`tile-check${selected ? ' checked' : ''}`}>
          {selected && <span>✓</span>}
        </div>
      )}
      {!selecting && <div className="overlay">{formatDate(photo.createdTime)}</div>}
    </div>
  )
}

function Lightbox({ photos, index, onClose, onPrev, onNext, onDelete, onTagsChange, initialPlaying }: {
  photos: Photo[]
  index: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onDelete: (id: string) => void
  onTagsChange: (id: string, people: string[]) => void
  initialPlaying?: boolean
}) {
  const [deleting, setDeleting] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [playing, setPlaying] = useState(initialPlaying ?? false)
  const playRef = useRef(false)
  const [showTagger, setShowTagger] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [tagSaving, setTagSaving] = useState(false)
  const [rotation, setRotation] = useState(0)

  // Sync ref so interval callback sees current value
  useEffect(() => { playRef.current = playing }, [playing])

  // Slideshow auto-advance
  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => {
      if (playRef.current) onNext()
    }, 3000)
    return () => clearInterval(timer)
  }, [playing, onNext])

  useEffect(() => {
    setImgLoaded(false)
    setShowTagger(false)
    setTagInput('')
    setRotation(0)
  }, [index])

  async function handleAddTag() {
    const name = tagInput.trim()
    if (!name || tagSaving) return
    setTagSaving(true)
    const r = await fetch('/api/tag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: photo.id, person: name, action: 'add' }),
    })
    if (r.ok) {
      const { people } = await r.json()
      onTagsChange(photo.id, people)
      setTagInput('')
    }
    setTagSaving(false)
  }

  async function handleRemoveTag(person: string) {
    setTagSaving(true)
    const r = await fetch('/api/tag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: photo.id, person, action: 'remove' }),
    })
    if (r.ok) {
      const { people } = await r.json()
      onTagsChange(photo.id, people)
    }
    setTagSaving(false)
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPlaying(false); onClose() }
      if (e.key === 'ArrowLeft')  { setPlaying(false); onPrev() }
      if (e.key === 'ArrowRight') { setPlaying(false); onNext() }
      if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, onPrev, onNext])

  const photo = photos[index]
  const video = isVideo(photo)

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
    <div className="lightbox-backdrop" onClick={() => { setPlaying(false); onClose() }}>
      <button className="lightbox-close" onClick={() => { setPlaying(false); onClose() }}>×</button>

      {/* Slideshow play/pause */}
      <button
        className={`lightbox-play${playing ? ' playing' : ''}`}
        onClick={e => { e.stopPropagation(); setPlaying(p => !p) }}
        title={playing ? 'Pause slideshow (Space)' : 'Play slideshow (Space)'}
      >
        {playing ? '⏸' : '▶'}
      </button>

      {/* Download */}
      <a
        className="lightbox-download"
        href={`/api/download/${photo.id}`}
        download
        onClick={e => e.stopPropagation()}
        title="Download original"
      >
        ↓
      </a>

      {/* Tag */}
      <button
        className={`lightbox-tag${showTagger ? ' active' : ''}`}
        onClick={e => { e.stopPropagation(); setShowTagger(s => !s) }}
        title="Tag people"
      >
        🏷
      </button>

      {/* Rotate */}
      <button className="lightbox-rotate left" onClick={e => { e.stopPropagation(); setRotation(r => (r - 90 + 360) % 360) }} title="Rotate left">↺</button>
      <button className="lightbox-rotate right" onClick={e => { e.stopPropagation(); setRotation(r => (r + 90) % 360) }} title="Rotate right">↻</button>

      {/* Trash */}
      <button
        className={`lightbox-delete${deleting ? ' busy' : ''}`}
        onClick={e => { e.stopPropagation(); handleDelete() }}
        disabled={deleting}
        title="Move to trash"
      >
        {deleting ? '…' : '⌫'}
      </button>

      <button className="lightbox-nav prev" onClick={e => { e.stopPropagation(); setPlaying(false); onPrev() }}>‹</button>

      <div className="lightbox-img-wrap" onClick={e => e.stopPropagation()}>
        {!imgLoaded && !video && <div className="lightbox-spinner" />}
        {video ? (
          <video
            key={photo.id}
            src={`/api/video/${photo.id}`}
            controls
            autoPlay
            style={{ maxWidth: '96vw', maxHeight: '90vh' }}
            onLoadedData={() => setImgLoaded(true)}
          />
        ) : (
          <img
            src={`/api/img/${photo.id}?size=full`}
            alt={photo.name}
            onLoad={() => setImgLoaded(true)}
            style={{ opacity: imgLoaded ? 1 : 0, transform: `rotate(${rotation}deg)`, transition: 'transform 0.2s ease' }}
          />
        )}
      </div>

      <button className="lightbox-nav next" onClick={e => { e.stopPropagation(); setPlaying(false); onNext() }}>›</button>
      <div className="lightbox-info">
        <span>{photo.name.replace(/\.[^.]+$/, '')}</span>
        <span className="lightbox-info-sep">·</span>
        <span>{formatDate(photo.createdTime)}</span>
        <span className="lightbox-info-sep">·</span>
        <span>{index + 1} / {photos.length}</span>
      </div>

      {showTagger && (
        <div className="tagger-panel" onClick={e => e.stopPropagation()}>
          <div className="tagger-tags">
            {(photo.people ?? []).length === 0 && (
              <span className="tagger-empty">No people tagged</span>
            )}
            {(photo.people ?? []).map(p => (
              <span key={p} className="tagger-chip">
                {p}
                <button className="tagger-chip-remove" onClick={() => handleRemoveTag(p)} disabled={tagSaving}>×</button>
              </span>
            ))}
          </div>
          <div className="tagger-input-row">
            <input
              className="tagger-input"
              placeholder="Add person…"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddTag() }}
              autoFocus
            />
            <button className="tagger-add-btn" onClick={handleAddTag} disabled={tagSaving || !tagInput.trim()}>
              {tagSaving ? '…' : 'Add'}
            </button>
          </div>
        </div>
      )}
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
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [dateRangeActive, setDateRangeActive] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [searchActive, setSearchActive] = useState(false)
  const [shuffleMode, setShuffleMode] = useState(false)
  const [onThisDay, setOnThisDay] = useState(false)
  const [showVideos, setShowVideos] = useState(false)
  const [showScreenshots, setShowScreenshots] = useState(false)
  const [slideshowStart, setSlideshowStart] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null)
  const [peopleList, setPeopleList] = useState<{ name: string; count: number }[]>([])

  // Selection mode
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkDownloading, setBulkDownloading] = useState(false)

  const sentinelRef = useRef<HTMLDivElement>(null)
  const pendingSlideshowRef = useRef(false)
  const loadingRef = useRef(false)
  const cursorRef = useRef<string | null>(null)
  const hasMoreRef = useRef(true)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/years').then(r => r.json()).then(d => setYears(d.years ?? []))
    fetch('/api/people').then(r => r.json()).then(d => setPeopleList(d.people ?? []))
  }, [])

  const buildUrl = useCallback((cur?: string | null) => {
    const p = new URLSearchParams()
    if (cur) p.set('cursor', cur)
    if (shuffleMode)              { p.set('shuffle', '1'); if (showVideos) p.set('videos', '1'); return `/api/photos?${p}` }
    if (onThisDay)                p.set('onthisday', '1')
    if (showVideos)               p.set('videos', '1')
    if (showScreenshots)          p.set('screenshots', '1')
    if (selectedPerson)           p.set('person', selectedPerson)
    if (searchActive && searchText) p.set('search', searchText)
    if (dateRangeActive && fromDate) p.set('from', fromDate)
    if (dateRangeActive && toDate)   p.set('to', toDate)
    if (!dateRangeActive && !searchActive && !onThisDay && selectedYear)
      p.set('year', String(selectedYear))
    if (!dateRangeActive && !searchActive && !onThisDay && selectedMonth)
      p.set('month', String(selectedMonth))
    return `/api/photos?${p}`
  }, [selectedYear, selectedMonth, fromDate, toDate, dateRangeActive,
      searchText, searchActive, shuffleMode, onThisDay, showScreenshots, selectedPerson])

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
  }, [selectedYear, selectedMonth, fromDate, toDate, dateRangeActive,
      searchActive, searchText, shuffleMode, onThisDay, showVideos, showScreenshots, selectedPerson]) // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    if (pendingSlideshowRef.current && photos.length > 0 && !loading) {
      pendingSlideshowRef.current = false
      setSlideshowStart(true)
      setLightboxIndex(0)
    }
  }, [photos, loading])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selecting) { setSelecting(false); setSelected(new Set()) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [selecting])

  function handleSearchInput(val: string) {
    setSearchText(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearchActive(val.trim().length > 0)
      if (val.trim().length > 0) {
        setSelectedYear(null); setSelectedMonth(null)
        setDateRangeActive(false); setShuffleMode(false); setOnThisDay(false)
      }
    }, 400)
  }

  function clearSearch() {
    setSearchText(''); setSearchActive(false)
    if (searchTimer.current) clearTimeout(searchTimer.current)
  }

  function toggleShuffle() {
    const next = !shuffleMode
    setShuffleMode(next)
    if (next) {
      setSelectedYear(null); setSelectedMonth(null)
      setDateRangeActive(false); setSearchActive(false); setOnThisDay(false)
    }
  }

  function toggleOnThisDay() {
    const next = !onThisDay
    setOnThisDay(next)
    if (next) {
      setSelectedYear(null); setSelectedMonth(null)
      setDateRangeActive(false); setSearchActive(false); setShuffleMode(false)
    }
  }

  function toggleScreenshots() {
    setShowScreenshots(s => !s)
  }

  function startSlideshow() {
    pendingSlideshowRef.current = true
    setShuffleMode(true)
    setSelectedYear(null); setSelectedMonth(null)
    setDateRangeActive(false); setSearchActive(false); setSearchText(''); setOnThisDay(false)
  }

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
    setSelected(new Set()); setSelecting(false); setBulkDeleting(false)
    const failed = ids.length - deleted.length
    if (failed > 0) alert(`${failed} could not be deleted.`)
  }

  async function bulkDownload() {
    if (selected.size === 0) return
    setBulkDownloading(true)
    // Trigger individual file downloads sequentially with small delay
    const ids = [...selected]
    for (const id of ids) {
      const a = document.createElement('a')
      a.href = `/api/download/${id}`
      a.download = ''
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      await new Promise(r => setTimeout(r, 300))
    }
    setBulkDownloading(false)
  }

  function handleDelete(id: string) {
    setPhotos(prev => prev.filter(p => p.id !== id))
    setLightboxIndex(null)
  }

  function handleTagsChange(id: string, people: string[]) {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, people } : p))
    fetch('/api/people').then(r => r.json()).then(d => setPeopleList(d.people ?? []))
  }

  function selectPerson(name: string) {
    setSelectedPerson(prev => prev === name ? null : name)
    setSelectedYear(null); setSelectedMonth(null)
    setShuffleMode(false); setOnThisDay(false)
    setSearchActive(false); setSearchText(''); setDateRangeActive(false)
  }

  function selectYear(y: number) {
    setDateRangeActive(false); setSearchActive(false); setShuffleMode(false); setOnThisDay(false)
    if (selectedYear === y) { setSelectedYear(null); setSelectedMonth(null) }
    else { setSelectedYear(y); setSelectedMonth(null) }
  }

  function applyDateRange() {
    if (!fromDate && !toDate) return
    setSelectedYear(null); setSelectedMonth(null)
    setSearchActive(false); setShuffleMode(false); setOnThisDay(false)
    setDateRangeActive(true)
  }

  function clearDateRange() {
    setFromDate(''); setToDate(''); setDateRangeActive(false)
  }

  const groups = groupByMonth(photos)
  const todayLabel = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

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
              <button className="select-btn" onClick={() => setSelecting(true)} title="Select photos">
                Select
              </button>
            ) : (
              <button className="select-btn cancel"
                onClick={() => { setSelecting(false); setSelected(new Set()) }}>
                Cancel
              </button>
            )}
            <button className="signout-btn" onClick={() => signOut()}>Sign out</button>
          </div>
        </div>

        {!selecting && (
          <>
            {/* Search + quick actions */}
            <div className="search-bar">
              <div className="search-input-wrap">
                <input
                  type="search"
                  className="search-input"
                  placeholder="Search by filename…"
                  value={searchText}
                  onChange={e => handleSearchInput(e.target.value)}
                />
                {searchText && (
                  <button className="search-clear" onClick={clearSearch}>×</button>
                )}
              </div>
              <button
                className={`quick-btn${shuffleMode ? ' active' : ''}`}
                onClick={toggleShuffle}
                title="Show 50 random photos"
              >
                🔀 Shuffle
              </button>
              <button
                className={`quick-btn${onThisDay ? ' active' : ''}`}
                onClick={toggleOnThisDay}
                title={`Photos from ${todayLabel} in past years`}
              >
                📅 On This Day
              </button>
              <button
                className={`quick-btn${showScreenshots ? ' active' : ''}`}
                onClick={toggleScreenshots}
                title="Show only screenshots"
              >
                📱 Screenshots
              </button>
              {peopleList.map(({ name }) => (
                <button
                  key={name}
                  className={`quick-btn${selectedPerson === name ? ' active' : ''}`}
                  onClick={() => selectPerson(name)}
                  title={`Photos of ${name}`}
                >
                  👤 {name}
                </button>
              ))}
              <button
                className="quick-btn"
                onClick={startSlideshow}
                disabled={photos.length === 0}
                title="Start slideshow (auto-advances every 3s)"
              >
                ▶ Slideshow
              </button>
              <label className="video-toggle">
                <input
                  type="checkbox"
                  checked={showVideos}
                  onChange={e => setShowVideos(e.target.checked)}
                />
                Videos
              </label>
            </div>

            {/* Date range */}
            <div className="date-range-bar">
              <input type="date" className="date-input" value={fromDate}
                onChange={e => setFromDate(e.target.value)} />
              <span className="date-sep">–</span>
              <input type="date" className="date-input" value={toDate}
                onChange={e => setToDate(e.target.value)} />
              <button
                className={`date-go-btn${dateRangeActive ? ' active' : ''}`}
                onClick={dateRangeActive ? clearDateRange : applyDateRange}
              >
                {dateRangeActive ? 'Clear' : 'Go'}
              </button>
            </div>

            {/* Year bar */}
            <div className="year-bar">
              <button
                className={`year-pill${!selectedYear && !shuffleMode && !onThisDay && !searchActive && !dateRangeActive ? ' active' : ''}`}
                onClick={() => { setSelectedYear(null); setSelectedMonth(null); setShuffleMode(false); setOnThisDay(false); setSearchActive(false); clearSearch(); clearDateRange() }}
              >
                All
              </button>
              {years.map(y => (
                <button key={y}
                  className={`year-pill${selectedYear === y ? ' active' : ''}`}
                  onClick={() => selectYear(y)}>
                  {y}
                </button>
              ))}
            </div>

            {selectedYear && (
              <div className="month-bar">
                {MONTHS.map((name, i) => (
                  <button key={i}
                    className={`month-pill${selectedMonth === i + 1 ? ' active' : ''}`}
                    onClick={() => setSelectedMonth(selectedMonth === i + 1 ? null : i + 1)}>
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

        {photos.length > 0 && !loading && (
          <div className="hero-slideshow">
            <button className="hero-slideshow-btn" onClick={startSlideshow}>▶ Random Slideshow</button>
          </div>
        )}

        {onThisDay && photos.length === 0 && !loading && !error && (
          <div className="empty-state">No photos found for {todayLabel} in past years</div>
        )}

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

        {photos.length === 0 && !loading && !error && !onThisDay && (
          <div className="empty-state">No photos found</div>
        )}

        {loading && (
          <div className="load-row">
            <div className="dot-spinner"><span /><span /><span /></div>
          </div>
        )}

        <div ref={sentinelRef} style={{ height: 1 }} />

        {!hasMore && photos.length > 0 && !loading && (
          <div className="count-label">{photos.length.toLocaleString()} {shuffleMode ? 'random photos' : 'photos'}</div>
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
                All ({photos.length})
              </button>
            )}
            <button
              className={`bulk-btn${selected.size === 0 ? ' disabled' : ''}`}
              onClick={bulkDownload}
              disabled={selected.size === 0 || bulkDownloading}
            >
              {bulkDownloading ? 'Downloading…' : `↓ Download ${selected.size || ''}`}
            </button>
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
          onClose={() => { setLightboxIndex(null); setSlideshowStart(false) }}
          onPrev={() => setLightboxIndex(i => Math.max(0, (i ?? 0) - 1))}
          onNext={() => setLightboxIndex(i => Math.min(photos.length - 1, (i ?? 0) + 1))}
          onDelete={handleDelete}
          onTagsChange={handleTagsChange}
          initialPlaying={slideshowStart}
        />
      )}
    </>
  )
}
