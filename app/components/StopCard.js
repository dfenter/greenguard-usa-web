import { useState, useEffect } from 'react'
import Link from 'next/link'
import CustomerPanel from './CustomerPanel'

const TZ_DISPLAY = 'America/Chicago'

const TZ = 'America/Chicago'

function fmtTime(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ })
  } catch { return '' }
}

// Standardized appointment/stop card — single source of truth shared by
// /admin/rounds, /admin/home, and /admin/tech so the three pages render an
// identical card. Page-specific buttons go in the `actions` slot; extra body
// content (e.g. the rounds service-logging form) goes in `children`.
// Matches the rounds-page action buttons exactly so Navigate / Rounds / Text
// align across /admin/home, /admin/tech, and /admin/rounds.
export const actionBtn = {
  flex: '1 1 70px', padding: '7px 6px', borderRadius: 6, justifyContent: 'center',
  fontSize: '0.9rem', fontWeight: 700, textDecoration: 'none', minHeight: 34,
  display: 'inline-flex', alignItems: 'center', fontFamily: 'inherit',
  boxSizing: 'border-box', cursor: 'pointer',
}

export const disabledBtn = {
  ...actionBtn,
  border: '1px solid rgba(122,171,130,0.12)',
  color: 'rgba(212,230,202,0.3)',
  background: 'transparent',
  cursor: 'not-allowed',
  opacity: 0.6,
}

// Shared stop row used by /admin/home and /admin/tech so the card + its
// Navigate / On My Way / Finalize Visit actions match the rounds page exactly.
export function StopRow({ stop, index, dateStr, distance }) {
  const roundsUrl = `/admin/rounds?date=${dateStr}&email=${encodeURIComponent(stop.email || '')}`
  const mapsUrl = stop.address ? `https://maps.apple.com/?daddr=${encodeURIComponent(stop.address)}` : null
  const canNotify = !!(stop.email || stop.phone)

  async function sendOnMyWay() {
    const eta = window.prompt('ETA in minutes (leave blank for "shortly"):', '15')
    if (eta === null) return
    const send = (force) => fetch('/api/admin/notify-eta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerEmail: stop.email, customerPhone: stop.phone, customerName: stop.title || stop.customerName, etaMinutes: eta ? parseInt(eta, 10) : null, force }),
    })
    let r = await send(false)
    let d = await r.json().catch(() => ({}))
    if (r.status === 409 && d.duplicate) {
      if (!window.confirm(d.error + '\n\nSend again anyway?')) return
      r = await send(true); d = await r.json().catch(() => ({}))
    }
    if (r.ok) alert('✓ SMS sent')
    else alert('Failed: ' + (d.error || r.status))
  }

  return (
    <StopCard stop={stop} number={index + 1} distance={distance} actions={
      <>
        {mapsUrl ? (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ ...actionBtn, border: '1px solid rgba(122,171,130,0.25)', color: '#7aab82' }}>Navigate</a>
        ) : (
          <span style={disabledBtn} aria-disabled="true">Navigate</span>
        )}
        <button
          disabled={!canNotify}
          title={canNotify ? 'Send arrival SMS' : 'No phone or email on file'}
          onClick={sendOnMyWay}
          style={{
            ...actionBtn,
            border: canNotify ? '1px solid rgba(125,255,170,0.35)' : '1px solid rgba(125,255,170,0.15)',
            background: canNotify ? 'rgba(125,255,170,0.08)' : 'transparent',
            color: canNotify ? '#7dffaa' : 'rgba(125,255,170,0.4)',
            cursor: canNotify ? 'pointer' : 'not-allowed',
          }}>
          📲 On My Way
        </button>
        {stop.email ? (
          <Link href={roundsUrl} style={{ ...actionBtn, background: '#c9a84c', color: '#0d1a10', border: 'none', fontWeight: 800 }}>Finalize Visit</Link>
        ) : (
          <span style={{ ...disabledBtn, fontWeight: 800 }} aria-disabled="true">Finalize Visit</span>
        )}
      </>
    } />
  )
}

export default function StopCard({
  stop,
  number,
  done = false,
  active = false,
  cancelled = false,
  distance,
  onOpenProfile,
  checkIn,
  checkOut,
  headerExtras = null,
  actions = null,
  children = null,
}) {
  const [showPanel, setShowPanel] = useState(false)
  const [eventNotes, setEventNotes] = useState([])
  const name = stop.customerName || stop.title || 'Service Visit'

  useEffect(() => {
    if (!stop.gcalEventId) return
    fetch(`/api/admin/event-notes?eventId=${encodeURIComponent(stop.gcalEventId)}`)
      .then((r) => r.json())
      .then((d) => setEventNotes(d.notes || []))
      .catch(() => {})
  }, [stop.gcalEventId])

  function openProfile() {
    if (!stop.email) return
    if (onOpenProfile) onOpenProfile({ email: stop.email, name, phone: stop.phone })
    else setShowPanel(true)
  }

  const accent = done ? '125,255,170' : active ? '201,168,76' : '122,171,130'
  const card = {
    background: 'var(--bg-card)',
    backgroundImage: 'var(--surface-grad)',
    border: `1px solid rgba(${accent}, ${done || active ? 0.32 : 0.16})`,
    borderLeft: `3px solid rgba(${accent}, ${done || active ? 0.7 : 0.4})`,
    borderRadius: 'var(--radius)', padding: 20, marginBottom: 14,
    boxShadow: 'var(--shadow-sm)',
    opacity: cancelled ? 0.45 : done ? 0.7 : 1,
  }

  return (
    <>
      {showPanel && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 199 }} onClick={() => setShowPanel(false)} />
          <CustomerPanel customer={{ email: stop.email, name, phone: stop.phone }} onClose={() => setShowPanel(false)} />
        </>
      )}
      <div style={card}>
        <div style={{ marginBottom: actions || children ? 12 : 0 }}>
          {/* Name row: number · name · address · distance */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 3, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', fontWeight: 900, fontSize: '0.78rem', background: done ? 'rgba(125,255,170,0.15)' : active ? 'rgba(201,168,76,0.15)' : 'rgba(122,171,130,0.1)', color: done ? '#7dffaa' : active ? '#c9a84c' : 'rgba(212,230,202,0.5)', flexShrink: 0 }}>
              {done ? '✓' : number}
            </span>
            <button
              style={{ fontWeight: 900, fontSize: '1rem', color: (stop.firstAppointment || /assessment/i.test(stop.serviceType || '')) ? '#7dffaa' : '#d4e6ca', background: 'none', border: 'none', borderBottom: '1px solid rgba(212,230,202,0.2)', padding: 0, cursor: stop.email ? 'pointer' : 'default', flexShrink: 0, fontFamily: 'inherit' }}
              onClick={(e) => { e.stopPropagation(); openProfile() }}
            >{name}</button>
            {stop.address && (
              <span style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.5)', fontWeight: 400 }}>📍 {stop.address}</span>
            )}
            {distance && (
              <span style={{ fontWeight: 800, fontSize: '0.88rem', color: parseFloat(distance.miles) <= 5 ? '#7dffaa' : parseFloat(distance.miles) <= 15 ? '#c9a84c' : 'rgba(212,230,202,0.45)', whiteSpace: 'nowrap' }}>
                {distance.miles} mi · {distance.duration}
              </span>
            )}
            {headerExtras}
          </div>

          {/* Per-appointment notes from the calendar dock "This appointment's notes" */}
          {eventNotes.length > 0 && (
            <div style={{ paddingLeft: 36, marginTop: 4, marginBottom: 2 }}>
              {eventNotes.map((n) => (
                <div key={n.id} style={{ fontSize: '0.82rem', color: '#7dffaa', lineHeight: 1.5 }}>📋 {n.body}</div>
              ))}
            </div>
          )}

          {/* Customer notes from HubSpot ([ADMIN-NOTE] timeline entries) */}
          {(stop.clientNotes || []).map((note, i) => (
            <div key={i} style={{ paddingLeft: 36, fontSize: '0.82rem', color: 'rgba(212,230,202,0.75)', lineHeight: 1.5 }}>{note}</div>
          ))}

          {/* Service info row: time · service type · tanks */}
          <div style={{ paddingLeft: 36, display: 'flex', flexWrap: 'wrap', gap: '3px 12px', fontSize: '0.9rem', marginTop: 4, marginBottom: 2 }}>
            {stop.startTime && (
              <span style={{ color: '#c9a84c', fontWeight: 700 }}>
                {new Date(stop.startTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ })} · {fmtTime(stop.startTime)}{stop.endTime ? ` – ${fmtTime(stop.endTime)}` : ''}
              </span>
            )}
            {stop.serviceType && <span style={{ color: 'rgba(212,230,202,0.55)' }}>{stop.serviceType}</span>}
            {stop.tanks > 0 && <span style={{ color: '#7dffaa', fontWeight: 700 }}>🫙 {stop.tanks} tank{stop.tanks > 1 ? 's' : ''}</span>}
          </div>

          {/* Check in / out */}
          {(checkIn || checkOut) && (
            <div style={{ paddingLeft: 36, marginBottom: 4, fontSize: '0.75rem', color: 'rgba(212,230,202,0.4)', display: 'flex', gap: 14 }}>
              {checkIn && <span>In: <strong>{checkIn}</strong></span>}
              {checkOut && <span>Out: <strong style={{ color: '#7dffaa' }}>{checkOut}</strong></span>}
            </div>
          )}

          {/* Action buttons */}
          {actions && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {actions}
            </div>
          )}
        </div>
        {children}
      </div>
    </>
  )
}
