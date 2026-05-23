import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { getTodaysBookings, getBookingsForDate } from '../../lib/gcal'
import { getBookingsForEmail } from '../../lib/calcom'
import { listAllCustomers } from '../../lib/stripe'
import { findContactByEmail } from '../../lib/hubspot'
import path from 'path'
import fs from 'fs'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export async function getServerSideProps({ req, query }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }

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
          serviceType: s.service_type || '',
        }))
      }
    }
  } catch {}

  if (stops.length === 0) {
    try {
      const bookings = selectedDate === today ? await getTodaysBookings() : await getBookingsForDate(selectedDate)
      stops = bookings.map((b) => ({
        customerName: b.customerName || b.name || 'Customer',
        serviceType: b.title || '',
        address: b.address || '', email: b.email || '',
        startTime: b.startTime, durationMin: null, propertySize: b.propertySize || '',
        rescheduleUrl: b.rescheduleUrl || null,
      }))
    } catch {}
  } else {
    // Route plan stops don't carry rescheduleUrl — fetch GCal to back-fill it
    try {
      const bookings = selectedDate === today ? await getTodaysBookings() : await getBookingsForDate(selectedDate)
      const gcalRescheduleByEmail = {}
      bookings.forEach((b) => {
        if (b.email && b.rescheduleUrl) gcalRescheduleByEmail[b.email.toLowerCase()] = b.rescheduleUrl
      })
      stops = stops.map((s) => ({
        ...s,
        rescheduleUrl: s.rescheduleUrl || gcalRescheduleByEmail[s.email?.toLowerCase()] || null,
      }))
    } catch {}
  }

  // Build email → customer name maps from Stripe + HubSpot
  let stripeNameByEmail = {}
  let hubspotNameByEmail = {}
  if (stops.length > 0) {
    const uniqueEmails = [...new Set(stops.map((s) => s.email).filter(Boolean))]
    await Promise.all([
      // Stripe names
      listAllCustomers().then(cs => cs.forEach(c => {
        if (c.email && c.name) stripeNameByEmail[c.email.toLowerCase()] = c.name
      })).catch(() => {}),
      // HubSpot names + tank count
      ...uniqueEmails.map(email =>
        findContactByEmail(email).then(c => {
          if (!c) return
          const first = c.properties?.firstname || ''
          const last = c.properties?.lastname || ''
          const full = [first, last].filter(Boolean).join(' ')
          if (full) hubspotNameByEmail[email.toLowerCase()] = full
          const tanks = parseInt(c.properties?.trap_count || c.properties?.tank_count || '0', 10) || null
          if (tanks) hubspotNameByEmail[email.toLowerCase() + '__tanks'] = tanks
        }).catch(() => {})
      ),
    ])
  }

  // Match Cal.com booking UIDs to stops — match by same date (not exact time)
  // Cal.com and Google Calendar can differ by hours due to timezone handling
  if (stops.length > 0) {
    const uniqueEmails = [...new Set(stops.map((s) => s.email).filter(Boolean))]
    const calBookingsByEmail = {}
    await Promise.all(uniqueEmails.map(async (email) => {
      try {
        // Fetch from start of the selected date
        const afterStart = new Date(selectedDate + 'T00:00:00-06:00').toISOString()
        const result = await getBookingsForEmail(email, afterStart)
        calBookingsByEmail[email] = Array.isArray(result) ? result : []
      } catch {}
    }))
    stops = stops.map((stop) => {
      const emailKey = stop.email?.toLowerCase()
      const candidates = calBookingsByEmail[stop.email] || []

      // Match: same date in CT, status not cancelled — closest time wins
      const sameDay = candidates.filter((cb) => {
        if (cb.status === 'CANCELLED' || cb.status === 'cancelled') return false
        const cbDate = new Date(cb.startTime).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
        return cbDate === selectedDate
      })
      const match = sameDay.length === 1
        ? sameDay[0]
        : sameDay.sort((a, b) =>
            Math.abs(new Date(a.startTime) - new Date(stop.startTime || a.startTime)) -
            Math.abs(new Date(b.startTime) - new Date(stop.startTime || b.startTime))
          )[0] || null

      const calName = match
        ? (match.responses?.name || match.title?.match(/and\s+(.+)$/)?.[1]?.trim() || null)
        : null
      const resolvedName = calName || hubspotNameByEmail[emailKey] || stripeNameByEmail[emailKey] || stop.customerName
      const tanks = hubspotNameByEmail[emailKey + '__tanks'] || null
      const serviceType = stop.serviceType || stop.customerName || ''

      return {
        ...stop,
        customerName: resolvedName,
        serviceType,
        tanks,
        rescheduleUrl: stop.rescheduleUrl || null,
        ...(match ? { calBookingId: match.id, calBookingUid: match.uid } : {}),
      }
    })
  }

  // Build last-3-days + today date options
  const availableDates = []
  for (let i = -10; i <= 3; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    availableDates.push(d.toLocaleDateString('en-CA', { timeZone: tz }))
  }

  return { props: { stops, today, selectedDate, availableDates } }
}

// ── Service Catalog ────────────────────────────────────────────────────────────
// Every item has: label, sku, price (null = hardware/no charge), section

const SERVICES = [
  { label: 'Biogents CO₂ Rental — 1 Trap',   sku: 'BG1',      price: 159.99 },
  { label: 'Biogents CO₂ Rental — 2 Traps',  sku: 'BG2',      price: 266.99 },
  { label: 'Biogents CO₂ Rental — 3 Traps',  sku: 'BG3',      price: 399.99 },
  { label: 'Mosqitter Grand Rental',          sku: 'MQ-RENT',  price: 299.99, promptQty: true },
  { label: 'Mosqitter Grand Service',         sku: 'MQ-SVC',   price: 129.99, promptQty: true },
  { label: 'Mosqitter Installation',          sku: 'MQ-INST',  price: 199.99, promptQty: true },
  { label: 'Mosqitter Troubleshoot',          sku: 'MQ-TSHOOT',price:  79.99 },
  { label: 'CO₂ Tank Exchange — 1 Tank',     sku: 'TANK1',    price:  89.99 },
  { label: 'CO₂ Tank Exchange — 2 Tanks',    sku: 'TANK2',    price: 139.99 },
  { label: 'CO₂ Tank Exchange — 3 Tanks',    sku: 'TANK3',    price: 189.99 },
  { label: 'CO₂ Tank Exchange — 4 Tanks',    sku: 'TANK4',    price: 239.99 },
  { label: 'CO₂ Tank Exchange — 6 Tanks',    sku: 'TANK6',    price: 339.99 },
  { label: 'CO₂ Tank Exchange — 10 Tanks',   sku: 'TANK10',   price: 539.99 },
  { label: 'GreenGuard Barrier Treatment',    sku: 'BARRIER',  price:  49.99 },
  { label: 'Free Property Assessment',        sku: 'ASSESS',   price:   0.00 },
]

const EQUIPMENT = [
  { label: 'Trap Installation',                        sku: 'TRAP-INSTALL',  price:  80.00 },
  { label: 'Timer Installation',                       sku: 'TIMER-INSTALL', price:  29.99 },
  { label: 'Trap Maintenance (1 trap)',                sku: 'TRAP-MAINT-1',  price:  10.00 },
  { label: 'Trap Maintenance (2 traps)',               sku: 'TRAP-MAINT-2',  price:  20.00 },
  { label: 'Trap Maintenance (3 traps)',               sku: 'TRAP-MAINT-3',  price:  30.00 },
  { label: 'Biogents Tank Hookup & Trap Maintenance',  sku: 'OWN-BG',        price:  10.00 },
  { label: 'Mosqitter Tank Hookup & Trap Maintenance', sku: 'OWN-MQ',        price:  30.00 },
]

const ADDONS = [
  { label: 'CO₂ Tank & Timer Rental',     sku: 'CO2-ADDON',     price: 124.99 },
  { label: 'BG Sweetscent',               sku: 'BG-SWEETSCENT', price:  18.99 },
  { label: 'Bait Pack',                   sku: 'BAIT',          price:  10.00 },
  { label: 'Larvicide Tablet',            sku: null,            price:   4.00 },
  { label: 'Weekend Surcharge',           sku: 'WKD-SURCH',     price:  25.00 },
]

// Equipment sold during visit — one-time purchases
const PRODUCTS_SOLD = [
  { label: 'Biogents BG-Mosquitaire',              sku: null, price: 279.99  },
  { label: 'Mosqitter Grand',                      sku: null, price: 1849.99 },
  { label: 'Biogents Timer',                       sku: null, price:  89.99  },
  { label: 'CO₂ Tank — 20lb (empty)',             sku: null, price: 199.99  },
  { label: 'CO₂ Regulator',                       sku: null, price: 119.99  },
  { label: 'CO₂ Tank Washer',                     sku: null, price:   5.00  },
  { label: 'Biogents Power Supply',               sku: null, price:  36.99  },
  { label: 'Biogents Power Supply 30ft Extension',sku: null, price:  16.99  },
  { label: 'Biogents Trap Net',                   sku: null, price:   6.99  },
  { label: 'Biogents Funnel',                     sku: null, price:  10.50  },
  { label: '9V Batteries',                        sku: null, price:   6.00  },
  { label: 'Splitter',                            sku: null, price:   8.99  },
  { label: '50ft Extension Cord',                 sku: null, price:  20.00  },
  { label: '100ft Extension Cord',               sku: null, price:  40.00  },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt$(n) { return n == null ? '—' : `$${n.toFixed(2)}` }
const TZ = 'America/Chicago'
function fmtTime(iso) { return iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }) : null }
function nowStr() { return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: TZ }) }

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
                onClick={() => !selected && !item.promptQty && onChange(item.label, 1)}
                style={{ display: 'flex', alignItems: 'center', padding: '11px 14px', borderBottom: '1px solid rgba(122,171,130,0.06)', cursor: selected || item.promptQty ? 'default' : 'pointer', background: selected ? 'rgba(125,255,170,0.05)' : 'transparent' }}>
                {!item.promptQty && (
                  <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${selected ? '#7dffaa' : 'rgba(122,171,130,0.3)'}`, background: selected ? '#7dffaa' : 'transparent', marginRight: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#0d1a10', fontWeight: 900 }}>
                    {selected ? '✓' : ''}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: selected ? 700 : 500, color: selected ? '#d4e6ca' : 'rgba(212,230,202,0.65)' }}>{item.label}</div>
                  <div style={{ fontSize: '0.7rem', color: 'rgba(212,230,202,0.3)', marginTop: 1 }}>
                    {item.sku && <span style={{ marginRight: 8, color: 'rgba(201,168,76,0.5)' }}>{item.sku}</span>}
                    <span style={{ color: item.price ? '#7dffaa' : 'rgba(212,230,202,0.2)' }}>{item.price ? fmt$(item.price) : 'no charge'}</span>
                    {item.promptQty && qty > 0 && <span style={{ marginLeft: 8, color: '#7dffaa', fontWeight: 700 }}>= {fmt$(item.price * qty)}</span>}
                  </div>
                </div>
                {/* Inline qty input for promptQty items */}
                {item.promptQty ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    <span style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.45)', fontWeight: 700 }}>Qty:</span>
                    <button onClick={() => onChange(item.label, Math.max(0, qty - 1))}
                      style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(122,171,130,0.3)', background: 'transparent', color: '#d4e6ca', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, fontFamily: 'Nunito Sans, sans-serif' }}>−</button>
                    <input
                      type="number" min="0" value={qty || ''}
                      placeholder="0"
                      onChange={(e) => onChange(item.label, Math.max(0, parseInt(e.target.value) || 0))}
                      style={{ width: 44, textAlign: 'center', padding: '4px 6px', borderRadius: 6, border: '1px solid rgba(125,255,170,0.35)', background: qty > 0 ? 'rgba(125,255,170,0.08)' : 'rgba(255,255,255,0.04)', color: qty > 0 ? '#7dffaa' : '#d4e6ca', fontWeight: 900, fontSize: '0.95rem', fontFamily: 'Nunito Sans, sans-serif', outline: 'none' }}
                    />
                    <button onClick={() => onChange(item.label, qty + 1)}
                      style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(125,255,170,0.3)', background: 'rgba(125,255,170,0.08)', color: '#7dffaa', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, fontFamily: 'Nunito Sans, sans-serif' }}>+</button>
                  </div>
                ) : selected && (
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
  const [drafting, setDrafting] = useState(false)
  const inp = { width: '100%', padding: '10px 12px', boxSizing: 'border-box', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 8, background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.88rem', fontFamily: 'Nunito Sans, sans-serif', outline: 'none', resize: 'vertical' }

  async function draftWithAI() {
    setDrafting(true)
    try {
      const services = lineItems.filter(l => l.qty > 0).map(l => l.label)
      const res = await fetch('/api/admin/ai-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'visit-email', customerName: stop.customerName, address: stop.address, services, notes: '' }),
      })
      const data = await res.json()
      if (data.text) setMsg(data.text)
    } catch {}
    setDrafting(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#0d1a10', border: '1px solid rgba(122,171,130,0.3)', borderRadius: 12, padding: 24, maxWidth: 500, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Send Post-Visit Email</h3>
          <button onClick={draftWithAI} disabled={drafting}
            style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(91,196,255,0.3)', background: drafting ? 'rgba(91,196,255,0.08)' : 'transparent', color: '#5bc4ff', cursor: drafting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.75rem', fontFamily: 'Nunito Sans, sans-serif' }}>
            {drafting ? 'Writing…' : '✨ Draft with AI'}
          </button>
        </div>
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

function CancelModal({ stop, onConfirm, onClose }) {
  const [reason, setReason] = useState('')
  const [sendEmail, setSendEmail] = useState(!!stop.email)
  const [busy, setBusy] = useState(false)

  async function go() {
    setBusy(true)
    try {
      if (stop.calBookingId) {
        await fetch('/api/admin/cancel-booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: stop.calBookingId, reason: reason || 'Cancelled by admin', customerEmail: stop.email, action: 'cancel' }),
        })
      }
      if (sendEmail && stop.email) {
        const msg = reason
          ? `Hi ${stop.customerName?.split(' ')[0] || 'there'},\n\nYour appointment has been cancelled.\n\nReason: ${reason}\n\nPlease contact us to reschedule.\n\nThank you,\nGreenGuard USA`
          : `Hi ${stop.customerName?.split(' ')[0] || 'there'},\n\nYour GreenGuard appointment has been cancelled. Please contact us to reschedule.\n\nThank you,\nGreenGuard USA`
        await fetch('/api/admin/complete-stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: stop.email, customerName: stop.customerName, customEmailMessage: msg }),
        })
      }
      onConfirm()
    } catch (e) {
      alert('Cancel failed: ' + e.message)
    }
    setBusy(false)
  }

  const inp = { width: '100%', padding: '9px 12px', boxSizing: 'border-box', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 8, background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.88rem', fontFamily: 'Nunito Sans, sans-serif', outline: 'none' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#0d1a10', border: '1px solid rgba(255,100,100,0.3)', borderRadius: 12, padding: 24, maxWidth: 440, width: '100%' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#ff8080' }}>Cancel Appointment</h3>
        <p style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.45)', margin: '0 0 16px' }}>{stop.customerName} · {stop.address}</p>
        {!stop.calBookingId && (
          <p style={{ fontSize: '0.75rem', color: '#c9a84c', margin: '0 0 12px', padding: '8px 12px', borderRadius: 6, background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)' }}>
            ⚠️ No Cal.com booking matched — cancellation note only, booking not removed from calendar.
          </p>
        )}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.45)', display: 'block', marginBottom: 4 }}>Reason (optional)</label>
          <input style={inp} placeholder="e.g. Customer request, weather, scheduling conflict" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {stop.email && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.85rem', color: 'rgba(212,230,202,0.8)', cursor: 'pointer', marginBottom: 20, userSelect: 'none' }}>
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} style={{ width: 16, height: 16 }} />
            Send cancellation email to {stop.email}
          </label>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={go} disabled={busy} style={{ flex: 1, padding: 11, borderRadius: 8, border: 'none', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 900, fontSize: '0.9rem', fontFamily: 'Nunito Sans, sans-serif', background: busy ? 'rgba(255,100,100,0.2)' : '#ff6b6b', color: '#fff' }}>
            {busy ? 'Cancelling…' : 'Confirm Cancel'}
          </button>
          <button onClick={onClose} style={{ padding: '11px 18px', borderRadius: 8, border: '1px solid rgba(122,171,130,0.25)', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'Nunito Sans, sans-serif', background: 'transparent', color: 'rgba(212,230,202,0.55)' }}>
            Back
          </button>
        </div>
      </div>
    </div>
  )
}

function StopCard({ stop, idx, state, onUpdate, fileInputRef, videoInputRef }) {
  const isDone = state.status === 'done'
  const isActive = state.status === 'active'
  const [showCancel, setShowCancel] = useState(false)
  const [uploading, setUploading] = useState(false)

  const svcTotal  = sectionTotal(SERVICES,      state.serviceQtys)
  const eqTotal   = sectionTotal(EQUIPMENT,     state.equipQtys)
  const addTotal  = sectionTotal(ADDONS,        state.addonQtys)
  const prodTotal = sectionTotal(PRODUCTS_SOLD, state.productQtys)
  const grand     = svcTotal + eqTotal + addTotal + prodTotal

  const allLineItems = [
    ...buildLineItems(SERVICES,      state.serviceQtys),
    ...buildLineItems(EQUIPMENT,     state.equipQtys),
    ...buildLineItems(ADDONS,        state.addonQtys),
    ...buildLineItems(PRODUCTS_SOLD, state.productQtys),
  ]

  function handlePhoto(e) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => onUpdate({ photoUrl: ev.target.result })
    reader.readAsDataURL(file)
  }

  async function handleVideo(e) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    try {
      const res = await fetch('/api/admin/upload-media', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (res.ok) {
        const { url } = await res.json()
        onUpdate({ videoUrl: url })
      } else {
        const { error } = await res.json()
        onUpdate({ error: error || 'Video upload failed' })
      }
    } catch (err) {
      onUpdate({ error: err.message })
    }
    setUploading(false)
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
          body: JSON.stringify({ customerEmail: stop.email, customerName: stop.customerName, lineItems: allLineItems, serviceDate: state.date, calBookingUid: stop.calBookingUid }),
        })
        if (invRes.status === 409) {
          // Double-billing warning
          const warn = await invRes.json()
          const proceed = window.confirm(`⚠️ ${warn.warning}\n\nClick OK only if this is a new visit that needs a separate invoice.`)
          if (!proceed) {
            onUpdate({ submitting: false, showEmailModal: false })
            return
          }
          // Force through — customer confirmed
          const forceRes = await fetch('/api/admin/generate-invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customerEmail: stop.email, customerName: stop.customerName, lineItems: allLineItems, serviceDate: state.date, calBookingUid: stop.calBookingUid, force: true }),
          })
          if (forceRes.ok) {
            const fd = await forceRes.json()
            invoiceId = fd.invoiceId
            invoiceUrl = fd.invoiceUrl
          }
        } else if (invRes.ok) {
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
        arrivalTime: state.arrivalTime || null,
        departureTime: state.departureTime || null,
        checkIn: state.checkIn,
        checkOut: nowStr(),
        serviceQtys: state.serviceQtys,
        equipQtys: state.equipQtys,
        addonQtys: state.addonQtys,
        productQtys: state.productQtys,
        svcTotal, eqTotal, addTotal, prodTotal, grandTotal: grand,
        notes: state.notes,
        photoTaken: !!state.photoUrl,
        videoUrl: state.videoUrl || null,
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
      {showCancel && (
        <CancelModal
          stop={stop}
          onConfirm={() => { setShowCancel(false); onUpdate({ status: 'cancelled' }) }}
          onClose={() => setShowCancel(false)}
        />
      )}
      <div style={{ ...card, opacity: state.status === 'cancelled' ? 0.45 : isDone ? 0.7 : 1 }}>
        {/* Header */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', fontWeight: 900, fontSize: '0.78rem', background: isDone ? 'rgba(125,255,170,0.15)' : isActive ? 'rgba(201,168,76,0.15)' : 'rgba(122,171,130,0.1)', color: isDone ? '#7dffaa' : isActive ? '#c9a84c' : 'rgba(212,230,202,0.5)', flexShrink: 0 }}>
              {isDone ? '✓' : idx + 1}
            </span>
            <span style={{ fontWeight: 900, fontSize: '1rem' }}>{stop.customerName}</span>
            {isDone && state.grandTotal > 0 && (
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#7dffaa' }}>{fmt$(state.grandTotal)}</span>
            )}
          </div>
          <div style={{ paddingLeft: 36, display: 'flex', flexWrap: 'wrap', gap: '3px 14px', fontSize: '0.8rem', marginBottom: 4 }}>
            {stop.startTime && <span style={{ color: '#c9a84c', fontWeight: 700 }}>{fmtTime(stop.startTime)}</span>}
            {stop.serviceType && <span style={{ color: '#c9a84c', fontWeight: 700 }}>{stop.serviceType}</span>}
            {stop.address && <span style={{ color: 'rgba(212,230,202,0.5)' }}>📍 {stop.address}</span>}
            {stop.tanks > 0 && <span style={{ color: '#7dffaa', fontWeight: 700 }}>🪣 {stop.tanks} tank{stop.tanks > 1 ? 's' : ''}</span>}
          </div>
          {(state.checkIn || state.checkOut) && (
            <div style={{ paddingLeft: 36, marginBottom: 4, fontSize: '0.75rem', color: 'rgba(212,230,202,0.4)', display: 'flex', gap: 14 }}>
              {state.checkIn && <span>In: <strong>{state.checkIn}</strong></span>}
              {state.checkOut && <span>Out: <strong style={{ color: '#7dffaa' }}>{state.checkOut}</strong></span>}
            </div>
          )}

          {/* Button row — full width, wraps on narrow screens */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {stop.address && (
              <a href={`https://maps.apple.com/?daddr=${encodeURIComponent(stop.address)}`} target="_blank" rel="noopener noreferrer"
                style={{ flex: '1 1 70px', padding: '7px 6px', borderRadius: 6, justifyContent: 'center', border: '1px solid rgba(122,171,130,0.25)', fontSize: '0.78rem', fontWeight: 700, color: '#7aab82', textDecoration: 'none', minHeight: 34, display: 'inline-flex', alignItems: 'center' }}>
                Navigate
              </a>
            )}
            {state.status !== 'cancelled' && state.status !== 'done' && (stop.rescheduleUrl || stop.calBookingUid) ? (
              <a href={stop.rescheduleUrl || `https://cal.com/reschedule/${stop.calBookingUid}`} target="_blank" rel="noopener noreferrer"
                onClick={async () => {
                  if (stop.calBookingId && stop.email) {
                    await fetch('/api/admin/cancel-booking', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ bookingId: stop.calBookingId, customerEmail: stop.email, action: 'reschedule' }),
                    }).catch(() => {})
                  }
                }}
                style={{ flex: '1 1 70px', padding: '7px 6px', borderRadius: 6, justifyContent: 'center', border: '1px solid rgba(91,196,255,0.25)', fontSize: '0.78rem', fontWeight: 700, color: '#5bc4ff', textDecoration: 'none', minHeight: 34, display: 'inline-flex', alignItems: 'center' }}>
                Reschedule
              </a>
            ) : state.status !== 'cancelled' && state.status !== 'done' ? (
              <button disabled style={{ flex: '1 1 70px', padding: '7px 6px', borderRadius: 6, justifyContent: 'center', border: '1px solid rgba(91,196,255,0.15)', fontSize: '0.78rem', fontWeight: 700, color: 'rgba(91,196,255,0.4)', cursor: 'not-allowed', minHeight: 34, display: 'inline-flex', alignItems: 'center', fontFamily: 'Nunito Sans, sans-serif', background: 'transparent' }}>
                Reschedule
              </button>
            ) : null}
            {state.status !== 'cancelled' && state.status !== 'done' && (
              <button onClick={() => setShowCancel(true)}
                style={{ flex: '1 1 70px', padding: '7px 6px', borderRadius: 6, justifyContent: 'center', border: '1px solid rgba(255,100,100,0.3)', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'Nunito Sans, sans-serif', background: 'transparent', color: '#ff8080', minHeight: 34, display: 'inline-flex', alignItems: 'center' }}>
                Cancel
              </button>
            )}
            {state.status === 'pending' && (
              <button onClick={() => onUpdate({ status: 'active', checkIn: nowStr() })}
                style={{ flex: '1 1 70px', padding: '7px 6px', borderRadius: 6, justifyContent: 'center', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.82rem', fontFamily: 'Nunito Sans, sans-serif', background: '#c9a84c', color: '#0d1a10', minHeight: 34, display: 'inline-flex', alignItems: 'center' }}>
                Check In
              </button>
            )}
            {isDone && state.invoiceUrl && (
              <a href={state.invoiceUrl} target="_blank" rel="noopener noreferrer"
                style={{ flex: '1 1 70px', padding: '7px 6px', borderRadius: 6, justifyContent: 'center', border: '1px solid rgba(201,168,76,0.3)', fontSize: '0.78rem', fontWeight: 700, color: '#c9a84c', textDecoration: 'none', minHeight: 34, display: 'inline-flex', alignItems: 'center' }}>
                Invoice
              </a>
            )}
            {isDone && !state.invoiceUrl && stop.email && (
              <Link href={`/admin/invoice?email=${encodeURIComponent(stop.email)}`}
                style={{ flex: '1 1 70px', padding: '7px 6px', borderRadius: 6, justifyContent: 'center', border: '1px solid rgba(201,168,76,0.3)', fontSize: '0.78rem', fontWeight: 700, color: '#c9a84c', textDecoration: 'none', minHeight: 34, display: 'inline-flex', alignItems: 'center' }}>
                Invoice
              </Link>
            )}
            {state.status === 'cancelled' && (
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#ff8080', textTransform: 'uppercase', letterSpacing: '0.08em', alignSelf: 'center' }}>Cancelled</span>
            )}
          </div>
        </div>

        {/* Active form — catalog sections */}
        {(isActive || isDone) && (
          <div style={{ borderTop: '1px solid rgba(122,171,130,0.1)', paddingTop: 14 }}>
            <MultiSelectSection title="Services Performed" catalog={SERVICES}
              qtys={state.serviceQtys} total={svcTotal} disabled={isDone}
              onChange={(label, n) => onUpdate({ serviceQtys: { ...state.serviceQtys, [label]: n } })} />

            <MultiSelectSection title="Products Sold" catalog={PRODUCTS_SOLD}
              qtys={state.productQtys} total={prodTotal} disabled={isDone}
              onChange={(label, n) => onUpdate({ productQtys: { ...state.productQtys, [label]: n } })} />

            <MultiSelectSection title="Equipment Installed" catalog={EQUIPMENT}
              qtys={state.equipQtys} total={eqTotal} disabled={isDone}
              onChange={(label, n) => onUpdate({ equipQtys: { ...state.equipQtys, [label]: n } })} />

            <MultiSelectSection title="Add-Ons Applied" catalog={ADDONS}
              qtys={state.addonQtys} total={addTotal} disabled={isDone}
              onChange={(label, n) => onUpdate({ addonQtys: { ...state.addonQtys, [label]: n } })} />

            {/* Grand total */}
            <div style={{ background: 'rgba(125,255,170,0.04)', border: '1px solid rgba(125,255,170,0.15)', borderRadius: 8, padding: '12px 16px', marginTop: 4, marginBottom: isActive ? 16 : 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                {[['Services', svcTotal], ['Equipment', eqTotal], ['Add-Ons', addTotal], ['Products', prodTotal]].map(([lbl, val]) => (
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
                {/* Arrival / Departure */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 6 }}>Arrival Time</label>
                    <input type="time" style={{ ...inp, textAlign: 'center', minHeight: 42, WebkitAppearance: 'none', appearance: 'none', display: 'block' }} value={state.arrivalTime || ''} onChange={(e) => onUpdate({ arrivalTime: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 6 }}>Departure Time</label>
                    <input type="time" style={{ ...inp, textAlign: 'center', minHeight: 42, WebkitAppearance: 'none', appearance: 'none', display: 'block' }} value={state.departureTime || ''} onChange={(e) => onUpdate({ departureTime: e.target.value })} />
                  </div>
                </div>

                {/* Notes */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 6 }}>Notes</label>
                  <textarea rows={2} style={{ ...inp, resize: 'vertical' }} placeholder="CO₂ level, observations, follow-up…" value={state.notes} onChange={(e) => onUpdate({ notes: e.target.value })} />
                </div>

                {/* Photo + Video */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 8 }}>Media</label>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {/* Photo */}
                    {state.photoUrl ? (
                      <div style={{ position: 'relative' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={state.photoUrl} alt="service" style={{ height: 100, borderRadius: 8, display: 'block', border: '1px solid rgba(122,171,130,0.2)' }} />
                        <button onClick={() => { onUpdate({ photoUrl: null }); if (fileInputRef.current) fileInputRef.current.value = '' }}
                          style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: 4, color: '#fff', padding: '2px 6px', cursor: 'pointer', fontSize: '0.7rem' }}>✕</button>
                      </div>
                    ) : (
                      <>
                        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />
                        <button onClick={() => fileInputRef.current?.click()}
                          style={{ padding: '10px 16px', borderRadius: 8, border: '1px dashed rgba(122,171,130,0.3)', background: 'transparent', color: 'rgba(212,230,202,0.55)', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'Nunito Sans, sans-serif', fontWeight: 700 }}>
                          📷 Photo
                        </button>
                      </>
                    )}
                    {/* Video */}
                    {state.videoUrl ? (
                      <div style={{ position: 'relative' }}>
                        <video src={state.videoUrl} style={{ height: 100, borderRadius: 8, border: '1px solid rgba(122,171,130,0.2)' }} controls />
                        <button onClick={() => { onUpdate({ videoUrl: null }); if (videoInputRef.current) videoInputRef.current.value = '' }}
                          style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: 4, color: '#fff', padding: '2px 6px', cursor: 'pointer', fontSize: '0.7rem' }}>✕</button>
                      </div>
                    ) : (
                      <>
                        <input ref={videoInputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={handleVideo} />
                        <button onClick={() => videoInputRef.current?.click()} disabled={uploading}
                          style={{ padding: '10px 16px', borderRadius: 8, border: '1px dashed rgba(91,196,255,0.3)', background: 'transparent', color: uploading ? 'rgba(91,196,255,0.3)' : 'rgba(91,196,255,0.7)', cursor: uploading ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontFamily: 'Nunito Sans, sans-serif', fontWeight: 700 }}>
                          {uploading ? 'Uploading…' : '🎥 Video'}
                        </button>
                      </>
                    )}
                  </div>
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
      arrivalTime: '', departureTime: '',
      serviceQtys: {}, equipQtys: {}, addonQtys: {}, productQtys: {},
      notes: '', photoUrl: null, videoUrl: null, submitting: false, error: null,
      showEmailModal: false, invoiceId: null, invoiceUrl: null, grandTotal: 0,
    }))
  )
  const fileRefs = useRef(stops.map(() => ({ current: null })))
  const videoRefs = useRef(stops.map(() => ({ current: null })))
  const stopRefs = useRef([])

  // Auto-scroll to a specific stop when ?email= is in the URL (from tech dashboard)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const targetEmail = params.get('email')
    if (!targetEmail) return
    const idx = stops.findIndex((s) => s.email?.toLowerCase() === targetEmail.toLowerCase())
    if (idx >= 0 && stopRefs.current[idx]) {
      setTimeout(() => {
        stopRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 200)
    }
  }, [stops])

  useEffect(() => {
    videoRefs.current = stops.map((_, i) => videoRefs.current[i] || { current: null })
  }, [stops])

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
            <div key={`${selectedDate}-${idx}`} ref={(el) => { stopRefs.current[idx] = el }}>
              <StopCard stop={stop} idx={idx} state={states[idx]}
                onUpdate={(patch) => update(idx, patch)} fileInputRef={fileRefs.current[idx]} videoInputRef={videoRefs.current[idx]} />
            </div>
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
