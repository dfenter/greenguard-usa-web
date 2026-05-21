import Head from 'next/head'
import { useState, useEffect, useRef, useCallback } from 'react'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { listAllContacts } from '../../lib/hubspot'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session || session.email !== (process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com')) {
    return { redirect: { destination: '/dashboard', permanent: false } }
  }

  let contacts = []
  try {
    const raw = await listAllContacts(200)
    contacts = raw.map((c) => {
      const p = c.properties || {}
      return {
        id: c.id,
        email: p.email,
        name: [p.firstname, p.lastname].filter(Boolean).join(' ') || p.email,
        address: p.address || null,
      }
    }).filter((c) => c.email)
  } catch {
    contacts = []
  }

  return { props: { isAdmin: true, contacts } }
}

export default function AdminMapPage({ isAdmin, contacts }) {
  const mapRef = useRef(null)
  const googleMapRef = useRef(null)
  const markersRef = useRef([])

  const [selectedEmail, setSelectedEmail] = useState('')
  const [markers, setMarkers] = useState([])
  const [selectedMarkerIdx, setSelectedMarkerIdx] = useState(null)
  const [editLabel, setEditLabel] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)
  const [loading, setLoading] = useState(false)
  const [mapsLoaded, setMapsLoaded] = useState(false)

  // Load Google Maps script
  useEffect(() => {
    if (window.google?.maps) { setMapsLoaded(true); return }
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!key) return
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`
    script.async = true
    script.onload = () => setMapsLoaded(true)
    document.head.appendChild(script)
  }, [])

  // Initialize map once Maps is loaded
  useEffect(() => {
    if (!mapsLoaded || !mapRef.current || googleMapRef.current) return
    googleMapRef.current = new window.google.maps.Map(mapRef.current, {
      center: { lat: 30.2672, lng: -97.7431 }, // Austin TX default
      zoom: 12,
      mapTypeId: 'satellite',
      tilt: 0,
    })
    googleMapRef.current.addListener('click', (e) => {
      const lat = e.latLng.lat()
      const lng = e.latLng.lng()
      setMarkers((prev) => [...prev, { lat, lng, label: `Trap ${prev.length + 1}`, notes: '' }])
    })
  }, [mapsLoaded])

  // Sync Google Maps markers with state
  useEffect(() => {
    if (!googleMapRef.current) return
    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = markers.map((marker, idx) => {
      const gm = new window.google.maps.Marker({
        position: { lat: marker.lat, lng: marker.lng },
        map: googleMapRef.current,
        label: { text: marker.label || String(idx + 1), color: '#1a2e1f', fontWeight: 'bold', fontSize: '11px' },
        draggable: true,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: '#7dffaa',
          fillOpacity: 1,
          strokeColor: '#1a2e1f',
          strokeWeight: 2,
          scale: 12,
        },
      })
      gm.addListener('click', () => {
        setSelectedMarkerIdx(idx)
        setEditLabel(marker.label || '')
        setEditNotes(marker.notes || '')
      })
      gm.addListener('dragend', (e) => {
        setMarkers((prev) => prev.map((m, i) => i === idx ? { ...m, lat: e.latLng.lat(), lng: e.latLng.lng() } : m))
      })
      return gm
    })
  }, [markers])

  async function loadCustomer(email) {
    if (!email) return
    setLoading(true)
    setSaveMsg(null)
    try {
      const res = await fetch(`/api/admin/installation?email=${encodeURIComponent(email)}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setMarkers(data.markers || [])

      // Geocode address and center map
      if (data.address && googleMapRef.current) {
        const geocoder = new window.google.maps.Geocoder()
        geocoder.geocode({ address: data.address }, (results, status) => {
          if (status === 'OK' && results[0]) {
            googleMapRef.current.setCenter(results[0].geometry.location)
            googleMapRef.current.setZoom(20)
          }
        })
      }
    } catch {
      setMarkers([])
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!selectedEmail) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await fetch('/api/admin/installation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: selectedEmail, markers }),
      })
      setSaveMsg(res.ok ? 'Saved!' : 'Save failed')
    } catch {
      setSaveMsg('Save failed')
    } finally {
      setSaving(false)
    }
  }

  function applyMarkerEdit() {
    if (selectedMarkerIdx === null) return
    setMarkers((prev) => prev.map((m, i) => i === selectedMarkerIdx ? { ...m, label: editLabel, notes: editNotes } : m))
    setSelectedMarkerIdx(null)
  }

  function deleteMarker(idx) {
    setMarkers((prev) => prev.filter((_, i) => i !== idx))
    if (selectedMarkerIdx === idx) setSelectedMarkerIdx(null)
  }

  const apiKey = typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY : null

  return (
    <>
      <Head><title>Installation Map · GreenGuard Admin</title></Head>
      <PortalLayout title="Installation Map" isAdmin={isAdmin}>
        {!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
          <div style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#c9a84c', fontSize: '0.88rem' }}>
            Set <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in Vercel env vars to enable the map.
          </div>
        )}

        {/* Customer selector */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={selectedEmail}
            onChange={(e) => { setSelectedEmail(e.target.value); if (mapsLoaded) loadCustomer(e.target.value) }}
            style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 6, color: '#d4e6ca', fontSize: '0.9rem', minWidth: 260 }}
          >
            <option value="">— Select a customer —</option>
            {contacts.map((c) => (
              <option key={c.email} value={c.email}>{c.name} ({c.email})</option>
            ))}
          </select>
          {selectedEmail && (
            <button onClick={handleSave} disabled={saving} className="btn-gold" style={{ fontSize: '0.85rem' }}>
              {saving ? 'Saving…' : 'Save Map'}
            </button>
          )}
          {saveMsg && <span style={{ fontSize: '0.88rem', color: saveMsg === 'Saved!' ? '#7dffaa' : '#ff8888', fontWeight: 700 }}>{saveMsg}</span>}
          {loading && <span style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.5)' }}>Loading…</span>}
        </div>

        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: '1fr 280px' }}>
          {/* Map */}
          <div
            ref={mapRef}
            style={{ height: 520, borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(122,171,130,0.15)' }}
          />

          {/* Marker panel */}
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(212,230,202,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Markers ({markers.length})
            </div>
            <div style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.4)', marginBottom: 12 }}>
              Click the map to place a marker. Click a marker to edit.
            </div>

            {selectedMarkerIdx !== null && (
              <div className="card" style={{ padding: '14px', marginBottom: 14 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: 10 }}>Edit Marker {selectedMarkerIdx + 1}</div>
                <input
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  placeholder="Label (e.g. Trap 1)"
                  style={{ width: '100%', padding: '8px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 5, color: '#d4e6ca', fontSize: '0.85rem', boxSizing: 'border-box', marginBottom: 8 }}
                />
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Notes (e.g. Near oak tree)"
                  rows={2}
                  style={{ width: '100%', padding: '8px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 5, color: '#d4e6ca', fontSize: '0.85rem', fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box', marginBottom: 8 }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={applyMarkerEdit} className="btn-gold" style={{ fontSize: '0.78rem', padding: '6px 12px' }}>Save</button>
                  <button onClick={() => deleteMarker(selectedMarkerIdx)} style={{ fontSize: '0.78rem', padding: '6px 12px', background: 'rgba(255,68,68,0.15)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 4, color: '#ff8888', cursor: 'pointer' }}>Delete</button>
                  <button onClick={() => setSelectedMarkerIdx(null)} className="btn-outline" style={{ fontSize: '0.78rem', padding: '6px 12px' }}>Cancel</button>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gap: 8 }}>
              {markers.map((m, idx) => (
                <div
                  key={idx}
                  onClick={() => { setSelectedMarkerIdx(idx); setEditLabel(m.label || ''); setEditNotes(m.notes || '') }}
                  style={{
                    padding: '10px 12px', borderRadius: 6, cursor: 'pointer',
                    background: selectedMarkerIdx === idx ? 'rgba(125,255,170,0.08)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${selectedMarkerIdx === idx ? 'rgba(125,255,170,0.25)' : 'rgba(122,171,130,0.12)'}`,
                  }}
                >
                  <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{m.label || `Marker ${idx + 1}`}</div>
                  {m.notes && <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.45)', marginTop: 2 }}>{m.notes}</div>}
                  <div style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.3)', marginTop: 3 }}>
                    {m.lat.toFixed(6)}, {m.lng.toFixed(6)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </PortalLayout>
    </>
  )
}
