import Head from 'next/head'
import { useState, useEffect, useRef } from 'react'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { findContactByEmail } from '../../lib/hubspot'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }

  const contact = await findContactByEmail(session.email).catch(() => null)
  const p = contact?.properties || {}

  let markers = []
  try {
    const raw = p.installation_map
    if (raw) markers = JSON.parse(raw).markers || []
  } catch {
    markers = []
  }

  return {
    props: {
      markers,
      address: p.address || null,
      isAdmin: session.email === 'admin@greenguard-usa.com',
    },
  }
}

export default function CustomerMapPage({ markers, address, isAdmin }) {
  const mapRef = useRef(null)
  const [mapsLoaded, setMapsLoaded] = useState(false)

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

  useEffect(() => {
    if (!mapsLoaded || !mapRef.current || markers.length === 0) return

    const center = markers.length > 0
      ? { lat: markers[0].lat, lng: markers[0].lng }
      : { lat: 30.2672, lng: -97.7431 }

    const map = new window.google.maps.Map(mapRef.current, {
      center,
      zoom: 20,
      mapTypeId: 'satellite',
      tilt: 0,
    })

    // If we have an address, geocode and center there
    if (address) {
      const geocoder = new window.google.maps.Geocoder()
      geocoder.geocode({ address }, (results, status) => {
        if (status === 'OK' && results[0]) {
          map.setCenter(results[0].geometry.location)
        }
      })
    }

    markers.forEach((marker, idx) => {
      const gm = new window.google.maps.Marker({
        position: { lat: marker.lat, lng: marker.lng },
        map,
        label: { text: marker.label || String(idx + 1), color: '#1a2e1f', fontWeight: 'bold', fontSize: '11px' },
        draggable: false,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: '#7dffaa',
          fillOpacity: 1,
          strokeColor: '#1a2e1f',
          strokeWeight: 2,
          scale: 12,
        },
      })

      if (marker.notes) {
        const infoWindow = new window.google.maps.InfoWindow({
          content: `<div style="color:#1a2e1f;font-family:sans-serif;"><strong>${marker.label || 'Trap'}</strong><br/>${marker.notes}</div>`,
        })
        gm.addListener('click', () => infoWindow.open(map, gm))
      }
    })
  }, [mapsLoaded, markers, address])

  return (
    <>
      <Head><title>My Installation Map · GreenGuard</title></Head>
      <PortalLayout title="My Installation Map" isAdmin={isAdmin}>
        {markers.length === 0 ? (
          <div className="card" style={{ maxWidth: 480 }}>
            <p style={{ color: 'rgba(212,230,202,0.6)', margin: 0 }}>
              Your installation map hasn&apos;t been set up yet. Your technician will map your trap locations after the first service visit.
            </p>
          </div>
        ) : (
          <>
            <div
              ref={mapRef}
              style={{ height: 480, borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(122,171,130,0.15)', marginBottom: 20 }}
            />
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', maxWidth: 700 }}>
              {markers.map((m, idx) => (
                <div key={idx} className="card" style={{ padding: '12px 14px' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>{m.label || `Trap ${idx + 1}`}</div>
                  {m.notes && <div style={{ marginTop: 4, fontSize: '0.8rem', color: 'rgba(212,230,202,0.55)' }}>{m.notes}</div>}
                </div>
              ))}
            </div>
          </>
        )}
        {!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && markers.length > 0 && (
          <div style={{ marginTop: 16, fontSize: '0.83rem', color: 'rgba(212,230,202,0.4)' }}>
            Google Maps API key not configured — contact your administrator.
          </div>
        )}
      </PortalLayout>
    </>
  )
}
