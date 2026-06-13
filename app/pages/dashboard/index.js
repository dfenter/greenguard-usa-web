import { useState, useRef } from 'react'
import Head from 'next/head'
import Image from 'next/image'
import Link from 'next/link'
import PortalLayout from '../../components/PortalLayout'
import CustomerChat from '../../components/CustomerChat'
import { getSessionFromRequest } from '../../lib/auth'
import { getSubscriptions, getInvoices, getCustomer } from '../../lib/stripe'
import { getUpcomingBookingsForEmail, getPastBookingsForEmail } from '../../lib/gcal'
import { findContactByEmail } from '../../lib/hubspot'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.NEXT_PUBLIC_BIZ_EMAIL || 'admin@greenguard-usa.com'

function getTrapImage(systemType, trapCount) {
  const images = JSON.parse(process.env.NEXT_PUBLIC_BIZ_SYSTEM_IMAGES || 'null')
  if (images) {
    const qualified = `${systemType}-${trapCount}`
    return images[qualified] || images[systemType] || null
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

const SYSTEM_LABELS = JSON.parse(process.env.NEXT_PUBLIC_BIZ_SYSTEM_LABELS || JSON.stringify({
  'Biogents-CO2': 'Biogents CO₂ Trap',
  'Biogents-NonCO2': 'Biogents (Non-CO₂)',
  'Mosqitter-Grand': 'Mosqitter Grand',
  Mosqitter: 'Mosqitter Grand',
  'MQ-RENT': 'Mosqitter Grand',
  'Tank-Exchange-Only': 'CO₂ Tank Exchange Service',
  'Biogents-Owned': 'Biogents CO₂ Trap',
  'Mosqitter-Owned': 'Mosqitter Grand',
  'Mosqitter-Rental': 'Mosqitter Grand (Rental)',
}))

export async function getServerSideProps({ req, query }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }

  const { email, stripeCustomerId } = session
  const isAdmin = email === ADMIN_EMAIL
  if (isAdmin && !query.preview) return { redirect: { destination: '/admin/analytics', permanent: false } }

  const _refBase = email.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6)
  let _h = 0
  for (let i = 0; i < email.length; i++) _h = ((_h << 5) - _h) + email.charCodeAt(i)
  const refCode = (_refBase + Math.abs(_h).toString(36).slice(0, 4)).toUpperCase()

  const [upcoming, past, subscriptions, invoices, contact, stripeCustomer, referralContacts] = await Promise.all([
    getUpcomingBookingsForEmail(email, 1).catch(() => []),
    getPastBookingsForEmail(email, 1).catch(() => []),
    stripeCustomerId ? getSubscriptions(stripeCustomerId).catch(() => []) : Promise.resolve([]),
    stripeCustomerId ? getInvoices(stripeCustomerId, 24).catch(() => []) : Promise.resolve([]),
    findContactByEmail(email).catch(() => null),
    stripeCustomerId ? getCustomer(stripeCustomerId).catch(() => null) : Promise.resolve(null),
    fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: 'referred_by', operator: 'EQ', value: refCode }] }],
        properties: ['email', 'customer_status'],
        limit: 100,
      }),
    }).then(r => r.json()).then(d => d.results || []).catch(() => []),
  ])

  const p = contact?.properties || {}
  const m = stripeCustomer?.metadata || {}

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

  const trapCount = parseInt(p.trap_count || m.trap_count || '0', 10) || (inferredSystem ? inferredTrapCount : 0)
  const tankCount = parseInt(p.tank_count || m.tank_count || '0', 10)
  const planType = p.plan_type || m.plan_type || null
  const rawSysType = p.system_type || m.system_type || inferredSystem || null

  let systems = []
  if (rawSysType && typeof rawSysType === 'string' && rawSysType.trim().startsWith('[')) {
    try { systems = JSON.parse(rawSysType).filter((s) => s && s.type) } catch {}
  }
  if (systems.length === 0 && rawSysType) {
    systems = [{ type: rawSysType, count: trapCount || 1, hasTimer: p.has_timer === 'true' && rawSysType === 'Biogents-CO2' }]
  }

  const systemType = systems[0]?.type || null
  const usesC02 = systems.some((s) => s.type === 'Biogents-CO2' || s.type === 'Mosqitter-Grand' || s.type === 'Mosqitter' || s.type === 'MQ-RENT')
  const hasTimer = !!systems[0]?.hasTimer

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
      nextBooking: upcoming[0] ? { startTime: upcoming[0].startTime, title: upcoming[0].title, address: upcoming[0].address, rescheduleUrl: upcoming[0].rescheduleUrl || null } : null,
      prevBooking: past[0] ? { startTime: past[0].startTime, title: past[0].title, address: past[0].address } : null,
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
      usesC02,
      nextRefillDate,
      systems,
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
      referralCount: referralContacts.filter(c =>
        c.properties?.customer_status === 'customer' || c.properties?.customer_status === 'active'
      ).length,
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

function invStatusColor(status) {
  if (status === 'paid') return 'var(--green)'
  if (status === 'open') return 'var(--gold)'
  if (status === 'uncollectible') return '#ff6b6b'
  return 'var(--text-dim)'
}

const DIVIDER = <div style={{ borderTop: '1px solid rgba(var(--border-rgb),0.12)', margin: '32px 0' }} />

const SECTION_LABEL = (text) => (
  <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 18 }}>
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

const SYSTEM_OPTIONS = [
  { value: 'Biogents-CO2',    label: 'Biogents CO₂ Trap' },
  { value: 'Biogents-NonCO2', label: 'Biogents (Non-CO₂)' },
  { value: 'Mosqitter-Grand', label: 'Mosqitter Grand' },
]

function SystemEditor({ initialSystems }) {
  const [editing, setEditing] = useState(false)
  const [systems, setSystems] = useState(() =>
    (initialSystems && initialSystems.length > 0)
      ? initialSystems.map((s) => ({ ...s }))
      : [{ type: 'Biogents-CO2', count: 1, hasTimer: false }]
  )
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  function updateRow(i, patch) { setSystems((rows) => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r)) }
  function addRow() { setSystems((rows) => [...rows, { type: 'Biogents-CO2', count: 1, hasTimer: false }]) }
  function removeRow(i) { setSystems((rows) => rows.filter((_, idx) => idx !== i)) }

  async function save() {
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/api/customer/update-system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systems }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Save failed')
      setMsg('Saved ✓'); setEditing(false)
      setTimeout(() => window.location.reload(), 500)
    } catch (e) { setMsg(e.message) }
    setSaving(false)
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(var(--green-rgb),0.7)', fontSize: '0.75rem', fontWeight: 700, padding: '4px 0', fontFamily: 'Nunito Sans, sans-serif' }}>
        ✎ Edit my system
      </button>
    )
  }

  const inp = { padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(var(--border-rgb),0.3)', background: 'rgba(255,255,255,0.04)', color: 'var(--text)', fontSize: '0.85rem', fontFamily: 'Nunito Sans, sans-serif', outline: 'none' }
  return (
    <div style={{ marginTop: 10, padding: 14, borderRadius: 8, background: 'rgba(var(--green-rgb),0.04)', border: '1px solid rgba(var(--green-rgb),0.18)' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: 10 }}>Edit your system</div>
      <div style={{ display: 'grid', gap: 12 }}>
        {systems.map((row, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px auto', gap: 8, alignItems: 'end', padding: 10, borderRadius: 6, background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(var(--border-rgb),0.15)' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '0.68rem', color: 'rgba(var(--text-rgb),0.5)', fontWeight: 700 }}>
              Trap type
              <select value={row.type} onChange={(e) => updateRow(i, { type: e.target.value })} style={inp}>
                {SYSTEM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '0.68rem', color: 'rgba(var(--text-rgb),0.5)', fontWeight: 700 }}>
              Qty
              <input type="number" min="1" max="20" value={row.count} onChange={(e) => updateRow(i, { count: parseInt(e.target.value, 10) || 1 })} style={{ ...inp, textAlign: 'center' }} />
            </label>
            <button onClick={() => removeRow(i)} disabled={systems.length === 1} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,100,100,0.25)', background: 'transparent', color: systems.length === 1 ? 'rgba(255,100,100,0.25)' : '#ff8080', cursor: systems.length === 1 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.75rem', fontFamily: 'Nunito Sans, sans-serif' }}>Remove</button>
            {row.type === 'Biogents-CO2' && (
              <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'rgba(var(--text-rgb),0.75)', cursor: 'pointer', marginTop: 4 }}>
                <input type="checkbox" checked={!!row.hasTimer} onChange={(e) => updateRow(i, { hasTimer: e.target.checked })} style={{ width: 16, height: 16 }} />
                Timer installed (extends tank life from 20 to 28 days)
              </label>
            )}
          </div>
        ))}
        <button onClick={addRow} style={{ padding: '8px', borderRadius: 6, border: '1px dashed rgba(var(--green-rgb),0.3)', background: 'transparent', color: 'var(--green)', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', fontFamily: 'Nunito Sans, sans-serif' }}>+ Add another system</button>
        <div style={{ fontSize: '0.7rem', color: 'rgba(var(--text-rgb),0.4)', fontStyle: 'italic' }}>
          This updates how we show your tank level only. It will not change your billing or scheduled visits.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={save} disabled={saving} style={{ flex: 1, padding: '9px', borderRadius: 6, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', background: 'var(--green)', color: 'var(--bg-deep)', fontWeight: 900, fontSize: '0.85rem', fontFamily: 'Nunito Sans, sans-serif', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => { setEditing(false); setMsg(null) }} style={{ padding: '9px 16px', borderRadius: 6, border: '1px solid rgba(var(--border-rgb),0.25)', cursor: 'pointer', background: 'transparent', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'Nunito Sans, sans-serif' }}>
            Cancel
          </button>
        </div>
        {msg && <div style={{ fontSize: '0.78rem', color: msg.startsWith('Saved') ? 'var(--green)' : '#ff8080', fontWeight: 700 }}>{msg}</div>}
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

  const inp = { width: '100%', padding: '9px 12px', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 8, background: 'rgba(255,255,255,0.04)', color: 'var(--text)', fontSize: '0.85rem', fontFamily: 'Nunito Sans, sans-serif', outline: 'none', marginBottom: 12 }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <p style={{ fontSize: '0.85rem', color: 'rgba(var(--text-rgb),0.55)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Show us your results or report an issue — upload a photo or short video and we&apos;ll follow up.
      </p>
      <input style={inp} placeholder="Optional caption or description…" value={caption} onChange={(e) => setCaption(e.target.value)} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={handleFile} />
        <button onClick={() => { fileRef.current.accept='image/*'; fileRef.current?.click() }} disabled={uploading} style={{ padding: '10px 18px', borderRadius: 8, border: '1px dashed rgba(var(--green-rgb),0.4)', background: 'transparent', color: 'var(--green)', cursor: uploading ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontFamily: 'Nunito Sans, sans-serif', fontWeight: 700, opacity: uploading ? 0.5 : 1 }}>📷 Photo</button>
        <button onClick={() => { fileRef.current.accept='video/*'; fileRef.current?.click() }} disabled={uploading} style={{ padding: '10px 18px', borderRadius: 8, border: '1px dashed rgba(99,196,255,0.4)', background: 'transparent', color: '#5bc4ff', cursor: uploading ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontFamily: 'Nunito Sans, sans-serif', fontWeight: 700, opacity: uploading ? 0.5 : 1 }}>
          {uploading ? 'Uploading…' : '🎥 Video'}
        </button>
      </div>
      {msg && <p style={{ fontSize: '0.82rem', marginTop: 10, color: msg.includes('failed') || msg.includes('error') ? '#ff8080' : 'var(--green)' }}>{msg}</p>}
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

function ReferralProgram({ email, name, referralCount = 0 }) {
  const [copied, setCopied] = useState(false)
  const refCode = (() => {
    const base = (email || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6)
    let h = 0
    for (let i = 0; i < (email || '').length; i++) h = ((h << 5) - h) + (email || '').charCodeAt(i)
    const suffix = Math.abs(h).toString(36).slice(0, 4).toUpperCase()
    return (base + suffix).toUpperCase()
  })()
  const refUrl = `${process.env.NEXT_PUBLIC_BIZ_WEBSITE || 'https://greenguard-usa.com'}/?ref=${refCode}`

  function copy() {
    navigator.clipboard?.writeText(refUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function share() {
    if (navigator.share) {
      navigator.share({
        title: `${process.env.NEXT_PUBLIC_BIZ_NAME || 'GreenGuard USA'} — Chemical-free mosquito control`,
        text: `${name?.split(' ')[0] || 'I'} love ${process.env.NEXT_PUBLIC_BIZ_NAME || 'GreenGuard'}'s service. Use my link and we both get $25 off!`,
        url: refUrl,
      }).catch(() => {})
    } else {
      copy()
    }
  }

  return (
    <>
      <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 10 }}>
        Refer a Neighbor · Earn $25
      </div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '2rem' }}>🎁</div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontWeight: 900, fontSize: '1.05rem', marginBottom: 4 }}>
              Get $25 for every neighbor who signs up
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
              Share your link with friends. When they become a customer, you both get $25 off your next invoice.
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <input
                type="text"
                value={refUrl}
                readOnly
                onFocus={(e) => e.target.select()}
                style={{ flex: '1 1 220px', padding: '10px 12px', borderRadius: 6, border: '1px solid rgba(var(--border-rgb),0.25)', background: 'rgba(255,255,255,0.04)', color: 'var(--text)', fontSize: '0.82rem', fontFamily: 'monospace' }}
              />
              <button
                onClick={copy}
                style={{ padding: '10px 20px', borderRadius: 6, border: 'none', background: copied ? 'var(--green)' : 'var(--gold)', color: 'var(--bg-deep)', fontWeight: 900, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'Nunito Sans, sans-serif' }}
              >
                {copied ? '✓ Copied' : 'Copy Link'}
              </button>
              <button
                onClick={share}
                style={{ padding: '10px 20px', borderRadius: 6, border: '1px solid rgba(var(--border-rgb),0.3)', background: 'transparent', color: 'var(--green-muted)', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'Nunito Sans, sans-serif' }}
              >
                Share
              </button>
            </div>

            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: '0.82rem' }}>
              <div>
                <span style={{ color: 'rgba(var(--text-rgb),0.4)' }}>Your code:</span>{' '}
                <strong style={{ color: 'var(--gold)' }}>{refCode}</strong>
              </div>
              <div>
                <span style={{ color: 'rgba(var(--text-rgb),0.4)' }}>Referrals:</span>{' '}
                <strong style={{ color: referralCount > 0 ? 'var(--green)' : 'var(--text)' }}>{referralCount}</strong>
              </div>
              <div>
                <span style={{ color: 'rgba(var(--text-rgb),0.4)' }}>Earned:</span>{' '}
                <strong style={{ color: referralCount > 0 ? 'var(--green)' : 'var(--text-muted)' }}>${referralCount * 25}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default function CustomerOverview({
  email, name,
  nextBooking, prevBooking,
  systemType, trapCount, tankCount, hasTimer, customerType, installDate, trapImage, systemLabel,
  usesC02, nextRefillDate, systemFromAppointment, lastAppointmentTitle, systems = [],
  subscription, invoices, referralCount = 0,
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
      <Head><title>My Account · {process.env.NEXT_PUBLIC_BIZ_NAME || 'GreenGuard'}</title></Head>
      <PortalLayout isAdmin={false}>
        {/* ── Header ── */}
        <div style={{ marginBottom: 36 }}>
          <span className="tag">My Account</span>
          <h1 style={{ fontSize: 'clamp(1.5rem,3vw,2rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
            {name ? `Welcome back, ${name.split(' ')[0]}` : 'Welcome back'}
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'rgba(var(--text-rgb),0.45)', margin: 0 }}>{email}</p>
        </div>

        {/* ── Visits ── */}
        {SECTION_LABEL('Schedule')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, marginBottom: 20 }}>
          <div className="card" style={{ opacity: 0.7 }}>
            <span className="tag">Previous Visit</span>
            {prevBooking ? (
              <>
                <div style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 4 }}>{fmtDate(prevBooking.startTime)}</div>
                <div style={{ fontSize: '0.82rem', color: 'rgba(var(--text-rgb),0.55)' }}>{prevBooking.title}</div>
                {prevBooking.address && <div style={{ fontSize: '0.78rem', color: 'rgba(var(--text-rgb),0.35)', marginTop: 4 }}>{prevBooking.address}</div>}
              </>
            ) : (
              <div style={{ fontSize: '0.88rem', color: 'rgba(var(--text-rgb),0.4)' }}>No previous visits on record</div>
            )}
          </div>

          <div className="card">
            <span className="tag">Next Visit</span>
            {nextBooking ? (
              <>
                <div style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 4, color: 'var(--green)' }}>{fmtDate(nextBooking.startTime)}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{nextBooking.title}</div>
                {nextBooking.address && <div style={{ fontSize: '0.78rem', color: 'rgba(var(--text-rgb),0.4)', marginTop: 4 }}>{nextBooking.address}</div>}
              </>
            ) : (
              <div style={{ fontSize: '0.88rem', color: 'rgba(var(--text-rgb),0.4)' }}>No upcoming visits scheduled</div>
            )}
          </div>
        </div>

        <a
          href={`mailto:${process.env.NEXT_PUBLIC_BIZ_EMAIL || 'admin@greenguard-usa.com'}?subject=Service Visit Request&body=Hi ${process.env.NEXT_PUBLIC_BIZ_NAME || 'GreenGuard'} team,%0A%0AI'd like to request a service visit.%0A%0AAccount email: ${encodeURIComponent(email)}`}
          style={{
            display: 'inline-block', marginBottom: 8,
            padding: '10px 22px', borderRadius: 6,
            border: '1px solid rgba(var(--border-rgb),0.35)',
            color: 'var(--green-muted)', fontWeight: 800, fontSize: '0.85rem',
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
                alt={systemLabel || 'Your system'}
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
              <div style={{ fontSize: '0.72rem', color: 'rgba(var(--text-rgb),0.4)', marginBottom: 10, lineHeight: 1.4 }}>
                Based on your last appointment: {lastAppointmentTitle}
              </div>
            )}
            {customerType && (
              <div style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, background: 'rgba(var(--green-rgb),0.1)', color: 'var(--green)', fontSize: '0.72rem', fontWeight: 800, marginBottom: 14 }}>
                {customerType === 'rental' ? 'Rental' : 'Owned'}
              </div>
            )}
            {trapCount > 0 && (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                {trapCount} trap{trapCount !== 1 ? 's' : ''} active
              </div>
            )}
            {hasTimer && (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>Timer installed</div>
            )}
            {installDate && (
              <div style={{ fontSize: '0.82rem', color: 'rgba(var(--text-rgb),0.4)', marginTop: 4 }}>
                Service since {new Date(installDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </div>
            )}
            {systems.length > 1 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(var(--border-rgb),0.12)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text)' }}>Your systems:</strong> {systems.map((s) => `${s.count}× ${SYSTEM_LABELS[s.type] || s.type}${s.type === 'Biogents-CO2' && s.hasTimer ? ' (timer)' : ''}`).join(' · ')}
              </div>
            )}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(var(--border-rgb),0.12)' }}>
              <SystemEditor initialSystems={systems} />
            </div>
          </div>
        </div>
        <Link
          href="/dashboard/upgrade"
          style={{
            display: 'inline-block', marginBottom: 8,
            padding: '10px 22px', borderRadius: 6,
            border: '1px solid var(--border-gold)',
            color: 'var(--gold)', fontWeight: 800, fontSize: '0.85rem',
            textDecoration: 'none',
          }}
        >
          Upgrade My Service →
        </Link>

        {/* ── Current Tank Levels ── */}
        {(() => {
          const co2Systems = systems.filter((s) =>
            s.type === 'Biogents-CO2' || s.type === 'Mosqitter-Grand' || s.type === 'Mosqitter' || s.type === 'MQ-RENT'
          )
          if (co2Systems.length === 0) return null
          const baseDate = prevBooking?.startTime ? new Date(prevBooking.startTime) : (installDate ? new Date(installDate) : null)
          if (!baseDate) return null
          const daysSince = Math.max(0, Math.floor((Date.now() - baseDate.getTime()) / 86400000))
          return (
            <>
              {DIVIDER}
              {SECTION_LABEL(co2Systems.length > 1 ? 'CO₂ Tank Levels (Estimated)' : 'CO₂ Tank Level (Estimated)')}
              <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', maxWidth: 800 }}>
                {co2Systems.map((sys, i) => {
                  const lifetime = sys.type === 'Biogents-CO2' && !sys.hasTimer ? 20 : 28
                  const remaining = Math.max(0, lifetime - daysSince)
                  const pct = Math.max(0, Math.min(100, Math.round((remaining / lifetime) * 100)))
                  const color = pct > 50 ? 'var(--green)' : pct > 20 ? 'var(--gold)' : '#ff8080'
                  const label = SYSTEM_LABELS[sys.type] || sys.type
                  const lifetimeNote = sys.type === 'Biogents-CO2'
                    ? (sys.hasTimer ? 'with timer · 28-day tank' : 'without timer · 20-day tank')
                    : '28-day tank'
                  return (
                    <div key={i} className="card" style={{ marginBottom: 0 }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'rgba(var(--text-rgb),0.7)', marginBottom: 6 }}>
                        {sys.count}× {label}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                        <span style={{ fontSize: '2.2rem', fontWeight: 900, lineHeight: 1, color }}>{pct}%</span>
                        <span style={{ fontSize: '0.8rem', color: 'rgba(var(--text-rgb),0.55)', fontWeight: 700 }}>
                          ~{remaining} day{remaining !== 1 ? 's' : ''} left
                        </span>
                      </div>
                      <div style={{ height: 8, borderRadius: 5, background: 'rgba(var(--text-rgb),0.08)', overflow: 'hidden', marginBottom: 8 }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.4s ease' }} />
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'rgba(var(--text-rgb),0.45)' }}>{lifetimeNote}</div>
                      {nextRefillDate && (
                        <div style={{ marginTop: 6, fontSize: '0.72rem', color: 'rgba(var(--text-rgb),0.5)' }}>
                          Next delivery: <strong style={{ color: pct <= 20 ? '#ff8080' : 'rgba(var(--text-rgb),0.75)' }}>{fmtDate(nextRefillDate)}</strong>
                        </div>
                      )}
                      {pct <= 20 && (
                        <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 5, background: 'rgba(255,128,128,0.08)', border: '1px solid rgba(255,128,128,0.25)', fontSize: '0.76rem', color: '#ff8080', fontWeight: 700 }}>
                          Time for a refill
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'rgba(var(--text-rgb),0.4)', marginTop: 10 }}>
                Estimate based on usage and time since last service ({fmtDate(baseDate.toISOString())}). Actual level may vary.
              </div>
            </>
          )
        })()}

        {DIVIDER}

        {/* ── Billing ── */}
        {SECTION_LABEL('Billing')}

        {hasOpenInvoice && (() => {
          const openInvoices = invoices.filter(i => i.status === 'open')
          const totalDue = openInvoices.reduce((s, i) => s + (i.amountDue || 0), 0)
          const firstOpen = openInvoices[0]
          return (
            <div style={{
              background: 'rgba(var(--gold-rgb),0.1)', border: '1px solid rgba(var(--gold-rgb),0.35)',
              borderRadius: 8, padding: '16px 20px', marginBottom: 20,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              flexWrap: 'wrap', gap: 12,
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 4 }}>
                  Payment Due
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ffb060' }}>
                  {fmtAmount(totalDue)}
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {openInvoices.length} unpaid invoice{openInvoices.length > 1 ? 's' : ''}
                </div>
              </div>
              {firstOpen?.hostedUrl && (
                <a href={firstOpen.hostedUrl} target="_blank" rel="noopener noreferrer" style={{
                  padding: '12px 24px', borderRadius: 6, background: 'var(--green)', color: 'var(--bg-deep)',
                  fontWeight: 900, fontSize: '0.95rem', textDecoration: 'none',
                }}>
                  Pay Now →
                </a>
              )}
            </div>
          )
        })()}

        {subscription && (
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
            <div>
              <span className="tag">Active Plan</span>
              <div style={{ fontWeight: 900, fontSize: '1.2rem' }}>{fmtAmount(subscription.amount)}/{subscription.interval}</div>
              <div style={{ fontSize: '0.82rem', color: 'rgba(var(--text-rgb),0.5)', marginTop: 2 }}>
                {subscription.label && `${subscription.label} · `}Next invoice: <strong style={{ color: 'rgba(var(--text-rgb),0.75)' }}>{fmtDate(new Date(subscription.currentPeriodEnd * 1000).toISOString())}</strong>
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
          <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(var(--text-rgb),0.4)' }}>
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
                  background: dateRange === r.months ? 'rgba(var(--gold-rgb),0.2)' : 'rgba(255,255,255,0.04)',
                  color: dateRange === r.months ? 'var(--gold)' : 'rgba(var(--text-rgb),0.45)',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {filteredInvoices.length === 0 ? (
          <p style={{ color: 'rgba(var(--text-rgb),0.4)', fontSize: '0.88rem' }}>No invoices in this period.</p>
        ) : (
          filteredInvoices.map((inv) => (
            <div key={inv.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                <div style={{ minWidth: 90 }}>
                  <div style={{ fontSize: '0.78rem', color: 'rgba(var(--text-rgb),0.4)' }}>{fmtDateShort(inv.created)}</div>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{inv.number}</div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: invStatusColor(inv.status), textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {inv.status}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <span style={{ fontWeight: 800 }}>
                  {fmtAmount(inv.status === 'open' ? inv.amountDue : (inv.amountPaid || inv.amountDue))}
                </span>
                {inv.hostedUrl && inv.status === 'open' && (
                  <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" style={{ padding: '7px 14px', borderRadius: 4, background: 'var(--green)', color: 'var(--bg-deep)', fontWeight: 800, fontSize: '0.78rem', textDecoration: 'none' }}>
                    Pay Now
                  </a>
                )}
                {inv.hostedUrl && inv.status !== 'open' && (
                  <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" className="btn-outline" style={{ fontSize: '0.78rem', padding: '7px 14px' }}>
                    View
                  </a>
                )}
                {inv.pdfUrl && (
                  <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.78rem', color: 'var(--green-muted)', fontWeight: 700 }}>
                    PDF
                  </a>
                )}
              </div>
            </div>
          ))
        )}

        {/* ── Reschedule / Pause ── */}
        {(nextBooking || subscription) && (
          <>
            {DIVIDER}
            {SECTION_LABEL('Service Options')}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
              {nextBooking && (
                <a
                  href={nextBooking.rescheduleUrl || `mailto:${process.env.NEXT_PUBLIC_BIZ_EMAIL || 'admin@greenguard-usa.com'}?subject=Reschedule Request&body=Hi, I'd like to reschedule my upcoming visit on ${fmtDate(nextBooking.startTime)}.%0A%0AAccount: ${encodeURIComponent(email)}`}
                  target={nextBooking.rescheduleUrl ? '_blank' : undefined}
                  rel={nextBooking.rescheduleUrl ? 'noopener noreferrer' : undefined}
                  style={{ padding: '10px 20px', borderRadius: 6, border: '1px solid rgba(var(--border-rgb),0.3)', color: 'var(--green-muted)', fontWeight: 800, fontSize: '0.85rem', textDecoration: 'none' }}
                >
                  Reschedule Upcoming Visit
                </a>
              )}
              {subscription && (
                <a
                  href={`mailto:${process.env.NEXT_PUBLIC_BIZ_EMAIL || 'admin@greenguard-usa.com'}?subject=Service Pause Request&body=Hi, I'd like to pause my ${process.env.NEXT_PUBLIC_BIZ_NAME || 'GreenGuard'} service temporarily.%0A%0AAccount: ${encodeURIComponent(email)}`}
                  style={{ padding: '10px 20px', borderRadius: 6, border: '1px solid rgba(var(--gold-rgb),0.3)', color: 'var(--gold)', fontWeight: 800, fontSize: '0.85rem', textDecoration: 'none' }}
                >
                  Pause Service
                </a>
              )}
            </div>
          </>
        )}

        {DIVIDER}

        {/* ── Referral Program ── */}
        <ReferralProgram email={email} name={name} referralCount={referralCount} />

        {DIVIDER}

        {/* ── Share Your Experience ── */}
        {SECTION_LABEL('Share Your Experience')}
        <CustomerMediaUpload email={email} />

        {/* ── Review (only shown when configured) ── */}
        {process.env.NEXT_PUBLIC_BIZ_REVIEW_URL && (
          <>
            {DIVIDER}
            <div style={{ background: 'rgba(var(--green-rgb),0.04)', border: '1px solid rgba(var(--green-rgb),0.15)', borderRadius: 12, padding: '24px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', marginBottom: 8 }}>⭐</div>
              <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: 6 }}>
                Enjoying {process.env.NEXT_PUBLIC_BIZ_NAME || 'our service'}?
              </div>
              <p style={{ fontSize: '0.85rem', color: 'rgba(var(--text-rgb),0.55)', margin: '0 0 16px', lineHeight: 1.5 }}>
                A quick Google review helps neighbors find a trusted local service.
              </p>
              <a
                href={process.env.NEXT_PUBLIC_BIZ_REVIEW_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-block', padding: '11px 28px', borderRadius: 8, background: 'var(--green)', color: 'var(--bg-deep)', fontWeight: 900, fontSize: '0.9rem', textDecoration: 'none' }}
              >
                Leave a Google Review →
              </a>
            </div>
          </>
        )}

        <div style={{ marginTop: 24 }}>
          <a href={`mailto:${process.env.NEXT_PUBLIC_BIZ_EMAIL || 'admin@greenguard-usa.com'}`} style={{ fontSize: '0.82rem', color: 'rgba(var(--text-rgb),0.4)' }}>
            Questions? Email {process.env.NEXT_PUBLIC_BIZ_EMAIL || 'admin@greenguard-usa.com'}
          </a>
        </div>
      </PortalLayout>
      <CustomerChat />
    </>
  )
}
