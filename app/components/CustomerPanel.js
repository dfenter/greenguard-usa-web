import { useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import DetailDock from './AppointmentDetailDock'

const TZ = 'America/Chicago'

const CUST_STATUS = {
  active:   { bg: 'rgba(125,255,170,0.12)', color: '#7dffaa',               label: 'Active'    },
  trialing: { bg: 'rgba(125,255,170,0.08)', color: '#7dffaa',               label: 'Trialing'  },
  past_due: { bg: 'rgba(255,130,80,0.12)',  color: '#ff8050',               label: 'Past Due'  },
  inactive: { bg: 'rgba(212,230,202,0.06)', color: 'rgba(212,230,202,0.4)', label: 'No Sub'    },
  canceled: { bg: 'rgba(212,230,202,0.06)', color: 'rgba(212,230,202,0.4)', label: 'Canceled'  },
  prospect: { bg: 'rgba(201,168,76,0.12)',  color: '#c9a84c',               label: 'Prospect'  },
}

function getTrapImage(systemType, trapCount) {
  const images = JSON.parse(process.env.NEXT_PUBLIC_BIZ_SYSTEM_IMAGES || 'null')
  if (images) {
    return images[`${systemType}-${trapCount}`] || images[systemType] || null
  }
  if (systemType === 'Mosqitter-Grand' || systemType === 'Mosqitter' || systemType === 'MQ-RENT') return '/images/trap-mosqitter.webp'
  if (systemType === 'Biogents-NonCO2') return '/images/mosquitairenoco2.webp'
  if (systemType === 'Biogents-CO2') {
    if (trapCount >= 3) return '/images/biogentstriple.webp'
    if (trapCount === 2) return '/images/mosquitairedouble.webp'
    return '/images/mosquitairesingle.jpg'
  }
  return null
}

function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ })
}
function fmtTime(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })
}
function fmtDateShort(unix) {
  return new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ })
}
function fmtAmt(cents) { return `$${(cents / 100).toFixed(2)}` }

function StatusBadge({ status }) {
  const s = CUST_STATUS[status] || CUST_STATUS.inactive
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.06em', background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

function NoteComposer({ email, hsContactId, onSaved }) {
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
      onSaved?.()
      setTimeout(() => setMsg(null), 2500)
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally { setBusy(false) }
  }
  return (
    <div style={{ marginTop: 4 }}>
      <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)}
        placeholder="What did you observe / arrange / promise?"
        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(122,171,130,0.25)', background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.85rem', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
        <button onClick={save} disabled={busy || !body.trim()}
          style={{ padding: '6px 14px', borderRadius: 5, border: 'none', background: '#7dffaa', color: '#0d1a10', fontWeight: 800, fontSize: '0.78rem', cursor: busy || !body.trim() ? 'not-allowed' : 'pointer', opacity: busy || !body.trim() ? 0.5 : 1, fontFamily: 'Nunito Sans, sans-serif' }}>
          {busy ? 'Saving…' : 'Save note'}
        </button>
        {msg && <span style={{ fontSize: '0.78rem', color: msg.ok ? '#7dffaa' : '#ff8080' }}>{msg.text}</span>}
      </div>
    </div>
  )
}

function SmsComposer({ email, phone, onSent }) {
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState(null)
  async function send() {
    if (!body.trim()) return
    setSending(true); setMsg(null)
    try {
      const r = await fetch('/api/admin/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerEmail: email, customerPhone: phone, body }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok) { setBody(''); setMsg('✓ Sent'); setTimeout(() => { setMsg(null); onSent && onSent() }, 800) }
      else setMsg(d.error || 'Failed')
    } catch (e) { setMsg(e.message) }
    setSending(false)
  }
  return (
    <div style={{ marginTop: 6 }}>
      <textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} maxLength={320}
        placeholder={`Text ${phone}…`}
        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(122,171,130,0.25)', background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.85rem', fontFamily: 'Nunito Sans, sans-serif', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 8 }}>
        <span style={{ fontSize: '0.7rem', color: msg?.startsWith('✓') ? '#7dffaa' : msg ? '#ff8080' : 'rgba(212,230,202,0.4)' }}>
          {msg || `${body.length}/320`}
        </span>
        <button onClick={send} disabled={sending || !body.trim()}
          style={{ padding: '7px 16px', borderRadius: 6, border: 'none', cursor: sending || !body.trim() ? 'not-allowed' : 'pointer', background: sending || !body.trim() ? 'rgba(125,255,170,0.2)' : '#7dffaa', color: '#0d1a10', fontWeight: 800, fontSize: '0.82rem', fontFamily: 'Nunito Sans, sans-serif' }}>
          {sending ? 'Sending…' : 'Send SMS'}
        </button>
      </div>
    </div>
  )
}

function ApptRow({ b, accent }) {
  return (
    <div style={{ padding: '9px 0', borderBottom: '1px solid rgba(122,171,130,0.07)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: '0.83rem', fontWeight: 800, color: accent }}>{fmtDate(b.startTime)}</span>
        <span style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.4)', whiteSpace: 'nowrap' }}>{fmtTime(b.startTime)}</span>
      </div>
      {b.title && <div style={{ fontSize: '0.75rem', color: 'rgba(212,230,202,0.5)', marginTop: 2 }}>{b.title}</div>}
    </div>
  )
}

function AppointmentHistoryPanel({ detail, onSchedule, scheduleBtn }) {
  const upcoming = detail.upcomingBookings?.length ? detail.upcomingBookings : (detail.nextBooking ? [detail.nextBooking] : [])
  const past = detail.pastBookings || []
  const lbl = { fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.35)', margin: '16px 0 6px' }
  return (
    <div style={{ paddingTop: 8 }}>
      <button style={scheduleBtn} onClick={onSchedule}>+ Schedule appointment</button>
      <div style={lbl}>Upcoming ({upcoming.length})</div>
      {upcoming.length === 0
        ? <div style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.3)' }}>None scheduled</div>
        : upcoming.map((b, i) => <ApptRow key={b.id || i} b={b} accent="#c9a84c" />)}
      <div style={lbl}>Past ({past.length})</div>
      {past.length === 0
        ? <div style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.3)' }}>No past visits</div>
        : past.map((b, i) => <ApptRow key={b.id || i} b={b} accent="#7dffaa" />)}
    </div>
  )
}

// ── Main exported component ────────────────────────────────────────────────────
// customer: { id?, email, name?, phone?, status? }
// Pass id (Stripe customer ID) OR email — the API accepts either.

export default function CustomerPanel({ customer, onClose }) {
  const router = useRouter()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState('details')
  const [editForm, setEditForm] = useState({ name: '', phone: '', address: '', planType: '', systemType: '', trapCount: '', hasTimer: false })
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [apptDock, setApptDock] = useState(null)   // { loading, details }

  async function openApptDock(eventId) {
    if (!eventId) return
    setApptDock({ loading: true, details: null })
    try {
      const res = await fetch(`/api/admin/appointment-details?eventId=${encodeURIComponent(eventId)}`)
      const data = await res.json()
      setApptDock({ loading: false, details: res.ok ? data : { error: data.error || 'Failed to load' } })
    } catch {
      setApptDock({ loading: false, details: { error: 'Failed to load' } })
    }
  }
  const [messaging, setMessaging] = useState(false)
  const [msgForm, setMsgForm] = useState({ subject: '', body: '' })
  const [msgSending, setMsgSending] = useState(false)
  const [msgResult, setMsgResult] = useState(null)

  const fetchDetail = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = customer.id
        ? `customerId=${customer.id}`
        : `email=${encodeURIComponent(customer.email)}`
      const res = await fetch(`/api/admin/customer-detail?${qs}`)
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setDetail(data)
      setEditForm({ name: data.name, phone: data.phone, address: data.address, planType: data.planType || '', systemType: data.systemType || '', trapCount: data.trapCount || '', hasTimer: data.hasTimer || false })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [customer.id, customer.email])

  const [fetched, setFetched] = useState(false)
  if (!fetched) { setFetched(true); fetchDetail() }

  async function saveEdit() {
    setSaving(true)
    await fetch('/api/admin/update-customer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: customer.id, hubspotContactId: detail?.hubspotContactId, ...editForm }),
    })
    setSaving(false)
    setEditing(false)
    fetchDetail()
  }

  async function handleCancel() {
    if (!detail?.nextBooking?.calBookingId) return
    if (!window.confirm('Cancel this appointment?')) return
    setCancelling(true)
    await fetch('/api/admin/cancel-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: detail.nextBooking.calBookingId }),
    })
    setCancelling(false)
    fetchDetail()
  }

  function scheduleForCustomer() {
    const d = detail || customer
    const params = new URLSearchParams({
      email: d.email || customer.email || '',
      name: d.name || customer.name || '',
      phone: d.phone || customer.phone || '',
      address: d.address || '',
    })
    router.push('/admin/booking?' + params.toString())
  }

  const panel = {
    position: 'fixed', top: 0, right: 0, bottom: 0, width: 400,
    background: '#0d1a10', borderLeft: '1px solid rgba(122,171,130,0.2)',
    zIndex: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column',
    boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
  }
  const row = { padding: '14px 0', borderBottom: '1px solid rgba(122,171,130,0.08)' }
  const lbl = { fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.35)', marginBottom: 4 }
  const val = { fontSize: '0.88rem', fontWeight: 600, color: '#d4e6ca' }
  const input = {
    width: '100%', padding: '8px 10px', borderRadius: 6, boxSizing: 'border-box',
    border: '1px solid rgba(122,171,130,0.3)', background: 'rgba(255,255,255,0.04)',
    color: '#d4e6ca', fontSize: '0.85rem', fontFamily: 'Nunito Sans, sans-serif', outline: 'none',
  }
  const btn = (variant) => ({
    padding: '7px 14px', borderRadius: 4, border: 'none', cursor: 'pointer',
    fontWeight: 800, fontSize: '0.78rem', fontFamily: 'Nunito Sans, sans-serif',
    ...(variant === 'gold'  ? { background: '#c9a84c', color: '#0d1a10' } :
        variant === 'green' ? { background: '#7dffaa', color: '#0d1a10' } :
        variant === 'red'   ? { background: 'rgba(255,100,100,0.15)', color: '#ff8080', border: '1px solid rgba(255,100,100,0.25)' } :
        variant === 'ghost' ? { background: 'rgba(122,171,130,0.08)', color: 'rgba(212,230,202,0.6)', border: '1px solid rgba(122,171,130,0.15)' } :
                              { background: 'rgba(122,171,130,0.12)', color: '#7aab82' }),
  })

  return (
    <div style={panel} className="docked-panel">
      {/* Header */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(122,171,130,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: '1.1rem', marginBottom: 2 }}>{customer.name || 'Customer'}</div>
          {detail?.systemType ? (
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#c9a84c', marginBottom: 4 }}>
              {detail.systemType === 'Biogents-CO2' ? 'Biogents CO₂' : detail.systemType === 'Biogents-NonCO2' ? 'Biogents Non-CO₂' : 'Mosqitter Grand'}
              {detail.trapCount ? ` · ${detail.trapCount} trap${detail.trapCount > 1 ? 's' : ''}` : ''}
              {detail.planType ? ` · ${detail.planType}` : ''}
            </div>
          ) : customer.plan ? (
            <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.4)', marginBottom: 4 }}>{customer.plan}</div>
          ) : null}
          {(detail?.phone || customer.phone) && (
            <a href={`tel:${(detail?.phone || customer.phone).replace(/[^\d+]/g, '')}`} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#7dffaa', textDecoration: 'none', display: 'block', marginBottom: 4 }}>
              📞 {detail?.phone || customer.phone}
            </a>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {customer.status && customer.status !== 'inactive' && customer.status !== 'canceled' && <StatusBadge status={customer.status} />}
            {detail?.nextBooking && (
              <span style={{ fontSize: '0.7rem', color: '#7dffaa', fontWeight: 700 }}>
                Next: {fmtDate(detail.nextBooking.startTime)}
              </span>
            )}
            {detail?.pastBookings?.[0] && (
              <span style={{ fontSize: '0.7rem', color: 'rgba(212,230,202,0.35)', fontWeight: 600 }}>
                Last: {fmtDate(detail.pastBookings[0].startTime)}
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(212,230,202,0.4)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1, padding: 4, flexShrink: 0 }}>×</button>
      </div>

      {/* Action bar */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(122,171,130,0.08)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={btn('gold')} onClick={scheduleForCustomer}>+ Schedule</button>
        {!editing && <button style={btn('ghost')} onClick={() => setEditing(true)}>Edit</button>}
        {editing && <button style={btn('green')} onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>}
        {editing && <button style={btn('ghost')} onClick={() => setEditing(false)}>Cancel</button>}
        {customer.email && !messaging && (
          <button style={btn('ghost')} onClick={() => { setMessaging(true); setMsgResult(null); setMsgForm({ subject: `Hi from ${process.env.NEXT_PUBLIC_BIZ_NAME || 'GreenGuard USA'}`, body: '' }) }}>✉ Email</button>
        )}
        {(customer.phone || detail?.phone) && (
          <a href={`sms:${(customer.phone || detail?.phone || '').replace(/[^\d+]/g, '')}`} style={{ ...btn('ghost'), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>💬 Text</a>
        )}
      </div>

      {/* Email compose */}
      {messaging && (
        <div style={{ padding: '16px 20px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(122,171,130,0.08)' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.35)', marginBottom: 10 }}>
            Email to {customer.email}
          </div>
          <input value={msgForm.subject} onChange={(e) => setMsgForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Subject"
            style={{ width: '100%', marginBottom: 8, padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(122,171,130,0.2)', background: 'rgba(0,0,0,0.25)', color: '#d4e6ca', fontFamily: 'Nunito Sans, sans-serif', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none' }} />
          <textarea value={msgForm.body} onChange={(e) => setMsgForm((f) => ({ ...f, body: e.target.value }))}
            placeholder={`Hi ${customer.name?.split(' ')[0] || 'there'},\n\n`} rows={5}
            style={{ width: '100%', marginBottom: 8, padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(122,171,130,0.2)', background: 'rgba(0,0,0,0.25)', color: '#d4e6ca', fontFamily: 'Nunito Sans, sans-serif', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button disabled={msgSending || !msgForm.subject || !msgForm.body}
              onClick={async () => {
                setMsgSending(true); setMsgResult(null)
                try {
                  const res = await fetch('/api/admin/send-message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: customer.email, toName: customer.name, subject: msgForm.subject, body: msgForm.body }) })
                  const data = await res.json()
                  if (!res.ok) throw new Error(data.error)
                  setMsgResult('sent'); setMsgForm({ subject: '', body: '' }); setTimeout(() => setMessaging(false), 1500)
                } catch (e) { setMsgResult(e.message) }
                finally { setMsgSending(false) }
              }}
              style={{ ...btn('green'), opacity: (msgSending || !msgForm.subject || !msgForm.body) ? 0.5 : 1, cursor: (msgSending || !msgForm.subject || !msgForm.body) ? 'not-allowed' : 'pointer' }}>
              {msgSending ? 'Sending…' : 'Send Email'}
            </button>
            <button style={btn('ghost')} onClick={() => setMessaging(false)}>Cancel</button>
            {msgResult === 'sent' && <span style={{ fontSize: '0.8rem', color: '#7dffaa', fontWeight: 700 }}>✓ Sent</span>}
            {msgResult && msgResult !== 'sent' && <span style={{ fontSize: '0.8rem', color: '#ff8080' }}>{msgResult}</span>}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 20px 0' }}>
        {[{ k: 'details', l: 'Details' }, { k: 'history', l: 'History' }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            style={{ padding: '6px 16px', borderRadius: 4, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.76rem', fontFamily: 'Nunito Sans, sans-serif',
              background: tab === t.k ? '#c9a84c' : 'rgba(201,168,76,0.1)', color: tab === t.k ? '#0d1a10' : 'rgba(201,168,76,0.7)' }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ padding: '0 20px 32px', flex: 1 }}>
        {loading && <p style={{ color: 'rgba(212,230,202,0.4)', marginTop: 24 }}>Loading…</p>}
        {error && <p style={{ color: '#ff8080', marginTop: 24 }}>{error}</p>}

        {detail && !loading && tab === 'history' && (
          <AppointmentHistoryPanel detail={detail} onSchedule={scheduleForCustomer}
            scheduleBtn={{ ...btn('gold'), width: '100%', padding: '10px 14px', fontSize: '0.85rem' }} />
        )}

        {detail && !loading && tab === 'details' && (
          <>
            {editing ? (
              <div style={row}>
                <div style={lbl}>Edit Info</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                  <input style={input} placeholder="Full name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                  <input style={input} placeholder="Phone" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
                  <input style={input} placeholder="Address" value={editForm.address} onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))} />
                  <select style={input} value={editForm.planType} onChange={(e) => setEditForm((f) => ({ ...f, planType: e.target.value }))}>
                    <option value="">Plan type…</option>
                    <option value="rent">Rent</option>
                    <option value="own">Own</option>
                  </select>
                  <select style={input} value={editForm.systemType} onChange={(e) => setEditForm((f) => ({ ...f, systemType: e.target.value }))}>
                    <option value="">System type…</option>
                    <option value="Biogents-CO2">Biogents CO₂</option>
                    <option value="Biogents-NonCO2">Biogents Non-CO₂</option>
                    <option value="Mosqitter-Grand">Mosqitter Grand</option>
                  </select>
                  <input style={input} type="number" min="1" placeholder="Trap count" value={editForm.trapCount} onChange={(e) => setEditForm((f) => ({ ...f, trapCount: e.target.value }))} />
                  {editForm.systemType === 'Biogents-CO2' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'rgba(212,230,202,0.7)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!editForm.hasTimer} onChange={(e) => setEditForm((f) => ({ ...f, hasTimer: e.target.checked }))} />
                      Has Biogents Timer
                    </label>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Contact */}
                <div style={row}>
                  <div style={lbl}>Contact</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                    {detail.phone && (
                      <a href={`tel:${detail.phone.replace(/[^\d+]/g, '')}`} style={{ fontSize: '0.92rem', fontWeight: 700, color: '#7dffaa', textDecoration: 'none' }}>
                        📞 {detail.phone}
                      </a>
                    )}
                    {detail.email && (
                      <a href={`mailto:${detail.email}`} style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.6)', textDecoration: 'none', wordBreak: 'break-all' }}>
                        ✉ {detail.email}
                      </a>
                    )}
                    {detail.address && (
                      <a href={`https://maps.apple.com/?daddr=${encodeURIComponent(detail.address)}`} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: '1rem', fontWeight: 700, color: '#d4e6ca', textDecoration: 'none', lineHeight: 1.4 }}>
                        📍 {detail.address}
                      </a>
                    )}
                  </div>
                </div>

                {/* Notes */}
                <div style={row}>
                  <div style={lbl}>Notes</div>
                  <NoteComposer email={detail.email} hsContactId={detail.hubspotContactId} onSaved={fetchDetail} />
                  {(() => {
                    const adminNotes = (detail.notes || []).filter((n) => /^\[ADMIN-NOTE/.test(n.body || ''))
                    if (adminNotes.length === 0) return <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.3)', marginTop: 10 }}>No notes yet</div>
                    return adminNotes.map((note) => {
                      const body = (note.body || '').replace(/^\[ADMIN-NOTE[^\]]*\]\s*/, '')
                      return (
                        <div key={note.id} style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(201,168,76,0.05)', borderRadius: 6, borderLeft: '2px solid rgba(201,168,76,0.45)' }}>
                          <div style={{ fontSize: '0.82rem', whiteSpace: 'pre-wrap', color: 'rgba(212,230,202,0.85)', lineHeight: 1.5 }}>{body}</div>
                          {note.timestamp && (
                            <div style={{ fontSize: '0.66rem', color: 'rgba(212,230,202,0.32)', marginTop: 5 }}>
                              {new Date(note.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ })}
                            </div>
                          )}
                        </div>
                      )
                    })
                  })()}
                </div>

                {/* System */}
                {detail.systemType && (() => {
                  const img = getTrapImage(detail.systemType, detail.trapCount)
                  const label = detail.systemType === 'Biogents-CO2' ? 'Biogents CO₂' : detail.systemType === 'Biogents-NonCO2' ? 'Biogents Non-CO₂' : 'Mosqitter Grand'
                  return (
                    <div style={row}>
                      <div style={lbl}>System</div>
                      {img && <img src={img} alt={label} style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 8, marginBottom: 6, border: '1px solid rgba(122,171,130,0.15)' }} />}
                      <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.65)' }}>
                        {detail.planType && <span style={{ textTransform: 'capitalize', marginRight: 8, color: '#c9a84c', fontWeight: 800 }}>{detail.planType}</span>}
                        <span style={{ fontWeight: 700 }}>{label}</span>
                        {detail.trapCount ? <span style={{ color: 'rgba(212,230,202,0.4)', marginLeft: 6 }}>· {detail.trapCount} trap{detail.trapCount > 1 ? 's' : ''}</span> : ''}
                        {detail.hasTimer ? <span style={{ color: 'rgba(212,230,202,0.4)', marginLeft: 6 }}>· Timer</span> : ''}
                      </div>
                    </div>
                  )
                })()}

                {/* Plan */}
                {detail.subscription && (
                  <div style={row}>
                    <div style={lbl}>Plan</div>
                    <div style={{ fontSize: '1rem', fontWeight: 900, color: '#c9a84c' }}>{fmtAmt(detail.subscription.amount)}<span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'rgba(212,230,202,0.4)', marginLeft: 4 }}>/{detail.subscription.interval}</span></div>
                    {detail.subscription.label && <div style={{ fontSize: '0.75rem', color: 'rgba(212,230,202,0.35)', marginTop: 2 }}>{detail.subscription.label}</div>}
                  </div>
                )}

                {/* Outstanding invoices */}
                {detail.openInvoices?.length > 0 && (
                  <div style={row}>
                    <div style={{ ...lbl, color: '#ffb060' }}>⚠ Outstanding Invoices</div>
                    {detail.openInvoices.map((inv) => (
                      <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, padding: '8px 10px', background: 'rgba(255,160,80,0.06)', borderRadius: 6, border: '1px solid rgba(255,160,80,0.15)' }}>
                        <div>
                          <div style={{ fontWeight: 800, color: '#ffb060' }}>{fmtAmt(inv.amountDue)}</div>
                          <div style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.35)', marginTop: 2 }}>{inv.number} · {fmtDateShort(inv.created)}</div>
                        </div>
                        {inv.hostedUrl && <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.72rem', padding: '5px 12px', borderRadius: 4, background: '#c9a84c', color: '#0d1a10', fontWeight: 800, textDecoration: 'none' }}>Pay</a>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Last visit */}
                {detail.pastBookings?.length > 0 && (
                  <div style={row}>
                    <div style={lbl}>Last Visit</div>
                    <div style={{ marginTop: 4, padding: '10px 12px', background: 'rgba(125,255,170,0.04)', borderRadius: 8, border: '1px solid rgba(125,255,170,0.1)' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#7dffaa' }}>{fmtDate(detail.pastBookings[0].startTime)}</div>
                      <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.5)', marginTop: 2 }}>{detail.pastBookings[0].title}</div>
                      {detail.pastBookings[0].address && <div style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.35)', marginTop: 2 }}>{detail.pastBookings[0].address}</div>}
                    </div>
                    {detail.pastBookings.length > 1 && (
                      <div style={{ marginTop: 8 }}>
                        {detail.pastBookings.slice(1).map((b) => (
                          <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(122,171,130,0.07)' }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(212,230,202,0.55)' }}>{fmtDate(b.startTime)}</div>
                            <div style={{ fontSize: '0.74rem', color: 'rgba(212,230,202,0.35)', textAlign: 'right', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Next appointment */}
                <div style={row}>
                  <div style={lbl}>Next Appointment</div>
                  {detail.nextBooking ? (
                    <div
                      onClick={() => openApptDock(detail.nextBooking.id)}
                      style={{ marginTop: 4, padding: '10px 12px', background: 'rgba(201,168,76,0.06)', borderRadius: 8, border: '1px solid rgba(201,168,76,0.2)', cursor: detail.nextBooking.id ? 'pointer' : 'default' }}
                      title={detail.nextBooking.id ? 'Click to view appointment details' : undefined}
                    >
                      <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#c9a84c' }}>{fmtDate(detail.nextBooking.startTime)}</div>
                      <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.5)', marginTop: 2 }}>{detail.nextBooking.title}</div>
                      {detail.nextBooking.address && <div style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.35)', marginTop: 2 }}>{detail.nextBooking.address}</div>}
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        {detail.nextBooking.calBookingId && (
                          <button style={btn('red')} onClick={handleCancel} disabled={cancelling}>{cancelling ? 'Cancelling…' : 'Cancel'}</button>
                        )}
                        {detail.nextBooking.calBookingUid && (
                          <a href={`https://cal.com/reschedule/${detail.nextBooking.calBookingUid}`} target="_blank" rel="noopener noreferrer" style={{ ...btn('ghost'), textDecoration: 'none', display: 'inline-block' }}>Reschedule</a>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.3)', marginTop: 4 }}>None scheduled</div>
                  )}
                </div>

                {/* SMS */}
                {(detail.phone || customer.phone) && (
                  <div style={row}>
                    <div style={lbl}>Send SMS</div>
                    <SmsComposer email={detail.email || customer.email} phone={detail.phone || customer.phone} onSent={fetchDetail} />
                  </div>
                )}

                {/* SMS history */}
                {(detail.notes || []).some((n) => /^\[SMS-(IN|OUT)/.test(n.body || '')) && (
                  <div style={{ ...row, borderBottom: 'none' }}>
                    <div style={lbl}>SMS history</div>
                    {detail.notes.filter((n) => /^\[SMS-(IN|OUT)/.test(n.body || '')).map((note) => {
                      const body = note.body || ''
                      const isSmsIn = body.startsWith('[SMS-IN')
                      const tag = isSmsIn ? '← Inbound' : '→ Outbound'
                      const bg = isSmsIn ? 'rgba(91,196,255,0.06)' : 'rgba(125,255,170,0.05)'
                      const bord = isSmsIn ? 'rgba(91,196,255,0.35)' : 'rgba(125,255,170,0.35)'
                      return (
                        <div key={note.id} style={{ marginTop: 8, padding: '10px 12px', background: bg, borderRadius: 6, borderLeft: `2px solid ${bord}` }}>
                          <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: isSmsIn ? '#5bc4ff' : '#7dffaa', marginBottom: 4 }}>{tag}</div>
                          <div style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', color: 'rgba(212,230,202,0.75)', lineHeight: 1.5 }}>{body.replace(/^\[SMS-(IN|OUT)[^\]]*\]\s*(\([^)]*\)\s*)?(by [^\n]*:\s*)?/, '').replace(/^From[^\n]*\n/, '')}</div>
                          {note.timestamp && (
                            <div style={{ fontSize: '0.66rem', color: 'rgba(212,230,202,0.28)', marginTop: 5 }}>
                              {new Date(note.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Appointment detail dock — opens on top when next appointment is clicked */}
      {apptDock && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 299 }}
            onClick={() => setApptDock(null)}
          />
          <DetailDock
            details={apptDock.details}
            loading={apptDock.loading}
            onClose={() => setApptDock(null)}
          />
        </>
      )}
    </div>
  )
}
