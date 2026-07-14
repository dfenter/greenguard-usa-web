import { useEffect, useRef, useState } from 'react'

const STATUS_COLORS = {
  active: '#176f2b',
  trialing: '#176f2b',
  past_due: '#8a5300',
  unpaid: '#b3261e',
  canceled: '#444746',
  inactive: '#444746',
}

function addressHash(address) {
  let hash = 2166136261
  for (const char of address.trim().toLowerCase()) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function readCachedGeocode(address) {
  try {
    const raw = window.localStorage.getItem(`greenguard-geocode:${addressHash(address)}`)
    const cached = raw ? JSON.parse(raw) : null
    if (!cached || cached.expiresAt <= Date.now()) return null
    return { lat: cached.lat, lng: cached.lng }
  } catch {
    return null
  }
}

function writeCachedGeocode(address, position) {
  try {
    window.localStorage.setItem(`greenguard-geocode:${addressHash(address)}`, JSON.stringify({
      lat: position.lat,
      lng: position.lng,
      expiresAt: Date.now() + 30 * 86400 * 1000,
    }))
  } catch {}
}

export default function CustomerMap({ customers = [], mapsKey, height = 400, compact = false }) {
  const viewportRef = useRef(null)
  const mapRef = useRef(null)
  const mapObj = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [visible, setVisible] = useState(false)

  // Maps and geocoding are deferred until the map is actually on screen.
  // This observer is one-shot: once visible, the component stays mounted.
  useEffect(() => {
    if (!mapsKey || visible || !viewportRef.current) return undefined
    if (!window.IntersectionObserver) { setVisible(true); return undefined }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setVisible(true)
      observer.disconnect()
    }, { rootMargin: '200px' })
    observer.observe(viewportRef.current)
    return () => observer.disconnect()
  }, [mapsKey, visible])

  useEffect(() => {
    if (!mapsKey || !visible || loaded) return
    if (window.google?.maps) { setLoaded(true); return }
    const existing = document.querySelector('script[data-greenguard-maps]')
    if (existing) {
      existing.addEventListener('load', () => setLoaded(true))
      return
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=marker`
    script.async = true
    script.dataset.greenguardMaps = '1'
    script.onload = () => setLoaded(true)
    document.head.appendChild(script)
  }, [mapsKey, visible, loaded])

  useEffect(() => {
    if (!loaded || !mapRef.current || mapObj.current) return
    mapObj.current = new window.google.maps.Map(mapRef.current, {
      center: { lat: 30.2672, lng: -97.7431 },
      zoom: compact ? 10 : 11,
      disableDefaultUI: compact,
      zoomControl: true,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#444746' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#444746' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#444746' }] },
        { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#ffffff' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#00696d' }] },
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      ],
    })
  }, [loaded, compact])

  useEffect(() => {
    if (!mapObj.current || !loaded) return
    mapObj.current._markers?.forEach((m) => m.setMap(null))
    mapObj.current._markers = []

    const geocoder = new window.google.maps.Geocoder()
    if (!mapObj.current._geoCache) mapObj.current._geoCache = {}
    const geoCache = mapObj.current._geoCache

    function placeMarker(c, pos) {
      const color = STATUS_COLORS[c.status] || '#444746'
      const marker = new window.google.maps.Marker({
        position: pos, map: mapObj.current, title: c.name,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: compact ? 6 : 9, fillColor: color, fillOpacity: 0.9, strokeColor: '#ffffff', strokeWeight: 2 },
      })
      mapObj.current._markers.push(marker)
    }

    customers.forEach((c, idx) => {
      if (!c.address) return
      const cacheKey = addressHash(c.address)
      const persisted = readCachedGeocode(c.address)
      if (persisted) {
        geoCache[cacheKey] = persisted
        placeMarker(c, persisted)
        return
      }
      if (geoCache[cacheKey]) { placeMarker(c, geoCache[cacheKey]); return }
      setTimeout(() => {
        geocoder.geocode({ address: c.address }, (results, status) => {
          if (status !== 'OK' || !results[0]) return
          const pos = results[0].geometry.location
          const literal = { lat: pos.lat(), lng: pos.lng() }
          geoCache[cacheKey] = literal
          writeCachedGeocode(c.address, literal)
          placeMarker(c, literal)
        })
      }, idx * 100)
    })
  }, [loaded, customers, compact])

  if (!mapsKey) {
    return (
      <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg-alt)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        Map unavailable (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set)
      </div>
    )
  }

  return (
    <div ref={viewportRef} style={{ height, width: '100%', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg-card)' }}>
      <div ref={mapRef} style={{ height: '100%', width: '100%' }}>
        {!loaded && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: '0.88rem' }}>{visible ? 'Loading map…' : 'Map will load when visible…'}</div>}
      </div>
    </div>
  )
}
