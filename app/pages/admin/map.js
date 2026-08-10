import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { useLazyData, LazyLoading, LazyError } from '../../components/useLazyData'

export async function getServerSideProps({ req, res }) {
  res?.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=60')
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }
  return { props: {} }
}

// Google Maps requires resolved literals. Keep these separate from the DOM tokens below.
const STATUS_COLORS = {
  active: '#176f2b',
  trialing: '#176f2b',
  past_due: '#8a5300',
  unpaid: '#b3261e',
  canceled: '#444746',
  inactive: '#444746',
}

const STATUS_TOKENS = {
  active: 'var(--ok)',
  trialing: 'var(--ok)',
  past_due: 'var(--warn)',
  unpaid: 'var(--danger)',
  canceled: 'var(--text-dim)',
  inactive: 'var(--text-dim)',
}

function Legend() {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.75rem', color: 'rgba(var(--text-rgb),0.6)', marginBottom: 12 }}>
      {[['active', 'Active'], ['past_due', 'Past Due'], ['inactive', 'Inactive']].map(([s, l]) => (
        <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_TOKENS[s], display: 'inline-block' }} />{l}
        </span>
      ))}
    </div>
  )
}

export default function SystemMap() {
  const { data, error, reload } = useLazyData('/api/admin/map-data')
  if (error) return <LazyError error={error} onRetry={reload} />
  if (!data) return <LazyLoading />
  return <SystemMapView {...data} />
}

function SystemMapView({ customers, mapsKey }) {
  const mapRef = useRef(null)
  const mapObj = useRef(null)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('all')
  const [loaded, setLoaded] = useState(false)

  const filtered = customers.filter((c) =>
    filter === 'all' ? true : filter === 'active' ? ['active', 'trialing'].includes(c.status) : c.status === filter
  )

  useEffect(() => {
    if (!mapsKey || loaded) return
    if (window.google?.maps) { setLoaded(true); return }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=marker`
    script.async = true
    script.onload = () => setLoaded(true)
    document.head.appendChild(script)
  }, [mapsKey, loaded])

  useEffect(() => {
    if (!loaded || !mapRef.current || mapObj.current) return
    mapObj.current = new window.google.maps.Map(mapRef.current, {
      center: { lat: 30.2672, lng: -97.7431 }, // Austin, TX
      zoom: 11,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#f5f5f7' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#444746' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
        { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#dfe4e1' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dce9f5' }] },
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      ],
    })
  }, [loaded])

  // Add markers — use pre-geocoded coords when available, geocode and cache when not
  useEffect(() => {
    if (!mapObj.current || !loaded) return
    mapObj.current._markers?.forEach((m) => m.setMap(null))
    mapObj.current._markers = []

    const geocoder = new window.google.maps.Geocoder()
    const infoWindow = new window.google.maps.InfoWindow()
    // Session-level geocode cache (survives filter changes, resets on page reload)
    if (!mapObj.current._geoCache) mapObj.current._geoCache = {}
    const geoCache = mapObj.current._geoCache

    function placeMarker(c, pos) {
      const color = STATUS_COLORS[c.status] || '#444746'
      const marker = new window.google.maps.Marker({
        position: pos,
        map: mapObj.current,
        title: c.name,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: color, fillOpacity: 0.9, strokeColor: '#ffffff', strokeWeight: 2 },
      })
      marker.addListener('click', () => {
        const container = document.createElement('div')
        container.style.cssText = 'font-family:sans-serif;padding:4px;min-width:160px;'
        const strong = document.createElement('strong')
        strong.style.fontSize = '0.9rem'
        strong.textContent = c.name
        const emailEl = document.createElement('div')
        emailEl.style.cssText = 'font-size:0.75rem;color:var(--text-muted);'
        emailEl.textContent = c.email
        const addrEl = document.createElement('div')
        addrEl.style.cssText = 'font-size:0.75rem;color:var(--text-muted);'
        addrEl.textContent = c.address
        container.append(strong, emailEl, addrEl)
        if (c.plan) {
          const planEl = document.createElement('div')
          planEl.style.fontSize = '0.75rem'
          planEl.textContent = c.plan
          container.append(planEl)
        }
        infoWindow.setContent(container)
        infoWindow.open(mapObj.current, marker)
        setSelected(c)
      })
      mapObj.current._markers.push(marker)
    }

    filtered.forEach((c) => {
      if (!c.address) return
      // Use session cache to avoid re-geocoding on filter change
      if (geoCache[c.id]) {
        placeMarker(c, geoCache[c.id])
        return
      }
      // Stagger geocode requests to avoid rate limits (100ms apart)
      const idx = filtered.indexOf(c)
      setTimeout(() => {
        geocoder.geocode({ address: c.address }, (results, status) => {
          if (status !== 'OK' || !results[0]) return
          const pos = results[0].geometry.location
          geoCache[c.id] = pos
          placeMarker(c, pos)
        })
      }, idx * 100)
    })
  }, [loaded, filtered]) // eslint-disable-line react-hooks/exhaustive-deps

  const FILTER_TABS = [
    { key: 'all', label: `All (${customers.length})` },
    { key: 'active', label: 'Active' },
    { key: 'past_due', label: 'Past Due' },
    { key: 'inactive', label: 'Inactive' },
  ]

  return (
    <>
      <Head><title>System Map · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin>
        <div style={{ marginBottom: 16 }}>
          <span className="tag">Admin</span>
          <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>System Map</h1>
          <p style={{ fontSize: '0.85rem', color: 'rgba(var(--text-rgb),0.45)', margin: 0 }}>Active customer installations across the service area</p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {FILTER_TABS.map((t) => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              style={{ padding: '6px 14px', borderRadius: 4, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'inherit', background: filter === t.key ? 'var(--gold)' : 'rgba(var(--gold-rgb),0.1)', color: filter === t.key ? 'var(--text-on-accent)' : 'var(--gold)' }}>
              {t.label}
            </button>
          ))}
        </div>

        <Legend />

        {!mapsKey ? (
          <div className="card">
            <p style={{ color: 'rgba(var(--text-rgb),0.5)', margin: 0 }}>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set in Vercel.</p>
          </div>
        ) : (
          <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
            {/* Map */}
            <div ref={mapRef} style={{ height: 600, borderRadius: 12, border: '1px solid rgba(var(--border-rgb),0.2)', overflow: 'hidden', background: 'var(--bg-card)' }}>
              {!loaded && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(var(--text-rgb),0.3)', fontSize: '0.88rem' }}>Loading map…</div>}
            </div>

            {/* Customer list sidebar */}
            <div style={{ maxHeight: 600, overflowY: 'auto' }}>
              {filtered.map((c) => (
                <div key={c.id}
                  onClick={() => setSelected(c)}
                  style={{
                    padding: '12px 14px', borderRadius: 8, marginBottom: 8, cursor: 'pointer',
                    background: selected?.id === c.id ? 'rgba(var(--gold-rgb),0.08)' : 'var(--bg-alt)',
                    border: `1px solid ${selected?.id === c.id ? 'rgba(var(--gold-rgb),0.3)' : 'rgba(var(--border-rgb),0.12)'}`,
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_TOKENS[c.status] || 'var(--text-dim)', flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(var(--text-rgb),0.4)', paddingLeft: 16 }}>{c.address}</div>
                  {c.plan && <div style={{ fontSize: '0.72rem', color: 'rgba(var(--text-rgb),0.35)', paddingLeft: 16, marginTop: 2 }}>{c.plan}</div>}
                </div>
              ))}
              {filtered.length === 0 && <p style={{ color: 'rgba(var(--text-rgb),0.35)', fontSize: '0.82rem', padding: '12px 0' }}>No customers with addresses in this filter.</p>}
            </div>
          </div>
        )}

        <p style={{ marginTop: 10, fontSize: '0.72rem', color: 'rgba(var(--text-rgb),0.25)' }}>
          {filtered.length} of {customers.length} customers have addresses · Geocoding may take a few seconds
        </p>
      </PortalLayout>
    </>
  )
}
