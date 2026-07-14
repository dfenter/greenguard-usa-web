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
  flex: '1 1 70px', padding: '9px 8px', borderRadius: 6, justifyContent: 'center',
  fontSize: '0.9rem', fontWeight: 800, textDecoration: 'none', minHeight: 36,
  display: 'inline-flex', alignItems: 'center', fontFamily: 'inherit',
  boxSizing: 'border-box', cursor: 'pointer',
}

export const disabledBtn = {
  ...actionBtn,
  border: '2px solid var(--border)',
  color: 'var(--text-dim)',
  background: 'var(--bg-alt)',
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
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ ...actionBtn, border: '2px solid var(--border)', color: 'var(--text)', background: 'var(--bg-card)', fontWeight: 800 }}>Navigate</a>
        ) : (
          <span style={disabledBtn} aria-disabled="true">Navigate</span>
        )}
        <button
          disabled={!canNotify}
          title={canNotify ? 'Send arrival SMS' : 'No phone or email on file'}
          onClick={sendOnMyWay}
          style={{
            ...actionBtn,
            border: canNotify ? '2px solid var(--border)' : '2px solid var(--border)',
            background: canNotify ? 'var(--bg-card)' : 'var(--bg-alt)',
            color: 'var(--text)',
            cursor: canNotify ? 'pointer' : 'not-allowed',
            fontWeight: 800,
            opacity: canNotify ? 1 : 0.6,
          }}>
          📲 On My Way
        </button>
        {stop.email ? (
          <Link href={roundsUrl} style={{ ...actionBtn, background: 'var(--bg-card)', color: 'var(--text)', border: '2px solid var(--border)', fontWeight: 900 }}>Finalize Visit</Link>
        ) : (
          <span style={{ ...disabledBtn, fontWeight: 900 }} aria-disabled="true">Finalize Visit</span>
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

  // Accessibility: high contrast with white card background for readability.
  // Assessment cards use blue highlight with thicker border. Done/active states preserve visual hierarchy.
  const isAssessment = /assessment/i.test(stop.serviceType || '')
  const card = {
    background: 'var(--bg-card)',
    border: `${isAssessment ? 4 : 2}px solid ${isAssessment ? 'var(--info)' : done ? 'var(--ok)' : active ? 'var(--warn)' : 'var(--border)'}`,
    borderLeft: `${isAssessment ? 10 : 6}px solid ${isAssessment ? 'var(--info)' : done ? 'var(--ok)' : active ? 'var(--warn)' : 'var(--border)'}`,
    borderRadius: 'var(--radius)', padding: 20, marginBottom: 14,
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    opacity: cancelled ? 0.6 : 1,
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
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', fontWeight: 900, fontSize: '0.78rem', background: done ? 'var(--ok)' : active ? 'var(--warn)' : 'var(--green-muted)', color: 'var(--text-on-accent)', flexShrink: 0 }}>
              {done ? '✓' : number}
            </span>
            <button
              style={{ fontWeight: 900, fontSize: '1rem', color: /assessment/i.test(stop.serviceType || '') ? 'var(--info)' : 'var(--text)', background: 'none', border: 'none', borderBottom: '2px solid var(--border)', padding: 0, cursor: stop.email ? 'pointer' : 'default', flexShrink: 0, fontFamily: 'inherit' }}
              onClick={(e) => { e.stopPropagation(); openProfile() }}
            >{name}</button>
            {stop.phone && (
              <span style={{ fontSize: '0.85rem', color: 'var(--text)', fontWeight: 700 }}>📞 {stop.phone}</span>
            )}
            {stop.address && (
              <span style={{ fontSize: '0.85rem', color: 'var(--text)', fontWeight: 700 }}>📍 {stop.address}</span>
            )}
            {distance && (
              <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                {distance.miles} mi · {distance.duration}
              </span>
            )}
            {headerExtras}
          </div>

          {/* Per-appointment notes from the calendar dock "This appointment's notes" */}
          {eventNotes.length > 0 && (
            <div style={{ paddingLeft: 36, marginTop: 4, marginBottom: 2 }}>
              {eventNotes.map((n) => (
                <div key={n.id} style={{ fontSize: '0.85rem', color: 'var(--text)', fontWeight: 700, lineHeight: 1.5 }}>📋 {n.body}</div>
              ))}
            </div>
          )}

          {/* Customer notes from HubSpot ([ADMIN-NOTE] timeline entries) */}
          {(stop.clientNotes || []).map((note, i) => (
            <div key={i} style={{ paddingLeft: 36, fontSize: '0.85rem', color: 'var(--text)', fontWeight: 700, lineHeight: 1.5 }}>{note}</div>
          ))}

          {/* Service info row: time · service type · tanks */}
          <div style={{ paddingLeft: 36, display: 'flex', flexWrap: 'wrap', gap: '3px 12px', fontSize: '0.9rem', marginTop: 4, marginBottom: 2 }}>
            {stop.startTime && (
              <span style={{ color: 'var(--text)', fontWeight: 800 }}>
                {new Date(stop.startTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ })} · {fmtTime(stop.startTime)}{stop.endTime ? ` – ${fmtTime(stop.endTime)}` : ''}
              </span>
            )}
            {stop.serviceType && <span style={{ color: 'var(--text)', fontWeight: 700 }}>{stop.serviceType}</span>}
            {stop.tanks > 0 && <span style={{ color: 'var(--text)', fontWeight: 800 }}>🫙 {stop.tanks} tank{stop.tanks > 1 ? 's' : ''}</span>}
          </div>

          {/* Check in / out */}
          {(checkIn || checkOut) && (
            <div style={{ paddingLeft: 36, marginBottom: 4, fontSize: '0.85rem', color: 'var(--text)', display: 'flex', gap: 14, fontWeight: 700 }}>
              {checkIn && <span>In: <strong>{checkIn}</strong></span>}
              {checkOut && <span>Out: <strong style={{ color: 'var(--ok)' }}>{checkOut}</strong></span>}
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
