import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { getTodaysBookings, getBookingsForDate } from '../../lib/gcal'
import path from 'path'
import fs from 'fs'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export async function getServerSideProps({ req, query }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (session.email !== ADMIN_EMAIL) return { redirect: { destination: '/dashboard', permanent: false } }

  const tz = process.env.CALENDAR_TIMEZONE || 'America/Chicago'
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const selectedDate = query.date || today

  let stops = []
  try {
    const dataDir = path.join(process.cwd(), 'public', 'data')
    const files = fs.readdirSync(dataDir).filter((f) => f.startsWith('route_plan_') && f.endsWith('.json'))
    if (files.length > 0) {
      files.sort().reverse()
      const plan = JSON.parse(fs.readFileSync(path.join(dataDir, files[0]), 'utf8'))
      const dayPlan = (plan.days || []).find((d) => d.date === selectedDate)
      if (dayPlan?.stops?.length) {
        stops = dayPlan.stops.map((s) => ({
          customerName: s.customer_name || s.name || 'Customer',
          address: s.address || '', email: s.email || '',
          startTime: s.scheduled_time || null, durationMin: s.duration_min || null,
          propertySize: s.property_size || '',
        }))
      }
    }
  } catch {}

  if (stops.length === 0) {
    try {
      const bookings = selectedDate === today ? await getTodaysBookings() : await getBookingsForDate(selectedDate)
      stops = bookings.map((b) => ({
        customerName: b.title || 'Customer', address: b.address || '',
        email: b.email || '', startTime: b.startTime, durationMin: null, propertySize: b.propertySize || '',
      }))
    } catch {}
  }

  // Build last-3-days + today date options
  const availableDates = []
  for (let i = -3; i <= 3; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    availableDates.push(d.toLocaleDateString('en-CA', { timeZone: tz }))
  }

  return { props: { stops, today, selectedDate, availableDates } }
}

// ── Service Catalog ────────────────────────────────────────────────────────────
// Every item has: label, sku, price (null = hardware/no charge), section

const SERVICES = [
  { label: 'Biogents CO₂ Service — 1 Trap',  sku: 'BG1',      price: 159.99 },
  { label: 'Biogents CO₂ Service — 2 Traps', sku: 'BG2',      price: 266.99 },
  { label: 'Biogents CO₂ Service — 3 Traps', sku: 'BG3',      price: 399.99 },
  { label: 'Mosqitter Grand Rental',          sku: 'MQ-RENT',  price: 299.99 },
  { label: 'Mosqitter Grand Service',         sku: 'MQ-SVC',   price: 129.99 },
  { label: 'Mosqitter Installation',          sku: 'MQ-INST',  price: 199.99 },
  { label: 'Mosqitter Troubleshoot',          sku: 'MQ-TSHOOT',price:  79.99 },
  { label: 'CO₂ Tank Exchange — 1 Tank',     sku: 'TANK1',    price:  89.98 },
  { label: 'CO₂ Tank Exchange — 2 Tanks',    sku: 'TANK2',    price: 139.97 },
  { label: 'CO₂ Tank Exchange — 3 Tanks',    sku: 'TANK3',    price: 189.96 },
  { label: 'CO₂ Tank Exchange — 4 Tanks',    sku: 'TANK4',    price: 239.95 },
  { label: 'CO₂ Tank Exchange — 6 Tanks',    sku: 'TANK6',    price: 339.93 },
  { label: 'CO₂ Tank Exchange — 10 Tanks',   sku: 'TANK10',   price: 539.89 },
  { label: 'GreenGuard Barrier Treatment',    sku: 'BARRIER',  price:  49.99 },
  { label: 'Free Property Assessment',        sku: 'ASSESS',   price:   0.00 },
]

const EQUIPMENT = [
  { label: 'Trap Installation',                        sku: 'TRAP-INSTALL',  price:  80.00 },
  { label: 'Timer Installation',                        sku: 'TIMER-INSTALL', price:  29.99 },
  { label: 'Trap Maintenance (1 trap)',                 sku: 'TRAP-MAINT-1',  price:  29.99 },
  { label: 'Trap Maintenance (2 traps)',                sku: 'TRAP-MAINT-2',  price:  49.99 },
  { label: 'Biogents Tank Hookup & Trap Maintenance',  sku: 'OWN-BG',        price:  10.00 },
  { label: 'Mosqitter Tank Hookup & Trap Maintenance', sku: 'OWN-MQ',        price:  30.00 },
  { label: 'System Rental',                            sku: null,            price:  null  },
  { label: 'Replacement Catch Container',              sku: null,            price:  null  },
]

const ADDONS = [
  { label: 'CO₂ Tank Rental',              sku: 'CO2-ADDON',     price: 124.99 },
  { label: 'BG Sweetscent',                sku: 'BG-SWEETSCENT', price:  18.99 },
  { label: 'Bait Pack',                    sku: 'BAIT',          price:  10.00 },
  { label: 'Weekend Surcharge',            sku: 'WKD-SURCH',     price:  25.00 },
  { label: '50ft Extension Cord',          sku: null,            price:  null  },
  { label: '100ft Extension Cord',         sku: null,            price:  null  },
  { label: 'Splitter',                     sku: null,            price:  null  },
  { label: 'Biogents Power Supply',        sku: null,            price:  null  },
  { label: 'Biogents PS 30ft Ext Cord',    sku: null,            price:  null  },
  { label: 'Biogents Trap Net',            sku: null,            price:  null  },
  { label: 'Biogents Funnel',              sku: null,            price:  null  },
  { label: 'CO₂ Regulator',               sku: null,            price:  null  },
  { label: 'CO₂ Tank Washer',             sku: null,            price:  null  },
  { label: '9V Batteries',               sku: null,            price:  null  },
  { label: 'Larvicide Tablet',            sku: null,            price:  null  },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt$(n) { return n == null ? '—' : `$${n.toFixed(2)}` }
function fmtTime(iso) { return iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null }
function nowStr() { return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) }

function sectionTotal(catalog, qtys) {
  return catalog.reduce((sum, item) => {
    const q = qtys[item.label] || 0
    return sum + (item.price && q > 0 ? item.price * q : 0)
  }, 0)
}

function buildLineItems(catalog, qtys) {
  return catalog
    .filter((item) => (qtys[item.label] || 0) > 0)
    .map((item) => ({ label: item.label, sku: item.sku, price: item.price, qty: qtys[item.label] }))
}

// ── Qty row ────────────────────────────────────────────────────────────────────

function QtyRow({ item, qty, onChange, disabled }) {
  const active = qty > 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(122,171,130,0.06)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.88rem', fontWeight: active ? 700 : 500, color: active ? '#d4e6ca' : 'rgba(212,230,202,0.55)' }}>{item.label}</div>
        <div style={{ fontSize: '0.7rem', color: 'rgba(212,230,202,0.3)', marginTop: 1 }}>
          {item.sku && <span style={{ marginRight: 8, color: 'rgba(201,168,76,0.5)' }}>{item.sku}</span>}
          <span style={{ color: item.price ? '#7dffaa' : 'rgba(212,230,202,0.25)' }}>{item.price ? fmt$(item.price) + '/unit' : 'no charge'}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {active && !disabled && (
          <button onClick={() => onChange(Math.max(0, qty - 1))}
            style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(122,171,130,0.3)', background: 'transparent', color: '#d4e6ca', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, fontFamily: 'Nunito Sans, sans-serif' }}>−</button>
        )}
        {active && (
          <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 900, fontSize: '0.95rem', color: '#7dffaa' }}>{qty}</span>
        )}
        {!disabled && (
          <button onClick={() => onChange(qty + 1)}
            style={{ width: 30, height: 30, borderRadius: '50%', border: `1px solid ${active ? 'rgba(125,255,170,0.4)' : 'rgba(122,171,130,0.2)'}`, background: active ? 'rgba(125,255,170,0.08)' : 'transparent', color: active ? '#7dffaa' : 'rgba(212,230,202,0.4)', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, fontFamily: 'Nunito Sans, sans-serif' }}>+</button>
        )}
        {disabled && active && (
          <span style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7dffaa', fontWeight: 900 }}>{qty}</span>
        )}
      </div>
    </div>
  )
}

// ── Plain section (Services) ───────────────────────────────────────────────────

function CatalogSection({ title, catalog, qtys, onChange, disabled, total }) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ marginBottom: 16 }}>
      <div onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '10px 0', borderBottom: '1px solid rgba(122,171,130,0.12)', marginBottom: open ? 8 : 0 }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c9a84c' }}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {total > 0 && <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#7dffaa' }}>{fmt$(total)}</span>}
          <span style={{ fontSize: '0.75rem', color: 'rgba(212,230,202,0.35)' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && catalog.map((item) => (
        <QtyRow key={item.label} item={item} qty={qtys[item.label] || 0}
          onChange={(n) => onChange(item.label, n)} disabled={disabled} />
      ))}
    </div>
  )
}

// ── Multi-select dropdown (Equipment & Add-ons) ────────────────────────────────

function MultiSelectSection({ title, catalog, qtys, onChange, disabled, total }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selectedItems = catalog.filter((item) => (qtys[item.label] || 0) > 0)

  useEffect(() => {
    if (!open) return
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler) }
  }, [open])

  return (
    <div ref={ref} style={{ marginBottom: 16, position: 'relative' }}>
      {/* Section header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(122,171,130,0.12)', marginBottom: 8 }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c9a84c' }}>{title}</span>
        {total > 0 && <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#7dffaa' }}>{fmt$(total)}</span>}
      </div>

      {/* Selected items summary with qty controls */}
      {selectedItems.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {selectedItems.map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', marginBottom: 4, borderRadius: 8, background: 'rgba(125,255,170,0.06)', border: '1px solid rgba(125,255,170,0.15)' }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#d4e6ca' }}>{item.label}</span>
                {item.sku && <span style={{ marginLeft: 8, fontSize: '0.68rem', color: 'rgba(201,168,76,0.5)' }}>{item.sku}</span>}
                {item.price && <span style={{ marginLeft: 6, fontSize: '0.75rem', color: '#7dffaa' }}>{fmt$(item.price * (qtys[item.label] || 1))}</span>}
              </div>
              {!disabled && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => onChange(item.label, Math.max(0, (qtys[item.label] || 0) - 1))}
                    style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(122,171,130,0.3)', background: 'transparent', color: '#d4e6ca', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, fontFamily: 'Nunito Sans, sans-serif' }}>−</button>
                  <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 900, color: '#7dffaa' }}>{qtys[item.label] || 0}</span>
                  <button onClick={() => onChange(item.label, (qtys[item.label] || 0) + 1)}
                    style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(125,255,170,0.3)', background: 'rgba(125,255,170,0.08)', color: '#7dffaa', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, fontFamily: 'Nunito Sans, sans-serif' }}>+</button>
                </div>
              )}
              {disabled && <span style={{ fontWeight: 900, color: '#7dffaa' }}>×{qtys[item.label]}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Dropdown trigger */}
      {!disabled && (
        <button onClick={() => setOpen((o) => !o)}
          style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px dashed rgba(122,171,130,0.3)', background: 'transparent', color: 'rgba(212,230,202,0.55)', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', fontFamily: 'Nunito Sans, sans-serif', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{selectedItems.length > 0 ? `+ Add more ${title.toLowerCase()}` : `Select ${title.toLowerCase()}…`}</span>
          <span style={{ fontSize: '0.7rem' }}>{open ? '▲' : '▼'}</span>
        </button>
      )}

      {/* Dropdown panel */}
      {open && (
        <div style={{ position: 'absolute', left: 0, right: 0, zIndex: 50, background: '#0d1a10', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 10, marginTop: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', maxHeight: 360, overflowY: 'auto' }}>
          <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid rgba(122,171,130,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'rgba(212,230,202,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{title}</span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(212,230,202,0.45)', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, fontFamily: 'Nunito Sans, sans-serif' }}>×</button>
          </div>
          {catalog.map((item) => {
            const qty = qtys[item.label] || 0
            const selected = qty > 0
            return (
              <div key={item.label}
                onClick={() => !selected && onChange(item.label, 1)}
                style={{ display: 'flex', alignItems: 'center', padding: '11px 14px', borderBottom: '1px solid rgba(122,171,130,0.06)', cursor: selected ? 'default' : 'pointer', background: selected ? 'rgba(125,255,170,0.05)' : 'transparent' }}>
                <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${selected ? '#7dffaa' : 'rgba(122,171,130,0.3)'}`, background: selected ? '#7dffaa' : 'transparent', marginRight: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#0d1a10', fontWeight: 900 }}>
                  {selected ? '✓' : ''}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: selected ? 700 : 500, color: selected ? '#d4e6ca' : 'rgba(212,230,202,0.65)' }}>{item.label}</div>
                  <div style={{ fontSize: '0.7rem', color: 'rgba(212,230,202,0.3)', marginTop: 1 }}>
                    {item.sku && <span style={{ marginRight: 8, color: 'rgba(201,168,76,0.5)' }}>{item.sku}</span>}
                    <span style={{ color: item.price ? '#7dffaa' : 'rgba(212,230,202,0.2)' }}>{item.price ? fmt$(item.price) : 'no charge'}</span>
                  </div>
                </div>
                {selected && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => onChange(item.label, Math.max(0, qty - 1))}
                      style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(122,171,130,0.3)', background: 'transparent', color: '#d4e6ca', cursor: 'pointer', fontSize: '0.95rem', lineHeight: 1, fontFamily: 'Nunito Sans, sans-serif' }}>−</button>
                    <span style={{ minWidth: 16, textAlign: 'center', fontWeight: 900, color: '#7dffaa', fontSize: '0.9rem' }}>{qty}</span>
                    <button onClick={() => onChange(item.label, qty + 1)}
                      style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(125,255,170,0.3)', background: 'rgba(125,255,170,0.08)', color: '#7dffaa', cursor: 'pointer', fontSize: '0.95rem', lineHeight: 1, fontFamily: 'Nunito Sans, sans-serif' }}>+</button>
                  </div>
                )}
              </div>
            )
          })}
          <div style={{ padding: '10px 14px', textAlign: 'center' }}>
            <button onClick={() => setOpen(false)}
              style={{ padding: '8px 24px', borderRadius: 6, border: 'none', background: '#7dffaa', color: '#0d1a10', fontWeight: 900, fontSize: '0.85rem', fontFamily: 'Nunito Sans, sans-serif', cursor: 'pointer' }}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Email modal ────────────────────────────────────────────────────────────────

function EmailModal({ stop, lineItems, grandTotal, onSend, onSkip }) {
  const defaultMsg = [
    `Hi ${stop.customerName ? stop.customerName.split(' ')[0] : 'there'},`,
    '',
    `Your GreenGuard service visit is complete. Here\'s a summary:`,
    '',
    ...lineItems.filter((l) => l.qty > 0).map((l) => `• ${l.label}${l.qty > 1 ? ` ×${l.qty}` : ''}${l.price ? ` — ${fmt$(l.price * l.qty)}` : ''}`),
    '',
    `Total: ${fmt$(grandTotal)}`,
    '',
    'An invoice will be sent separately. Thank you for being a GreenGuard customer!',
    '',
    '— The GreenGuard Team',
  ].join('\n')

  const [msg, setMsg] = useState(defaultMsg)
  const inp = { width: '100%', padding: '10px 12px', boxSizing: 'border-box', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 8, background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.88rem', fontFamily: 'Nunito Sans, sans-serif', outline: 'none', resize: 'vertical' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#0d1a10', border: '1px solid rgba(122,171,130,0.3)', borderRadius: 12, padding: 24, maxWidth: 500, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: '1rem' }}>Send Post-Visit Email</h3>
        <p style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.45)', margin: '0 0 14px' }}>To: <strong>{stop.email || '(no email)'}</strong></p>
        <textarea rows={14} style={inp} value={msg} onChange={(e) => setMsg(e.target.value)} />
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button onClick={() => onSend(msg)} style={{ flex: 1, padding: 11, borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 900, fontSize: '0.9rem', fontFamily: 'Nunito Sans, sans-serif', background: '#7dffaa', color: '#0d1a10' }}>
            Send Email
          </button>
          <button onClick={onSkip} style={{ padding: '11px 18px', borderRadius: 8, border: '1px solid rgba(122,171,130,0.25)', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'Nunito Sans, sans-serif', background: 'transparent', color: 'rgba(212,230,202,0.55)' }}>
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Stop card ──────────────────────────────────────────────────────────────────

function StopCard({ stop, idx, state, onUpdate, fileInputRef }) {
  const isDone = state.status === 'done'
  const isActive = state.status === 'active'

  const svcTotal = sectionTotal(SERVICES, state.serviceQtys)
  const eqTotal  = sectionTotal(EQUIPMENT, state.equipQtys)
  const addTotal = sectionTotal(ADDONS, state.addonQtys)
  const grand    = svcTotal + eqTotal + addTotal

  const allLineItems = [
    ...buildLineItems(SERVICES, state.serviceQtys),
    ...buildLineItems(EQUIPMENT, state.equipQtys),
    ...buildLineItems(ADDONS, state.addonQtys),
  ]

  function handlePhoto(e) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => onUpdate({ photoUrl: ev.target.result })
    reader.readAsDataURL(file)
  }

  async function handleComplete() {
    if (allLineItems.length === 0) {
      if (!window.confirm('No items selected — complete with $0 total?')) return
    }
    onUpdate({ showEmailModal: true })
  }

  async function finishStop(customMsg) {
    onUpdate({ showEmailModal: false, submitting: true, error: null })
    try {
      // 1. Generate Stripe draft invoice
      let invoiceId = null, invoiceUrl = null
      if (stop.email && allLineItems.some((l) => l.price && l.price > 0)) {
        const invRes = await fetch('/api/admin/generate-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerEmail: stop.email, customerName: stop.customerName, lineItems: allLineItems }),
        })
        if (invRes.ok) {
          const invData = await invRes.json()
          invoiceId = invData.invoiceId
          invoiceUrl = invData.invoiceUrl
        }
      }

      // 2. Save visit log to HubSpot
      const visitData = {
        date: state.date,
        customerName: stop.customerName,
        address: stop.address,
        checkIn: state.checkIn,
        checkOut: nowStr(),
        serviceQtys: state.serviceQtys,
        equipQtys: state.equipQtys,
        addonQtys: state.addonQtys,
        svcTotal, eqTotal, addTotal, grandTotal: grand,
        notes: state.notes,
        photoTaken: !!state.photoUrl,
        invoiceId,
      }
      if (stop.email) {
        await fetch('/api/admin/visit-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: stop.email, visitData }),
        })
      }

      // 3. Send post-visit email
      if (customMsg && stop.email) {
        await fetch('/api/admin/complete-stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: stop.email, customerName: stop.customerName, address: stop.address, checkIn: state.checkIn, checkOut: visitData.checkOut, serviceTypes: Object.keys(state.serviceQtys).filter((k) => state.serviceQtys[k] > 0), notes: state.notes, photoTaken: !!state.photoUrl, customEmailMessage: customMsg }),
        })
      }

      onUpdate({ status: 'done', checkOut: visitData.checkOut, invoiceId, invoiceUrl, grandTotal: grand, submitting: false })
    } catch (err) {
      onUpdate({ submitting: false, error: err.message, showEmailModal: false })
    }
  }

  const card = {
    background: 'rgba(255,255,255,0.03)',
    border: `1px solid ${isDone ? 'rgba(125,255,170,0.2)' : isActive ? 'rgba(201,168,76,0.3)' : 'rgba(122,171,130,0.12)'}`,
    borderRadius: 12, padding: 20, marginBottom: 14, opacity: isDone ? 0.7 : 1,
  }
  const inp = { width: '100%', padding: '9px 12px', boxSizing: 'border-box', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 8, background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.88rem', fontFamily: 'Nunito Sans, sans-serif', outline: 'none' }

  return (
    <>
      {state.showEmailModal && (
        <EmailModal stop={stop} lineItems={allLineItems} grandTotal={grand}
          onSend={finishStop} onSkip={() => finishStop(null)} />
      )}
      <div style={card}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', fontWeight: 900, fontSize: '0.78rem', background: isDone ? 'rgba(125,255,170,0.15)' : isActive ? 'rgba(201,168,76,0.15)' : 'rgba(122,171,130,0.1)', color: isDone ? '#7dffaa' : isActive ? '#c9a84c' : 'rgba(212,230,202,0.5)' }}>
                {isDone ? '✓' : idx + 1}
              </span>
              <span style={{ fontWeight: 900, fontSize: '1rem' }}>{stop.customerName}</span>
              {isDone && state.grandTotal > 0 && (
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#7dffaa' }}>{fmt$(state.grandTotal)}</span>
              )}
            </div>
            <div style={{ paddingLeft: 36, fontSize: '0.82rem', color: 'rgba(212,230,202,0.5)' }}>
              {stop.address}
              {stop.propertySize && <span style={{ marginLeft: 8, color: 'rgba(212,230,202,0.3)', fontSize: '0.75rem' }}>({stop.propertySize})</span>}
              {stop.startTime && <span style={{ marginLeft: 8 }}>· {fmtTime(stop.startTime)}</span>}
            </div>
            {(state.checkIn || state.checkOut) && (
              <div style={{ paddingLeft: 36, marginTop: 3, fontSize: '0.75rem', color: 'rgba(212,230,202,0.4)', display: 'flex', gap: 14 }}>
                {state.checkIn && <span>In: <strong>{state.checkIn}</strong></span>}
                {state.checkOut && <span>Out: <strong style={{ color: '#7dffaa' }}>{state.checkOut}</strong></span>}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            {stop.address && (
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.address)}&travelmode=driving`} target="_blank" rel="noopener noreferrer"
                style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid rgba(122,171,130,0.25)', fontSize: '0.78rem', fontWeight: 700, color: '#7aab82', textDecoration: 'none' }}>
                Navigate →
              </a>
            )}
            {isDone && state.invoiceUrl && (
              <a href={state.invoiceUrl} target="_blank" rel="noopener noreferrer"
                style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid rgba(201,168,76,0.3)', fontSize: '0.78rem', fontWeight: 700, color: '#c9a84c', textDecoration: 'none' }}>
                View Invoice →
              </a>
            )}
            {isDone && !state.invoiceUrl && stop.email && (
              <Link href={`/admin/invoice?email=${encodeURIComponent(stop.email)}`}
                style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid rgba(201,168,76,0.3)', fontSize: '0.78rem', fontWeight: 700, color: '#c9a84c', textDecoration: 'none' }}>
                Invoice →
              </Link>
            )}
            {state.status === 'pending' && (
              <button onClick={() => onUpdate({ status: 'active', checkIn: nowStr() })}
                style={{ padding: '6px 16px', borderRadius: 4, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.82rem', fontFamily: 'Nunito Sans, sans-serif', background: '#c9a84c', color: '#0d1a10' }}>
                Check In
              </button>
            )}
          </div>
        </div>

        {/* Active form — catalog sections */}
        {(isActive || isDone) && (
          <div style={{ borderTop: '1px solid rgba(122,171,130,0.1)', paddingTop: 14 }}>
            <MultiSelectSection title="Services Performed" catalog={SERVICES}
              qtys={state.serviceQtys} total={svcTotal} disabled={isDone}
              onChange={(label, n) => onUpdate({ serviceQtys: { ...state.serviceQtys, [label]: n } })} />

            <MultiSelectSection title="Equipment Installed" catalog={EQUIPMENT}
              qtys={state.equipQtys} total={eqTotal} disabled={isDone}
              onChange={(label, n) => onUpdate({ equipQtys: { ...state.equipQtys, [label]: n } })} />

            <MultiSelectSection title="Add-Ons Applied" catalog={ADDONS}
              qtys={state.addonQtys} total={addTotal} disabled={isDone}
              onChange={(label, n) => onUpdate({ addonQtys: { ...state.addonQtys, [label]: n } })} />

            {/* Grand total */}
            <div style={{ background: 'rgba(125,255,170,0.04)', border: '1px solid rgba(125,255,170,0.15)', borderRadius: 8, padding: '12px 16px', marginTop: 4, marginBottom: isActive ? 16 : 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                {[['Services', svcTotal], ['Equipment', eqTotal], ['Add-Ons', addTotal]].map(([lbl, val]) => (
                  <div key={lbl} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.68rem', color: 'rgba(212,230,202,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{lbl}</div>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: val > 0 ? '#d4e6ca' : 'rgba(212,230,202,0.25)' }}>{fmt$(val)}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid rgba(125,255,170,0.12)' }}>
                <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'rgba(212,230,202,0.6)' }}>Grand Total</span>
                <span style={{ fontWeight: 900, fontSize: '1.3rem', color: '#7dffaa' }}>{fmt$(grand)}</span>
              </div>
            </div>

            {isActive && (
              <>
                {/* Notes */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 6 }}>Notes</label>
                  <textarea rows={2} style={{ ...inp, resize: 'vertical' }} placeholder="CO₂ level, observations, follow-up…" value={state.notes} onChange={(e) => onUpdate({ notes: e.target.value })} />
                </div>

                {/* Photo */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 6 }}>Photo</label>
                  {state.photoUrl ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={state.photoUrl} alt="service" style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 8, display: 'block' }} />
                      <button onClick={() => { onUpdate({ photoUrl: null }); if (fileInputRef.current) fileInputRef.current.value = '' }}
                        style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: 4, color: '#fff', padding: '2px 8px', cursor: 'pointer', fontSize: '0.75rem' }}>Remove</button>
                    </div>
                  ) : (
                    <>
                      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhoto} />
                      <button onClick={() => fileInputRef.current?.click()}
                        style={{ padding: '8px 18px', borderRadius: 8, border: '1px dashed rgba(122,171,130,0.3)', background: 'transparent', color: 'rgba(212,230,202,0.55)', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'Nunito Sans, sans-serif', fontWeight: 700 }}>
                        📷 Take Photo
                      </button>
                    </>
                  )}
                </div>

                {state.error && <p style={{ color: '#ff8080', fontSize: '0.82rem', margin: '0 0 10px' }}>{state.error}</p>}

                <button onClick={handleComplete} disabled={state.submitting}
                  style={{ width: '100%', padding: 13, borderRadius: 8, border: 'none', cursor: state.submitting ? 'not-allowed' : 'pointer', fontWeight: 900, fontSize: '1rem', fontFamily: 'Nunito Sans, sans-serif', background: state.submitting ? 'rgba(125,255,170,0.2)' : '#7dffaa', color: '#0d1a10', opacity: state.submitting ? 0.7 : 1 }}>
                  {state.submitting ? 'Saving…' : grand > 0 ? `Complete & Generate Invoice — ${fmt$(grand)}` : 'Complete Stop'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Rounds({ stops, today, selectedDate, availableDates }) {
  const [date, setDate] = useState(selectedDate)
  const [states, setStates] = useState(() =>
    stops.map(() => ({
      status: 'pending', checkIn: null, checkOut: null, date: selectedDate,
      serviceQtys: {}, equipQtys: {}, addonQtys: {},
      notes: '', photoUrl: null, submitting: false, error: null,
      showEmailModal: false, invoiceId: null, invoiceUrl: null, grandTotal: 0,
    }))
  )
  const fileRefs = useRef(stops.map(() => ({ current: null })))

  useEffect(() => {
    fileRefs.current = stops.map((_, i) => fileRefs.current[i] || { current: null })
  }, [stops])

  function update(idx, patch) {
    setStates((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  function handleDateChange(e) {
    setDate(e.target.value)
    window.location.href = `/admin/rounds?date=${e.target.value}`
  }

  const doneCount = states.filter((s) => s.status === 'done').length
  const dateFmt = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <>
      <Head><title>Rounds · GreenGuard</title></Head>
      <PortalLayout isAdmin>
        <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="tag">Admin</span>
            <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Rounds</h1>
            <p style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.45)', margin: 0 }}>
              {dateFmt} · {doneCount}/{stops.length} complete
            </p>
          </div>
          <select value={date} onChange={handleDateChange}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(122,171,130,0.25)', background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.85rem', fontFamily: 'Nunito Sans, sans-serif', cursor: 'pointer' }}>
            {availableDates.map((d) => {
              const isToday = d === today
              const isPast = d < today
              const label = isToday ? `Today (${d})` : new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + (isPast ? ' — history' : '')
              return <option key={d} value={d}>{label}</option>
            })}
          </select>
        </div>

        {stops.length === 0 ? (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(122,171,130,0.15)', borderRadius: 12, padding: 24 }}>
            <p style={{ color: 'rgba(212,230,202,0.45)', margin: 0 }}>No appointments for {dateFmt}. Try a different date.</p>
          </div>
        ) : (
          stops.map((stop, idx) => (
            <StopCard key={`${selectedDate}-${idx}`} stop={stop} idx={idx} state={states[idx]}
              onUpdate={(patch) => update(idx, patch)} fileInputRef={fileRefs.current[idx]} />
          ))
        )}

        {doneCount === stops.length && stops.length > 0 && (
          <div style={{ background: 'rgba(125,255,170,0.05)', border: '1px solid rgba(125,255,170,0.25)', borderRadius: 12, padding: 28, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>✓</div>
            <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#7dffaa' }}>All stops complete!</div>
            <div style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.45)', marginTop: 4 }}>
              Total invoiced: {fmt$(states.reduce((s, st) => s + (st.grandTotal || 0), 0))}
            </div>
          </div>
        )}
      </PortalLayout>
    </>
  )
}
