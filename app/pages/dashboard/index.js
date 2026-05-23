import { useState, useRef } from 'react'
import Head from 'next/head'
import Image from 'next/image'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { getSubscriptions, getInvoices, getCustomer } from '../../lib/stripe'
import { getUpcomingBookingsForEmail, getPastBookingsForEmail } from '../../lib/gcal'
import { findContactByEmail } from '../../lib/hubspot'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

function getTrapImage(systemType, trapCount) {
  if (systemType === 'Mosqitter-Grand' || systemType === 'Mosqitter' || systemType === 'MQ-RENT') return '/images/trap-mosqitter.webp'
  if (systemType === 'Biogents-NonCO2') return '/images/mosquitairenoco2.webp'
  if (systemType === 'Biogents-CO2') {
    if (trapCount >= 3) return '/images/biogentstriple.png'
    if (trapCount === 2) return '/images/mosquitairedouble.webp'
    return '/images/mosquitairesingle.jpg'
  }
  return null
}

const SYSTEM_LABELS = {
  'Biogents-CO2': 'Biogents CO₂ Trap',
  'Biogents-NonCO2': 'Biogents (Non-CO₂)',
  'Mosqitter-Grand': 'Mosqitter Grand',
  // legacy values
  Mosqitter: 'Mosqitter Grand',
  'MQ-RENT': 'Mosqitter Grand',
}

export async function getServerSideProps({ req, query }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }

  const { email, stripeCustomerId } = session
  const isAdmin = email === ADMIN_EMAIL
  // Redirect admin to analytics unless previewing the customer view
  if (isAdmin && !query.preview) return { redirect: { destination: '/admin/analytics', permanent: false } }

  const [upcoming, past, subscriptions, invoices, contact, stripeCustomer] = await Promise.all([
    getUpcomingBookingsForEmail(email, 1).catch(() => []),
    getPastBookingsForEmail(email, 1).catch(() => []),
    stripeCustomerId ? getSubscriptions(stripeCustomerId) : Promise.resolve([]),
    stripeCustomerId ? getInvoices(stripeCustomerId, 24) : Promise.resolve([]),
    findContactByEmail(email).catch(() => null),
    stripeCustomerId ? getCustomer(stripeCustomerId).catch(() => null) : Promise.resolve(null),
  ])

  const p = contact?.properties || {}
  const m = stripeCustomer?.metadata || {}

  // Infer system type from most recent appointment title when HubSpot property is missing
  function inferSystemFromTitle(title) {
    if (!title) return null
    const t = title.toLowerCase()
    if (t.includes('mosqitter')) return 'Mosqitter-Grand'
    if (t.includes('biogents') && t.includes('co2')) return 'Biogents-CO2'
    if (t.includes('biogents')) return 'Biogents-CO2'
    return null
  }
  function inferTrapCountFromTitle(title) {
    if (!title) return 0
    const m = title.match(/(\d+)\s*(trap|unit|mosquitaire)/i)
    return m ? parseInt(m[1], 10) : 1
  }

  const lastTitle = past[0]?.title || upcoming[0]?.title || ''
  const inferredSystem = inferSystemFromTitle(lastTitle)
  const inferredTrapCount = inferTrapCountFromTitle(lastTitle)

  // HubSpot custom properties are source of truth; appointment title is fallback; Stripe metadata is fallback
  const trapCount = parseInt(p.trap_count || m.trap_count || '0', 10) || (inferredSystem ? inferredTrapCount : 0)
  const tankCount = parseInt(p.tank_count || m.tank_count || '0', 10)
  const planType = p.plan_type || m.plan_type || null
  const systemType = p.system_type || m.system_type || inferredSystem || null
  const usesC02 = systemType === 'Biogents-CO2' || systemType === 'Mosqitter-Grand' || systemType === 'Mosqitter' || systemType === 'MQ-RENT'
  const hasTimer = p.has_timer === 'true' && systemType === 'Biogents-CO2'

  let nextRefillDate = null
  if (p.service_start_date && usesC02 && trapCount > 0) {
    const install = new Date(p.service_start_date)
    const now = new Date()
    const monthsSince = (now.getFullYear() - install.getFullYear()) * 12 + (now.getMonth() - install.getMonth())
    const next = new Date(install)
    next.setMonth(next.getMonth() + monthsSince + 1)
    nextRefillDate = next.toISOString()
  }

  const sub = subscriptions[0] || null

  return {
    props: {
      email,
      name: [p.firstname, p.lastname].filter(Boolean).join(' ') || null,
      // visits
      nextBooking: upcoming[0] ? { startTime: upcoming[0].startTime, title: upcoming[0].title, address: upcoming[0].address } : null,
      prevBooking: past[0] ? { startTime: past[0].startTime, title: past[0].title, address: past[0].address } : null,
      // system
      systemType,
      trapCount,
      tankCount,
      planType,
      hasTimer,
      customerType: p.customer_type || null,
      installDate: p.service_start_date || null,
      trapImage: getTrapImage(systemType, trapCount),
      systemLabel: SYSTEM_LABELS[systemType] || systemType || null,
      systemFromAppointment: !p.system_type && !m.system_type && !!inferredSystem,
      lastAppointmentTitle: lastTitle || null,
      // co2
      usesC02,
      nextRefillDate,
      // Tank lifetime in days: Mosqitter 28, Biogents+timer 28, Biogents (no timer) 20
      tankLifetimeDays: usesC02
        ? (systemType === 'Biogents-CO2' && !hasTimer ? 20 : 28)
        : null,
      // billing
      subscription: sub ? {
        status: sub.status,
        amount: sub.items.data.reduce((s, i) => s + (i.price.unit_amount || 0), 0),
        interval: sub.items.data[0]?.price.recurring?.interval || 'month',
        label: sub.items.data.map((i) => i.price.nickname || '').filter(Boolean).join(' + '),
        currentPeriodEnd: sub.current_period_end,
      } : null,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        number: inv.number || inv.id,
        status: inv.status,
        amountPaid: inv.amount_paid,
        amountDue: inv.amount_due,
        created: inv.created,
        hostedUrl: inv.hosted_invoice_url,
        pdfUrl: inv.invoice_pdf,
      })),
    },
  }
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

const TZ = 'America/Chicago'
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ })
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })
}
function fmtDateShort(unix) {
  return new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ })
}

function fmtAmount(cents) {
  return `$${(cents / 100).toFixed(2)}`
}

const INV_STATUS_COLOR = {
  paid: '#7dffaa',
  open: '#c9a84c',
  void: 'rgba(212,230,202,0.35)',
  uncollectible: '#ff6b6b',
}

const DIVIDER = <div style={{ borderTop: '1px solid rgba(122,171,130,0.12)', margin: '32px 0' }} />

const SECTION_LABEL = (text) => (
  <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c9a84c', marginBottom: 18 }}>
    {text}
  </div>
)

// ── Date range filter options ──────────────────────────────────────────────────

const DATE_RANGES = [
  { label: 'Last 3 months', months: 3 },
  { label: 'Last 6 months', months: 6 },
  { label: 'This year', months: 12 },
  { label: 'All time', months: null },
]

// ── System editor ──────────────────────────────────────────────────────────────

function SystemEditor({ systemType, trapCount, hasTimer, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ systemType: systemType || 'Biogents-CO2', trapCount: trapCount || 1, hasTimer: !!hasTimer })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  async function save() {
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/api/customer/update-system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Save failed')
      setMsg('Saved ✓')
      setEditing(false)
      setTimeout(() => { onSaved && onSaved(); window.location.reload() }, 500)
    } catch (e) { setMsg(e.message) }
    setSaving(false)
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(125,255,170,0.7)', fontSize: '0.75rem', fontWeight: 700, padding: '4px 0', fontFamily: 'Nunito Sans, sans-serif' }}>
        ✎ Edit my system
      </button>
    )
  }

  const inp = { padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(122,171,130,0.3)', background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.85rem', fontFamily: 'Nunito Sans, sans-serif', outline: 'none' }
  return (
    <div style={{ marginTop: 10, padding: 14, borderRadius: 8, background: 'rgba(125,255,170,0.04)', border: '1px solid rgba(125,255,170,0.18)' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7dffaa', marginBottom: 10 }}>Edit your system</div>
      <div style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.72rem', color: 'rgba(212,230,202,0.5)', fontWeight: 700 }}>
          Trap type
          <select value={form.systemType} onChange={(e) => setForm((f) => ({ ...f, systemType: e.target.value }))} style={inp}>
            <option value="Biogents-CO2">Biogents CO₂ Trap</option>
            <option value="Biogents-NonCO2">Biogents (Non-CO₂)</option>
            <option value="Mosqitter-Grand">Mosqitter Grand</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.72rem', color: 'rgba(212,230,202,0.5)', fontWeight: 700 }}>
          Number of traps
          <input type="number" min="1" max="10" value={form.trapCount} onChange={(e) => setForm((f) => ({ ...f, trapCount: parseInt(e.target.value, 10) || 1 }))} style={inp} />
        </label>
        {form.systemType === 'Biogents-CO2' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'rgba(212,230,202,0.8)', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.hasTimer} onChange={(e) => setForm((f) => ({ ...f, hasTimer: e.target.checked }))} style={{ width: 16, height: 16 }} />
            I have a timer installed
          </label>
        )}
        <div style={{ fontSize: '0.7rem', color: 'rgba(212,230,202,0.4)', fontStyle: 'italic' }}>
          This updates how we show your tank level only. It will not change your billing or scheduled visits.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={save} disabled={saving} style={{ flex: 1, padding: '9px', borderRadius: 6, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', background: '#7dffaa', color: '#0d1a10', fontWeight: 900, fontSize: '0.85rem', fontFamily: 'Nunito Sans, sans-serif', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => { setEditing(false); setMsg(null) }} style={{ padding: '9px 16px', borderRadius: 6, border: '1px solid rgba(122,171,130,0.25)', cursor: 'pointer', background: 'transparent', color: 'rgba(212,230,202,0.6)', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'Nunito Sans, sans-serif' }}>
            Cancel
          </button>
        </div>
        {msg && <div style={{ fontSize: '0.78rem', color: msg.startsWith('Saved') ? '#7dffaa' : '#ff8080', fontWeight: 700 }}>{msg}</div>}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

function CustomerMediaUpload({ email }) {
  const [uploads, setUploads] = useState([])
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState(null)
  const [caption, setCaption] = useState('')
  const fileRef = useRef(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true); setMsg(null)
    try {
      const res = await fetch('/api/customer/upload-media', {
        method: 'POST',
        headers: { 'Content-Type': file.type, 'x-caption': caption, 'x-email': email },
        body: file,
      })
      if (res.ok) {
        const { url } = await res.json()
        setUploads((u) => [...u, { url, type: file.type, caption }])
        setCaption('')
        setMsg('Uploaded! Our team will review it.')
        if (fileRef.current) fileRef.current.value = ''
      } else {
        const d = await res.json().catch(() => ({}))
        setMsg(d.error || 'Upload failed')
      }
    } catch (err) { setMsg(err.message) }
    setUploading(false)
  }

  const btnStyle = (color) => ({ padding: '10px 18px', borderRadius: 8, border: `1px dashed ${color}40`, background: 'transparent', color, cursor: uploading ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontFamily: 'Nunito Sans, sans-serif', fontWeight: 700, opacity: uploading ? 0.5 : 1 })
  const inp = { width: '100%', padding: '9px 12px', boxSizing: 'border-box', border: '1px solid rgba(122,171,130,0.2)', borderRadius: 8, background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.85rem', fontFamily: 'Nunito Sans, sans-serif', outline: 'none', marginBottom: 12 }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <p style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.55)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Show us your results or report an issue — upload a photo or short video and we&apos;ll follow up.
      </p>
      <input style={inp} placeholder="Optional caption or description…" value={caption} onChange={(e) => setCaption(e.target.value)} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input ref={fileRef} type="file" accept="image/*,video/*"  style={{ display: 'none' }} onChange={handleFile} />
        <button onClick={() => { fileRef.current.accept='image/*'; fileRef.current?.click() }} disabled={uploading} style={btnStyle('#7dffaa')}>📷 Photo</button>
        <button onClick={() => { fileRef.current.accept='video/*'; fileRef.current?.click() }} disabled={uploading} style={btnStyle('#5bc4ff')}>
          {uploading ? 'Uploading…' : '🎥 Video'}
        </button>
      </div>
      {msg && <p style={{ fontSize: '0.82rem', marginTop: 10, color: msg.includes('failed') || msg.includes('error') ? '#ff8080' : '#7dffaa' }}>{msg}</p>}
      {uploads.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          {uploads.map((u, i) => u.type.startsWith('video')
            ? <video key={i} src={u.url} controls style={{ height: 100, borderRadius: 8 }} />
            : <img key={i} src={u.url} alt={u.caption} style={{ height: 100, borderRadius: 8, objectFit: 'cover' }} />
          )}
        </div>
      )}
    </div>
  )
}

export default function CustomerOverview({
  email, name,
  nextBooking, prevBooking,
  systemType, trapCount, tankCount, hasTimer, customerType, installDate, trapImage, systemLabel,
  usesC02, nextRefillDate, systemFromAppointment, lastAppointmentTitle, tankLifetimeDays,
  subscription, invoices,
}) {
  const [dateRange, setDateRange] = useState(6)

  const filteredInvoices = dateRange === null
    ? invoices
    : invoices.filter((inv) => {
        const cutoff = Date.now() / 1000 - dateRange * 30 * 86400
        return inv.created >= cutoff
      })

  const hasOpenInvoice = invoices.some((inv) => inv.status === 'open')

  return (
    <>
      <Head><title>My Account · GreenGuard</title></Head>
      <PortalLayout isAdmin={false}>
        {/* ── Header ── */}
        <div style={{ marginBottom: 36 }}>
          <span className="tag">My Account</span>
          <h1 style={{ fontSize: 'clamp(1.5rem,3vw,2rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
            {name ? `Welcome back, ${name.split(' ')[0]}` : 'Welcome back'}
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.45)', margin: 0 }}>{email}</p>
        </div>

        {/* ── Visits ── */}
        {SECTION_LABEL('Schedule')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, marginBottom: 20 }}>
          {/* Previous */}
          <div className="card" style={{ opacity: 0.7 }}>
            <span className="tag">Previous Visit</span>
            {prevBooking ? (
              <>
                <div style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 4 }}>{fmtDate(prevBooking.startTime)}</div>
                <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.55)' }}>{prevBooking.title}</div>
                {prevBooking.address && <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.35)', marginTop: 4 }}>{prevBooking.address}</div>}
              </>
            ) : (
              <div style={{ fontSize: '0.88rem', color: 'rgba(212,230,202,0.4)' }}>No previous visits on record</div>
            )}
          </div>

          {/* Next */}
          <div className="card">
            <span className="tag">Next Visit</span>
            {nextBooking ? (
              <>
                <div style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 4, color: '#7dffaa' }}>{fmtDate(nextBooking.startTime)}</div>
                <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.6)' }}>{nextBooking.title}</div>
                {nextBooking.address && <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.4)', marginTop: 4 }}>{nextBooking.address}</div>}
              </>
            ) : (
              <div style={{ fontSize: '0.88rem', color: 'rgba(212,230,202,0.4)' }}>No upcoming visits scheduled</div>
            )}
          </div>
        </div>

        <a
          href={`mailto:admin@greenguard-usa.com?subject=Service Visit Request&body=Hi GreenGuard team,%0A%0AI'd like to request a service visit.%0A%0AAccount email: ${encodeURIComponent(email)}`}
          style={{
            display: 'inline-block', marginBottom: 8,
            padding: '10px 22px', borderRadius: 6,
            border: '1px solid rgba(122,171,130,0.35)',
            color: '#7aab82', fontWeight: 800, fontSize: '0.85rem',
            textDecoration: 'none',
          }}
        >
          Request a Service Visit →
        </a>

        {DIVIDER}

        {/* ── My System ── */}
        {SECTION_LABEL('My System')}
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 20 }}>
          {trapImage && (
            <div style={{ flexShrink: 0 }}>
              <Image
                src={trapImage}
                alt={systemLabel || 'Your trap'}
                width={180}
                height={180}
                style={{ borderRadius: 12, objectFit: 'cover', display: 'block' }}
              />
            </div>
          )}
          <div className="card" style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 900, fontSize: '1.1rem', marginBottom: 6 }}>
              {systemLabel || 'System details loading'}
            </div>
            {systemFromAppointment && lastAppointmentTitle && (
              <div style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.4)', marginBottom: 10, lineHeight: 1.4 }}>
                Based on your last appointment: {lastAppointmentTitle}
              </div>
            )}
            {customerType && (
              <div style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, background: 'rgba(125,255,170,0.1)', color: '#7dffaa', fontSize: '0.72rem', fontWeight: 800, marginBottom: 14 }}>
                {customerType === 'rental' ? 'Rental' : 'Owned'}
              </div>
            )}
            {trapCount > 0 && (
              <div style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.6)', marginBottom: 6 }}>
                {trapCount} trap{trapCount !== 1 ? 's' : ''} active
              </div>
            )}
            {hasTimer && (
              <div style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.6)', marginBottom: 6 }}>Timer installed</div>
            )}
            {installDate && (
              <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.4)', marginTop: 4 }}>
                Service since {new Date(installDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </div>
            )}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(122,171,130,0.12)' }}>
              <SystemEditor systemType={systemType} trapCount={trapCount} hasTimer={hasTimer} />
            </div>
          </div>
        </div>
        <a
          href={`mailto:admin@greenguard-usa.com?subject=Equipment Upgrade Request&body=Hi GreenGuard team,%0A%0AI'd like to request additional equipment or an upgrade to my system.%0A%0AAccount email: ${encodeURIComponent(email)}`}
          style={{
            display: 'inline-block', marginBottom: 8,
            padding: '10px 22px', borderRadius: 6,
            border: '1px solid rgba(201,168,76,0.4)',
            color: '#c9a84c', fontWeight: 800, fontSize: '0.85rem',
            textDecoration: 'none',
          }}
        >
          Request Equipment Upgrade →
        </a>

        {/* ── CO₂ Status — current tank level only ── */}
        {usesC02 && tankLifetimeDays && (() => {
          const baseDate = prevBooking?.startTime ? new Date(prevBooking.startTime) : (installDate ? new Date(installDate) : null)
          if (!baseDate) return null
          const daysSince = Math.max(0, Math.floor((Date.now() - baseDate.getTime()) / 86400000))
          const remainingDays = Math.max(0, tankLifetimeDays - daysSince)
          const pct = Math.max(0, Math.min(100, Math.round((remainingDays / tankLifetimeDays) * 100)))
          const color = pct > 50 ? '#7dffaa' : pct > 20 ? '#c9a84c' : '#ff8080'
          const lifetimeNote = systemType === 'Biogents-CO2'
            ? (hasTimer ? 'Biogents with timer · 28-day tank' : 'Biogents without timer · 20-day tank')
            : 'Mosqitter Grand · 28-day tank'
          return (
            <>
              {DIVIDER}
              {SECTION_LABEL('Current Tank Level')}
              <div className="card" style={{ maxWidth: 600, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <span style={{ fontSize: '2.6rem', fontWeight: 900, lineHeight: 1, color }}>{pct}%</span>
                  <span style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.55)', fontWeight: 700 }}>
                    ~{remainingDays} day{remainingDays !== 1 ? 's' : ''} left
                  </span>
                </div>
                <div style={{ height: 10, borderRadius: 6, background: 'rgba(212,230,202,0.08)', overflow: 'hidden', marginBottom: 10 }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.4s ease' }} />
                </div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.5)' }}>
                  {lifetimeNote} · last service {fmtDate(baseDate.toISOString())}
                </div>
                {pct <= 20 && (
                  <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, background: 'rgba(255,128,128,0.08)', border: '1px solid rgba(255,128,128,0.25)', fontSize: '0.82rem', color: '#ff8080', fontWeight: 700 }}>
                    Time to schedule your next refill.
                  </div>
                )}
              </div>
            </>
          )
        })()}

        {DIVIDER}

        {/* ── Billing ── */}
        {SECTION_LABEL('Billing')}

        {hasOpenInvoice && (
          <div style={{
            background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)',
            borderRadius: 6, padding: '12px 16px', marginBottom: 20,
            fontSize: '0.88rem', color: '#c9a84c',
          }}>
            <strong>Payment due</strong> — click <strong>Pay Now</strong> on the invoice below.
          </div>
        )}

        {subscription && (
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
            <div>
              <span className="tag">Active Plan</span>
              <div style={{ fontWeight: 900, fontSize: '1.2rem' }}>{fmtAmount(subscription.amount)}/{subscription.interval}</div>
              <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.5)', marginTop: 2 }}>
                {subscription.label && `${subscription.label} · `}renews {fmtDate(new Date(subscription.currentPeriodEnd * 1000).toISOString())}
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/customer/billing-portal" className="btn-gold" style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
              Manage payment →
            </a>
          </div>
        )}

        {/* Invoice History */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)' }}>
            Invoice History
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DATE_RANGES.map((r) => (
              <button
                key={r.label}
                onClick={() => setDateRange(r.months)}
                style={{
                  padding: '5px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
                  fontSize: '0.75rem', fontWeight: 700, fontFamily: 'Nunito Sans, sans-serif',
                  background: dateRange === r.months ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.04)',
                  color: dateRange === r.months ? '#c9a84c' : 'rgba(212,230,202,0.45)',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {filteredInvoices.length === 0 ? (
          <p style={{ color: 'rgba(212,230,202,0.4)', fontSize: '0.88rem' }}>No invoices in this period.</p>
        ) : (
          filteredInvoices.map((inv) => (
            <div key={inv.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                <div style={{ minWidth: 90 }}>
                  <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.4)' }}>{fmtDateShort(inv.created)}</div>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{inv.number}</div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: INV_STATUS_COLOR[inv.status] || 'rgba(212,230,202,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {inv.status}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <span style={{ fontWeight: 800 }}>
                  {fmtAmount(inv.status === 'open' ? inv.amountDue : (inv.amountPaid || inv.amountDue))}
                </span>
                {inv.hostedUrl && inv.status === 'open' && (
                  <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" style={{ padding: '7px 14px', borderRadius: 4, background: '#7dffaa', color: '#0d1a10', fontWeight: 800, fontSize: '0.78rem', textDecoration: 'none' }}>
                    Pay Now
                  </a>
                )}
                {inv.hostedUrl && inv.status !== 'open' && (
                  <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" className="btn-outline" style={{ fontSize: '0.78rem', padding: '7px 14px' }}>
                    View
                  </a>
                )}
                {inv.pdfUrl && (
                  <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.78rem', color: '#7aab82', fontWeight: 700 }}>
                    PDF
                  </a>
                )}
              </div>
            </div>
          ))
        )}

        {DIVIDER}

        {/* ── Reschedule / Pause ── */}
        {SECTION_LABEL('Service Options')}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          {nextBooking && (
            <a
              href={`mailto:admin@greenguard-usa.com?subject=Reschedule Request&body=Hi, I'd like to reschedule my upcoming visit on ${fmtDate(nextBooking.startTime)}.%0A%0AAccount: ${encodeURIComponent(email)}`}
              style={{ padding: '10px 20px', borderRadius: 6, border: '1px solid rgba(122,171,130,0.3)', color: '#7aab82', fontWeight: 800, fontSize: '0.85rem', textDecoration: 'none' }}
            >
              Reschedule Upcoming Visit
            </a>
          )}
          {subscription && (
            <a
              href={`mailto:admin@greenguard-usa.com?subject=Service Pause Request&body=Hi, I'd like to pause my GreenGuard service temporarily.%0A%0AAccount: ${encodeURIComponent(email)}`}
              style={{ padding: '10px 20px', borderRadius: 6, border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c', fontWeight: 800, fontSize: '0.85rem', textDecoration: 'none' }}
            >
              Pause Service
            </a>
          )}
        </div>

        {DIVIDER}

        {/* ── Share Your Experience ── */}
        {SECTION_LABEL('Share Your Experience')}
        <CustomerMediaUpload email={email} />

        {DIVIDER}

        {/* ── Review ── */}
        <div style={{ background: 'rgba(125,255,170,0.04)', border: '1px solid rgba(125,255,170,0.15)', borderRadius: 12, padding: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', marginBottom: 8 }}>⭐</div>
          <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: 6 }}>Enjoying GreenGuard?</div>
          <p style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.55)', margin: '0 0 16px', lineHeight: 1.5 }}>
            A Google review helps Austin families find a safer, chemical-free mosquito solution.
          </p>
          <a
            href="https://search.google.com/local/writereview?placeid=ChIJx8wLC4K11wwRbfe7hhZiHXs"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-block', padding: '11px 28px', borderRadius: 8, background: '#7dffaa', color: '#0d1a10', fontWeight: 900, fontSize: '0.9rem', textDecoration: 'none' }}
          >
            Leave a Google Review →
          </a>
        </div>

        <div style={{ marginTop: 24 }}>
          <a href="mailto:admin@greenguard-usa.com" style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.4)' }}>
            Questions? Email admin@greenguard-usa.com
          </a>
        </div>
      </PortalLayout>
    </>
  )
}
