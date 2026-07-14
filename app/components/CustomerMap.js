import { useEffect, useRef, useState } from 'react'

const STATUS_COLORS = {
  active: '#176f2b',
  trialing: '#176f2b',
  past_due: '#8a5300',
  unpaid: '#b3261e',
  canceled: '#444746',
  inactive: '#444746',
}

export default function CustomerMap({ customers = [], mapsKey, height = 400, compact = false }) {
  const mapRef = useRef(null)
  const mapObj = useRef(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!mapsKey || loaded) return
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
  }, [mapsKey, loaded])

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
      if (geoCache[c.id]) { placeMarker(c, geoCache[c.id]); return }
      setTimeout(() => {
        geocoder.geocode({ address: c.address }, (results, status) => {
          if (status !== 'OK' || !results[0]) return
          const pos = results[0].geometry.location
          geoCache[c.id] = pos
          placeMarker(c, pos)
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
    <div ref={mapRef} style={{ height, width: '100%', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg-card)' }}>
      {!loaded && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: '0.88rem' }}>Loading map…</div>}
    </div>
  )
}
