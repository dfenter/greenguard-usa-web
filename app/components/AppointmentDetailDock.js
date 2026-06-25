import { useState, useEffect } from 'react'
import Link from 'next/link'

const TZ = 'America/Chicago'

function fmtDockDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ })
}
function fmtDockTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })
}

function cleanDescription(desc) {
  if (!desc) return ''
  return desc
    .split(/\r?\n/)
    .filter((l) => !/^(Change Appointment:|Please use Acuity|AcuityID=|\(created by Acuity|Calendar:|Name:|Phone:|Email:|Price:|Location|Address|====|Rental Terms)/i.test(l.trim()))
    .join('\n')
    .trim()
}

function CalApptRow({ b, accent }) {
  return (
    <div style={{ padding: '9px 0', borderBottom: '1px solid rgba(122,171,130,0.07)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: '0.83rem', fontWeight: 800, color: accent }}>{fmtDockDate(b.start)}</span>
        <span style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.4)', whiteSpace: 'nowrap' }}>{fmtDockTime(b.start)}</span>
      </div>
      {b.summary && <div style={{ fontSize: '0.75rem', color: 'rgba(212,230,202,0.5)', marginTop: 2 }}>{b.summary.replace(/\s*\(GreenGuard USA\)\s*$/, '')}</div>}
    </div>
  )
}

function CalAppointmentHistory({ d, scheduleHref }) {
  const upcoming = d.upcomingBookings || (d.next ? [d.next] : [])
  const past = d.pastBookings || (d.last ? [d.last] : [])
  const lbl = { fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', margin: '16px 0 6px' }
  return (
    <div style={{ paddingTop: 4 }}>
      <Link href={scheduleHref}
        style={{ display: 'block', textAlign: 'center', padding: '10px 14px', borderRadius: 6, background: '#c9a84c', color: '#0d1a10', fontWeight: 900, fontSize: '0.85rem', textDecoration: 'none' }}>
        + Schedule appointment
      </Link>
      <div style={lbl}>Upcoming ({upcoming.length})</div>
      {upcoming.length === 0
        ? <div style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.3)' }}>None scheduled</div>
        : upcoming.map((b, i) => <CalApptRow key={b.id || i} b={b} accent="#c9a84c" />)}
      <div style={lbl}>Past ({past.length})</div>
      {past.length === 0
        ? <div style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.3)' }}>No past visits</div>
        : past.map((b, i) => <CalApptRow key={b.id || i} b={b} accent="#7dffaa" />)}
    </div>
  )
}

function EventNotesSection({ eventId, customerEmail }) {
  const [notes, setNotes] = useState([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function load() {
    try {
      const res = await fetch(`/api/admin/event-notes?eventId=${encodeURIComponent(eventId)}`)
      const j = await res.json()
      if (res.ok) setNotes(j.notes || [])
    } catch { /* silent */ }
  }
  useEffect(() => { load() }, [eventId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!body.trim()) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/event-notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, customerEmail, body }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setBody(''); setMsg({ ok: true, text: 'Saved.' })
      load()
      setTimeout(() => setMsg(null), 2000)
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally { setBusy(false) }
  }

  async function del(id) {
    if (!window.confirm('Delete this note?')) return
    await fetch(`/api/admin/event-notes?id=${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div style={{ marginBottom: 14, padding: 12, background: 'rgba(125,255,170,0.04)', border: '1px solid rgba(125,255,170,0.18)', borderRadius: 6 }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7dffaa', marginBottom: 8 }}>
        This appointment&apos;s notes
      </div>
      {notes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {notes.map((n) => (
            <div key={n.id} style={{ padding: '7px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 4, fontSize: '0.78rem', color: 'rgba(212,230,202,0.85)', position: 'relative' }}>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{n.body}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span style={{ fontSize: '0.66rem', color: 'rgba(212,230,202,0.4)' }}>
                  {n.author_email?.split('@')[0]} · {new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ })}
                </span>
                <button onClick={() => del(n.id)} title="Delete"
                  style={{ background: 'none', border: 'none', color: 'rgba(255,128,128,0.55)', cursor: 'pointer', fontSize: '0.72rem', padding: 0, fontFamily: 'inherit' }}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)}
        placeholder="Gate code today, side gate only, customer requested AM…"
        style={{ width: '100%', padding: '7px 9px', borderRadius: 5, border: '1px solid rgba(122,171,130,0.25)', background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.82rem', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
        <button onClick={save} disabled={busy || !body.trim()}
          style={{ padding: '5px 12px', borderRadius: 4, border: 'none', background: '#7dffaa', color: '#0d1a10', fontWeight: 800, fontSize: '0.76rem', cursor: busy || !body.trim() ? 'not-allowed' : 'pointer', opacity: busy || !body.trim() ? 0.5 : 1, fontFamily: 'Inter, sans-serif' }}>
          {busy ? 'Saving…' : 'Add'}
        </button>
        {msg && <span style={{ fontSize: '0.74rem', color: msg.ok ? '#7dffaa' : '#ff8080' }}>{msg.text}</span>}
      </div>
    </div>
  )
}

function DockNoteComposer({ email, hsContactId }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  async function save() {
    if (!body.trim()) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/add-note', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, contactId: hsContactId, body }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setBody(''); setMsg({ ok: true, text: 'Saved.' })
      setTimeout(() => setMsg(null), 2500)
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally { setBusy(false) }
  }
  return (
    <div>
      <textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)}
        placeholder="Add a note to this customer's HubSpot timeline…"
        style={{ width: '100%', padding: '7px 9px', borderRadius: 5, border: '1px solid rgba(122,171,130,0.25)', background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.82rem', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
        <button onClick={save} disabled={busy || !body.trim()}
          style={{ padding: '5px 12px', borderRadius: 4, border: 'none', background: '#7dffaa', color: '#0d1a10', fontWeight: 800, fontSize: '0.76rem', cursor: busy || !body.trim() ? 'not-allowed' : 'pointer', opacity: busy || !body.trim() ? 0.5 : 1, fontFamily: 'Inter, sans-serif' }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {msg && <span style={{ fontSize: '0.74rem', color: msg.ok ? '#7dffaa' : '#ff8080' }}>{msg.text}</span>}
      </div>
    </div>
  )
}

export default function DetailDock({ details, loading, onClose }) {
  const d = details || {}
  const ev = d.event || {}
  const p = d.contact?.properties || {}
  const customerName = [p.firstname, p.lastname].filter(Boolean).join(' ') || ev.summary?.split(':')[0] || 'Unknown'
  const phone = p.phone || ''
  const address = p.address || ev.location || ''
  const email = d.email || p.email || ''
  const notes = cleanDescription(ev.description)
  const billingContact = p.billing_contact_name

  const [tab, setTab] = useState('details')
  const scheduleHref = '/admin/booking?' + new URLSearchParams({ email: email || '', name: customerName || '', phone: phone || '', address: address || '' }).toString()

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: 'min(420px, 95vw)',
      background: '#0d1a10', borderLeft: '1px solid rgba(122,171,130,0.25)',
      boxShadow: '-4px 0 24px rgba(0,0,0,0.5)', zIndex: 300, overflow: 'auto',
      color: '#d4e6ca', fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(122,171,130,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#0d1a10', zIndex: 1 }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.45)' }}>Appointment Details</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(212,230,202,0.5)', cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1, padding: 0 }}>×</button>
      </div>

      {loading && <div style={{ padding: 20, color: 'rgba(212,230,202,0.5)', fontSize: '0.85rem' }}>Loading…</div>}
      {!loading && d.error && <div style={{ padding: 20, color: '#ff8080', fontSize: '0.85rem' }}>{d.error}</div>}
      {!loading && !d.error && (
        <div style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 2 }}>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900 }}>{customerName}</div>
              {billingContact && (
                <div style={{ fontSize: '0.7rem', color: '#c9a84c', fontWeight: 700, background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', padding: '2px 8px', borderRadius: 4, display: 'inline-block', marginTop: 4 }}>
                  Bill to: {billingContact}
                </div>
              )}
            </div>
            {(address || phone) && (
              <div style={{ textAlign: 'right', flexShrink: 0, maxWidth: '55%' }}>
                {address && (
                  <div style={{ fontSize: '0.78rem', marginBottom: 2 }}>
                    <a href={`https://maps.apple.com/?daddr=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer" style={{ color: '#7dffaa', textDecoration: 'none' }}>📍 {address}</a>
                  </div>
                )}
                {phone && (
                  <div style={{ fontSize: '0.78rem' }}>
                    <a href={`tel:${phone}`} style={{ color: '#7dffaa', textDecoration: 'none' }}>📞 {phone}</a>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, margin: '12px 0 4px' }}>
            {[{ k: 'details', l: 'Details' }, { k: 'history', l: 'History' }].map((t) => (
              <button key={t.k} onClick={() => setTab(t.k)}
                style={{ padding: '6px 16px', borderRadius: 4, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.76rem', fontFamily: 'Inter, sans-serif',
                  background: tab === t.k ? '#c9a84c' : 'rgba(201,168,76,0.1)', color: tab === t.k ? '#0d1a10' : 'rgba(201,168,76,0.7)' }}>
                {t.l}
              </button>
            ))}
          </div>

          {tab === 'history' && <CalAppointmentHistory d={d} scheduleHref={scheduleHref} />}

          {tab === 'details' && (<>
          <div style={{ marginTop: 10, marginBottom: 14, padding: '10px 12px', background: 'rgba(125,255,170,0.05)', border: '1px solid rgba(125,255,170,0.15)', borderRadius: 6 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>{ev.summary?.replace(/\s*\(GreenGuard USA\)\s*$/, '') || '—'}</div>
            <div style={{ fontSize: '0.78rem', color: '#7dffaa', fontWeight: 700 }}>{fmtDockDate(ev.start)} · {fmtDockTime(ev.start)}{ev.end ? ` – ${fmtDockTime(ev.end)}` : ''}</div>
          </div>

          {email && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 6 }}>Customer</div>
              <div style={{ fontSize: '0.85rem', marginBottom: 3 }}>✉ <a href={`mailto:${email}`} style={{ color: '#7dffaa', textDecoration: 'none' }}>{email}</a></div>
            </div>
          )}

          {(p.system_type || p.trap_count || p.tank_count || p.recurring_addons) && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 6 }}>Service Profile</div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.75)' }}>
                {p.system_type && <div>System: <strong>{p.system_type}</strong></div>}
                {p.trap_count && <div>Traps: <strong>{p.trap_count}</strong></div>}
                {p.tank_count && <div>Tanks: <strong>{p.tank_count}</strong></div>}
                {p.recurring_addons && <div>Recurring: <strong>{p.recurring_addons}</strong></div>}
              </div>
            </div>
          )}

          {(p.gate_code || p.access_notes || p.pets_on_property || p.special_instructions) && (
            <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 2 }}>Property Notes</div>
              {p.pets_on_property && <div style={{ fontSize: '0.78rem', padding: '6px 10px', background: 'rgba(255,160,80,0.08)', border: '1px solid rgba(255,160,80,0.3)', borderRadius: 6, color: '#ffb060' }}>🐕 <strong>Pets:</strong> {p.pets_on_property}</div>}
              {p.gate_code && <div style={{ fontSize: '0.78rem', padding: '6px 10px', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 6, color: '#c9a84c' }}>🔑 <strong>Gate code:</strong> {p.gate_code}</div>}
              {p.access_notes && <div style={{ fontSize: '0.78rem', padding: '6px 10px', background: 'rgba(91,196,255,0.07)', border: '1px solid rgba(91,196,255,0.25)', borderRadius: 6, color: '#5bc4ff' }}>🚪 <strong>Access:</strong> {p.access_notes}</div>}
              {p.special_instructions && <div style={{ fontSize: '0.78rem', padding: '6px 10px', background: 'rgba(125,255,170,0.06)', border: '1px solid rgba(125,255,170,0.25)', borderRadius: 6, color: '#7dffaa' }}>📝 <strong>Notes:</strong> {p.special_instructions}</div>}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 6 }}>Appointment History</div>
            <div style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.65)' }}>
              <div>Last visit: <strong style={{ color: '#d4e6ca' }}>{d.last ? fmtDockDate(d.last.start) : '—'}</strong></div>
              <div>Next visit: <strong style={{ color: '#d4e6ca' }}>{d.next ? fmtDockDate(d.next.start) : '—'}</strong></div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.4)', marginTop: 2 }}>Total appointments: {d.totalAppointments || 0}</div>
            </div>
          </div>

          <EventNotesSection eventId={ev.id} customerEmail={email} />

          {notes && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 6 }}>Notes</div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.7)', whiteSpace: 'pre-wrap' }}>{notes}</div>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 6 }}>Customer note (HubSpot timeline)</div>
            <DockNoteComposer email={email} hsContactId={d.contact?.id} />
          </div>
          </>)}
        </div>
      )}
    </div>
  )
}
