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
    <div style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: '0.83rem', fontWeight: 800, color: accent }}>{fmtDockDate(b.start)}</span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{fmtDockTime(b.start)}</span>
      </div>
      {b.summary && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{b.summary.replace(/\s*\(GreenGuard USA\)\s*$/, '')}</div>}
    </div>
  )
}

function CalAppointmentHistory({ d, scheduleHref }) {
  const upcoming = d.upcomingBookings || (d.next ? [d.next] : [])
  const past = d.pastBookings || (d.last ? [d.last] : [])
  const lbl = { fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', margin: '16px 0 6px' }
  return (
    <div style={{ paddingTop: 4 }}>
      <Link href={scheduleHref}
        style={{ display: 'block', textAlign: 'center', padding: '10px 14px', borderRadius: 6, background: 'var(--gold)', color: 'var(--text-on-accent)', fontWeight: 900, fontSize: '0.85rem', textDecoration: 'none' }}>
        + Schedule appointment
      </Link>
      <div style={lbl}>Upcoming ({upcoming.length})</div>
      {upcoming.length === 0
        ? <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>None scheduled</div>
        : upcoming.map((b, i) => <CalApptRow key={b.id || i} b={b} accent="var(--gold)" />)}
      <div style={lbl}>Past ({past.length})</div>
      {past.length === 0
        ? <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>No past visits</div>
        : past.map((b, i) => <CalApptRow key={b.id || i} b={b} accent="var(--green)" />)}
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
    <div style={{ marginBottom: 14, padding: 12, background: 'rgba(var(--green-rgb),0.06)', border: '1px solid var(--border)', borderRadius: 6 }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: 8 }}>
        This appointment&apos;s notes
      </div>
      {notes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {notes.map((n) => (
            <div key={n.id} style={{ padding: '7px 10px', background: 'var(--bg-alt)', borderRadius: 4, fontSize: '0.78rem', color: 'var(--text)', position: 'relative' }}>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{n.body}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span style={{ fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                  {n.author_email?.split('@')[0]} · {new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ })}
                </span>
                <button onClick={() => del(n.id)} title="Delete"
                  style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.72rem', padding: 0, fontFamily: 'inherit' }}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)}
        placeholder="Gate code today, side gate only, customer requested AM…"
        style={{ width: '100%', padding: '7px 9px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.82rem', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
        <button onClick={save} disabled={busy || !body.trim()}
          style={{ padding: '5px 12px', borderRadius: 4, border: 'none', background: 'var(--green)', color: 'var(--text-on-accent)', fontWeight: 800, fontSize: '0.76rem', cursor: busy || !body.trim() ? 'not-allowed' : 'pointer', opacity: busy || !body.trim() ? 0.5 : 1 }}>
          {busy ? 'Saving…' : 'Add'}
        </button>
        {msg && <span style={{ fontSize: '0.74rem', color: msg.ok ? 'var(--ok)' : 'var(--danger)' }}>{msg.text}</span>}
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
        style={{ width: '100%', padding: '7px 9px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.82rem', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
        <button onClick={save} disabled={busy || !body.trim()}
          style={{ padding: '5px 12px', borderRadius: 4, border: 'none', background: 'var(--green)', color: 'var(--text-on-accent)', fontWeight: 800, fontSize: '0.76rem', cursor: busy || !body.trim() ? 'not-allowed' : 'pointer', opacity: busy || !body.trim() ? 0.5 : 1 }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {msg && <span style={{ fontSize: '0.74rem', color: msg.ok ? 'var(--ok)' : 'var(--danger)' }}>{msg.text}</span>}
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
      background: 'var(--bg-card)', borderLeft: '1px solid var(--border)',
      boxShadow: '-4px 0 24px rgba(0,0,0,0.5)', zIndex: 300, overflow: 'auto',
      color: 'var(--text)',
    }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Appointment Details</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1, padding: 0 }}>×</button>
      </div>

      {loading && <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</div>}
      {!loading && d.error && <div style={{ padding: 20, color: 'var(--danger)', fontSize: '0.85rem' }}>{d.error}</div>}
      {!loading && !d.error && (
        <div style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 2 }}>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900 }}>{customerName}</div>
              {billingContact && (
                <div style={{ fontSize: '0.7rem', color: 'var(--gold)', fontWeight: 700, background: 'rgba(var(--gold-rgb),0.10)', border: '1px solid var(--border-gold)', padding: '2px 8px', borderRadius: 4, display: 'inline-block', marginTop: 4 }}>
                  Bill to: {billingContact}
                </div>
              )}
            </div>
            {(address || phone) && (
              <div style={{ textAlign: 'right', flexShrink: 0, maxWidth: '55%' }}>
                {address && (
                  <div style={{ fontSize: '0.78rem', marginBottom: 2 }}>
                    <a href={`https://maps.apple.com/?daddr=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green)', textDecoration: 'none' }}>📍 {address}</a>
                  </div>
                )}
                {phone && (
                  <div style={{ fontSize: '0.78rem' }}>
                    <a href={`tel:${phone}`} style={{ color: 'var(--green)', textDecoration: 'none' }}>📞 {phone}</a>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, margin: '12px 0 4px' }}>
            {[{ k: 'details', l: 'Details' }, { k: 'history', l: 'History' }].map((t) => (
              <button key={t.k} onClick={() => setTab(t.k)}
                style={{ padding: '6px 16px', borderRadius: 4, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.76rem',
                  background: tab === t.k ? 'var(--gold)' : 'rgba(var(--gold-rgb),0.10)', color: tab === t.k ? 'var(--text-on-accent)' : 'var(--gold)' }}>
                {t.l}
              </button>
            ))}
          </div>

          {tab === 'history' && <CalAppointmentHistory d={d} scheduleHref={scheduleHref} />}

          {tab === 'details' && (<>
          <div style={{ marginTop: 10, marginBottom: 14, padding: '10px 12px', background: 'rgba(var(--green-rgb),0.06)', border: '1px solid var(--border)', borderRadius: 6 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>{ev.summary?.replace(/\s*\(GreenGuard USA\)\s*$/, '') || '—'}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--green)', fontWeight: 700 }}>{fmtDockDate(ev.start)} · {fmtDockTime(ev.start)}{ev.end ? ` – ${fmtDockTime(ev.end)}` : ''}</div>
          </div>

          {email && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 6 }}>Customer</div>
              <div style={{ fontSize: '0.85rem', marginBottom: 3 }}>✉ <a href={`mailto:${email}`} style={{ color: 'var(--green)', textDecoration: 'none' }}>{email}</a></div>
            </div>
          )}

          {(p.system_type || p.trap_count || p.tank_count || p.recurring_addons) && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 6 }}>Service Profile</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {p.system_type && <div>System: <strong>{p.system_type}</strong></div>}
                {p.trap_count && <div>Traps: <strong>{p.trap_count}</strong></div>}
                {p.tank_count && <div>Tanks: <strong>{p.tank_count}</strong></div>}
                {p.recurring_addons && <div>Recurring: <strong>{p.recurring_addons}</strong></div>}
              </div>
            </div>
          )}

          {(p.gate_code || p.access_notes || p.pets_on_property || p.special_instructions) && (
            <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 2 }}>Property Notes</div>
              {p.pets_on_property && <div style={{ fontSize: '0.78rem', padding: '6px 10px', background: 'rgba(var(--warn-rgb),0.10)', border: '1px solid rgba(var(--warn-rgb),0.35)', borderRadius: 6, color: 'var(--warn)' }}>🐕 <strong>Pets:</strong> {p.pets_on_property}</div>}
              {p.gate_code && <div style={{ fontSize: '0.78rem', padding: '6px 10px', background: 'rgba(var(--gold-rgb),0.10)', border: '1px solid var(--border-gold)', borderRadius: 6, color: 'var(--gold)' }}>🔑 <strong>Gate code:</strong> {p.gate_code}</div>}
              {p.access_notes && <div style={{ fontSize: '0.78rem', padding: '6px 10px', background: 'rgba(var(--info-rgb),0.10)', border: '1px solid rgba(var(--info-rgb),0.35)', borderRadius: 6, color: 'var(--info)' }}>🚪 <strong>Access:</strong> {p.access_notes}</div>}
              {p.special_instructions && <div style={{ fontSize: '0.78rem', padding: '6px 10px', background: 'rgba(var(--green-rgb),0.08)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--green)' }}>📝 <strong>Notes:</strong> {p.special_instructions}</div>}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 6 }}>Appointment History</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <div>Last visit: <strong style={{ color: 'var(--text)' }}>{d.last ? fmtDockDate(d.last.start) : '—'}</strong></div>
              <div>Next visit: <strong style={{ color: 'var(--text)' }}>{d.next ? fmtDockDate(d.next.start) : '—'}</strong></div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 2 }}>Total appointments: {d.totalAppointments || 0}</div>
            </div>
          </div>

          <EventNotesSection eventId={ev.id} customerEmail={email} />

          {notes && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 6 }}>Notes</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{notes}</div>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 6 }}>Customer note (HubSpot timeline)</div>
            <DockNoteComposer email={email} hsContactId={d.contact?.id} />
          </div>
          </>)}
        </div>
      )}
    </div>
  )
}
