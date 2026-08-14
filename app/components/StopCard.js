import { useState, useEffect } from 'react'
import Link from 'next/link'
import CustomerPanel from './CustomerPanel'
import { useToast, useConfirm } from './ui'

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
// Action buttons use the shared .stop-btn class from globals.css.

// Clearly delineated "Completed Rounds" area shared by /admin/rounds,
// /admin/home, and /admin/tech. Finalized stops move out of the working list
// and into this labeled section at the bottom, so the remaining route reads
// clean and what's already done is unmistakable.
// Collapsed by default: the working route is what matters during the day, so
// finished stops stay out of the way behind a one-tap header until asked for.
export function CompletedRoundsSection({ count, children }) {
  const [open, setOpen] = useState(false)
  if (!count) return null
  return (
    <div style={{ marginTop: 28, borderTop: '3px solid var(--ok)', paddingTop: 16 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'none', border: 'none', padding: '2px 0', margin: '0 0 12px',
          cursor: 'pointer', textAlign: 'left',
          fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ok)',
        }}
      >
        <span style={{ display: 'inline-block', transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'none' }}>▸</span>
        ✓ Completed Rounds ({count})
        <span style={{ marginLeft: 'auto', fontWeight: 700, letterSpacing: '0.06em', opacity: 0.75 }}>{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div style={{ background: 'rgba(var(--ok-rgb),0.04)', border: '1px solid rgba(var(--ok-rgb),0.25)', borderRadius: 12, padding: '14px 14px 0' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// Shared stop row used by /admin/home and /admin/tech so the card + its
// Navigate / On My Way / Finalize Visit actions match the rounds page exactly.
export function StopRow({ stop, index, dateStr, distance, preview = false, done = false }) {
  const roundsUrl = `/admin/rounds?date=${dateStr}&email=${encodeURIComponent(stop.email || '')}`
  const mapsUrl = stop.address ? `https://maps.apple.com/?daddr=${encodeURIComponent(stop.address)}` : null
  const canNotify = !!(stop.email || stop.phone)
  const toast = useToast()
  const confirm = useConfirm()

  async function sendOnMyWay() {
    const eta = await confirm({
      title: 'On My Way',
      body: 'ETA in minutes. Leave blank to text "shortly".',
      confirmLabel: 'Send text',
      input: { type: 'number', placeholder: 'Minutes', presets: [10, 15, 20, 30], unit: 'min', defaultValue: '15' },
    })
    if (eta === null) return
    const send = (force) => fetch('/api/admin/notify-eta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerEmail: stop.email, customerPhone: stop.phone, customerName: stop.title || stop.customerName, etaMinutes: eta ? parseInt(eta, 10) : null, force }),
    })
    let r = await send(false)
    let d = await r.json().catch(() => ({}))
    if (r.status === 409 && d.duplicate) {
      const again = await confirm({ title: 'Already notified', body: d.error, confirmLabel: 'Send again' })
      if (!again) return
      r = await send(true); d = await r.json().catch(() => ({}))
    }
    if (r.ok) toast.ok('SMS sent')
    else toast.error('Text failed: ' + (d.error || r.status))
  }

  const actions = preview ? null : (
    <>
      {mapsUrl ? (
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="stop-btn">Navigate</a>
      ) : (
        <span className="stop-btn" aria-disabled="true">Navigate</span>
      )}
      <button
        disabled={!canNotify}
        title={canNotify ? 'Send arrival SMS' : 'No phone or email on file'}
        onClick={sendOnMyWay}
        className="stop-btn">
        📲 On My Way
      </button>
      {stop.email ? (
        <Link href={roundsUrl} className="stop-btn">{done ? 'Review Visit' : 'Finalize Visit'}</Link>
      ) : (
        <span className="stop-btn" aria-disabled="true">Finalize Visit</span>
      )}
    </>
  )

  return <StopCard stop={stop} number={index + 1} done={done} distance={distance} preview={preview} actions={actions} />
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
  preview = false,
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
  // Low-vision legibility comes from SIZE + WEIGHT (mixed case keeps word
  // shapes readable); uppercase is reserved for small section labels.
  const isAssessment = /assessment/i.test(stop.serviceType || '')
  const card = {
    background: 'var(--bg-card)',
    border: `${isAssessment ? 4 : 2}px solid ${isAssessment ? 'var(--info)' : done ? 'var(--ok)' : active ? 'var(--warn)' : 'var(--border)'}`,
    borderLeft: `${isAssessment ? 10 : 6}px solid ${isAssessment ? 'var(--info)' : done ? 'var(--ok)' : active ? 'var(--warn)' : 'var(--border)'}`,
    borderRadius: 'var(--radius)', padding: 20, marginBottom: 14,
    boxShadow: 'var(--shadow-sm)',
    opacity: preview ? 0.75 : cancelled ? 0.6 : 1,
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
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', fontWeight: 'var(--w-head)', fontSize: 'var(--fs-base)', background: done ? 'var(--ok)' : active ? 'var(--warn)' : 'var(--green-muted)', color: 'var(--text-on-accent)', flexShrink: 0 }}>
              {done ? '✓' : number}
            </span>
            {preview ? (
              <span style={{ fontWeight: 'var(--w-head)', fontSize: 'var(--fs-xl)', color: /assessment/i.test(stop.serviceType || '') ? 'var(--info)' : 'var(--text)', flexShrink: 0 }}>{name}</span>
            ) : (
              <button
                style={{ fontWeight: 'var(--w-head)', fontSize: 'var(--fs-xl)', color: /assessment/i.test(stop.serviceType || '') ? 'var(--info)' : 'var(--text)', background: 'none', border: 'none', borderBottom: '2px solid var(--border)', padding: 0, cursor: stop.email ? 'pointer' : 'default', flexShrink: 0, fontFamily: 'inherit' }}
                onClick={(e) => { e.stopPropagation(); openProfile() }}
              >{name}</button>
            )}
            {stop.phone && (
              <span style={{ fontSize: 'var(--fs-lg)', color: 'var(--text)', fontWeight: 'var(--w-emph)' }}>📞 {stop.phone}</span>
            )}
            {stop.address && (
              <span style={{ fontSize: 'var(--fs-lg)', color: 'var(--text)', fontWeight: 'var(--w-emph)' }}>📍 {stop.address}</span>
            )}
            {distance && (
              <span style={{ fontWeight: 'var(--w-head)', fontSize: 'var(--fs-lg)', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                {distance.miles} mi · {distance.duration}
              </span>
            )}
            {headerExtras}
          </div>

          {/* Tanks needed + trap count — pinned directly below the name */}
          {(stop.tanks > 0 || stop.traps > 0) && (
            <div style={{ paddingLeft: 36, display: 'flex', flexWrap: 'wrap', gap: '3px 12px', fontSize: 'var(--fs-lg)', color: 'var(--text)', fontWeight: 'var(--w-head)', marginBottom: 2 }}>
              {stop.tanks > 0 && <span>🫙 {stop.tanks} tank{stop.tanks > 1 ? 's' : ''}</span>}
              {stop.traps > 0 && <span>🪤 {stop.traps} trap{stop.traps > 1 ? 's' : ''}</span>}
            </div>
          )}

          {/* Booking notes from the calendar appointment description */}
          {stop.appointmentNotes && (
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--fs-lg)', fontWeight: 'var(--w-emph)', color: 'var(--text)', lineHeight: 1.5, paddingLeft: 36 }}>📝 {stop.appointmentNotes}</div>
          )}

          {/* Per-appointment notes from the calendar dock "This appointment's notes" */}
          {eventNotes.length > 0 && (
            <div style={{ paddingLeft: 36, marginTop: 4, marginBottom: 2 }}>
              {eventNotes.map((n) => (
                <div key={n.id} style={{ fontSize: 'var(--fs-lg)', color: 'var(--text)', fontWeight: 'var(--w-emph)', lineHeight: 1.5 }}>📋 {n.body}</div>
              ))}
            </div>
          )}

          {/* Customer notes from HubSpot ([ADMIN-NOTE] timeline entries) */}
          {(stop.clientNotes || []).map((note, i) => (
            <div key={i} style={{ paddingLeft: 36, fontSize: 'var(--fs-lg)', color: 'var(--text)', fontWeight: 'var(--w-emph)', lineHeight: 1.5 }}>{note}</div>
          ))}

          {/* Service info row: time · service type */}
          <div style={{ paddingLeft: 36, display: 'flex', flexWrap: 'wrap', gap: '3px 12px', fontSize: 'var(--fs-lg)', marginTop: 4, marginBottom: 2 }}>
            {stop.startTime && (
              <span style={{ color: 'var(--text)', fontWeight: 'var(--w-head)' }}>
                {new Date(stop.startTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ })} · {fmtTime(stop.startTime)}{stop.endTime ? ` – ${fmtTime(stop.endTime)}` : ''}
              </span>
            )}
            {stop.serviceType && <span style={{ color: 'var(--text)', fontWeight: 'var(--w-emph)' }}>{stop.serviceType}</span>}
          </div>

          {/* Check in / out */}
          {(checkIn || checkOut) && (
            <div style={{ paddingLeft: 36, marginBottom: 4, fontSize: 'var(--fs-lg)', color: 'var(--text)', display: 'flex', gap: 14, fontWeight: 'var(--w-emph)' }}>
              {checkIn && <span>In: <strong>{checkIn}</strong></span>}
              {checkOut && <span>Out: <strong style={{ color: 'var(--ok)' }}>{checkOut}</strong></span>}
            </div>
          )}

          {/* Action buttons */}
          {!preview && actions && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {actions}
            </div>
          )}
        </div>
        {!preview && children}
      </div>
    </>
  )
}
