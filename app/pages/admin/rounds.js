import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { getTodaysBookings, getBookingsForDate, getBookingsForDateRange } from '../../lib/gcal'
import { listAllCustomers, findInvoiceForBooking, findInvoicesForBookings, bookingStopKey } from '../../lib/stripe'
import { findContactsByEmails, findContactsByNames, tanksForCustomer, getClientNotes } from '../../lib/hubspot'
import { prefillFromBooking, slugFromTitle } from '../../lib/sku-engine'
import SignaturePad from '../../components/SignaturePad'
import CustomerPanel from '../../components/CustomerPanel'
import StopCard from '../../components/StopCard'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export async function getServerSideProps({ req, query, res }) {
  res?.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=60')
  const session = await getSessionFromRequest(req, res)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }

  const tz = process.env.CALENDAR_TIMEZONE || 'America/Chicago'
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const mode = query.mode === 'open' ? 'open' : 'date'
  const selectedDate = mode === 'open' ? null : (query.date || today)

  let stops = []
  if (mode === 'open') {
    // Pull GCal events from the last 30 days. Filtering to "open" (no
    // existing invoice) happens later, after we've matched contacts/Cal.com.
    try {
      const startISO = new Date(Date.now() - 30 * 86400 * 1000).toISOString()
      const endISO = new Date().toISOString()
      const bookings = await getBookingsForDateRange(startISO, endISO)
      stops = bookings.map((b) => ({
        gcalEventId: b.id || null,
        customerName: b.customerName || b.name || 'Customer',
        serviceType: b.title || '',
        address: b.address || '', email: b.email || '',
        startTime: b.startTime, durationMin: null,
        bookingDate: b.dateStr,
        // Carry the Cal.com UID through so per-visit invoice matching works.
        // (The Cal.com match block below never populates it — that fan-out is
        // disabled — so without this the double-billing guard was dead code.)
        calBookingUid: b.calBookingUid || null,
        appointmentNotes: b.appointmentNotes || null,
      }))
    } catch {}
  } else {
    let gcalError = null
    try {
      const bookings = selectedDate === today ? await getTodaysBookings() : await getBookingsForDate(selectedDate)
      stops = bookings.map((b) => ({
        gcalEventId: b.id || null,
        customerName: b.customerName || b.name || 'Customer',
        serviceType: b.title || '',
        address: b.address || '', email: b.email || '',
        startTime: b.startTime, durationMin: null, propertySize: b.propertySize || '',
        rescheduleUrl: b.rescheduleUrl || null,
        gcal_event_link: b.gcal_event_link || null,
        appointmentNotes: b.appointmentNotes || null,
        booking_source: b.booking_source || (b.rescheduleUrl?.includes('cal.com') ? 'calcom' : b.rescheduleUrl ? 'legacy' : null),
      }))
    } catch (e) {
      gcalError = e.message || 'Google Calendar connection failed'
      console.error('[rounds] GCal error:', e.message)
    }
    if (gcalError) return { props: { stops: [], today, selectedDate, availableDates: [], mode, gcalError } }
  }

  // Back-fill emails for stops whose GCal event description didn't include one,
  // by matching the customer name (and address as tiebreaker) against HubSpot.
  if (stops.length > 0) {
    const missingEmail = stops.filter((s) => !s.email && s.customerName)
    if (missingEmail.length > 0) {
      try {
        const nameMap = await findContactsByNames(
          missingEmail.map((s) => ({ name: s.customerName, address: s.address }))
        )
        stops = stops.map((s) => {
          if (s.email || !s.customerName) return s
          const hit = nameMap.get(s.customerName.trim().toLowerCase())
          const e = hit?.properties?.email
          return e ? { ...s, email: e, emailSource: 'hubspot-name-match' } : s
        })
      } catch {}
    }
  }

  // Build email → customer name maps from Stripe + HubSpot
  let stripeNameByEmail = {}
  let hubspotNameByEmail = {}
  const hubspotContactByEmail = {}
  if (stops.length > 0) {
    const uniqueEmails = [...new Set(stops.map((s) => s.email).filter(Boolean))]
    await Promise.all([
      // Stripe names
      listAllCustomers().then(cs => cs.forEach(c => {
        if (c.email && c.name) stripeNameByEmail[c.email.toLowerCase()] = c.name
      })).catch(() => {}),
      // HubSpot names + tank count + full contact (for prefill) — single batched call
      findContactsByEmails(uniqueEmails).then(async (contactMap) => {
        for (const [email, c] of contactMap.entries()) {
          hubspotContactByEmail[email] = c
          const first = c.properties?.firstname || ''
          const last = c.properties?.lastname || ''
          const full = [first, last].filter(Boolean).join(' ')
          if (full) hubspotNameByEmail[email] = full
          const tanks = tanksForCustomer(c.properties) || null
          if (tanks) hubspotNameByEmail[email + '__tanks'] = tanks
        }
        // Client popup notes ([ADMIN-NOTE ...] prefixed) — shared helper.
        await Promise.all([...contactMap.entries()].map(async ([email, c]) => {
          const client = await getClientNotes(c.id)
          if (client.length) hubspotContactByEmail[email]._clientNotes = client
        }))
      }).catch(() => {}),
    ])
  }

  // Cal.com booking UID matching — CALCOM_API_KEY only has event-type scope so
  // getBookingsForEmail() always returns []. Skip the per-email fan-out entirely.
  if (stops.length > 0) {
    const calBookingsByEmail = {}
    stops = stops.map((stop) => {
      const emailKey = stop.email?.toLowerCase()
      const candidates = calBookingsByEmail[stop.email?.toLowerCase()] || []
      // In open mode each stop has its own date; in date mode all share selectedDate.
      const stopDate = stop.bookingDate || selectedDate

      // Match: same date in CT, status not cancelled — closest time wins
      const sameDay = candidates.filter((cb) => {
        if (cb.status === 'CANCELLED' || cb.status === 'cancelled') return false
        const cbDate = new Date(cb.startTime).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
        return cbDate === stopDate
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
      // Tanks: prefer the precomputed lookup, fall back to a fresh
      // tanksForCustomer() call from the cached contact. This guards against
      // any timing/cache quirk in the parallel Promise.all above.
      let tanks = hubspotNameByEmail[emailKey + '__tanks'] || null
      if (!tanks && hubspotContactByEmail[emailKey]) {
        const t = tanksForCustomer(hubspotContactByEmail[emailKey].properties)
        if (t > 0) tanks = t
      }
      const serviceType = stop.serviceType || ''

      // Compute prefill line items from Cal.com event-type + HubSpot contact.
      // Slug source priority: explicit booking.eventTypeSlug → derived from event title.
      // Always call the engine even with no slug — it falls back to the customer's
      // HubSpot system config (system_type/trap_count/recurring_addons) so legacy
      // Acuity titles and manual bookings still pre-fill instead of coming up blank.
      const slug = match?.eventType?.slug || match?.eventTypeSlug || slugFromTitle(serviceType)
      const contact = hubspotContactByEmail[emailKey] || null
      const prefill = prefillFromBooking({ slug }, contact)
      const billingContactName = contact?.properties?.billing_contact_name || null
      // Surface the customer's booking note (from the GCal event description) in
      // the same Notes field the tech already sees, ahead of any HubSpot admin
      // notes. This is what makes a note added at booking time reach rounds.
      const bookingNote = (stop.appointmentNotes || '').trim()
      const clientNotes = [...(bookingNote ? [bookingNote] : []), ...(contact?._clientNotes || [])]
      const firstAppointment = contact?.properties?.first_appointment === 'true'

      return {
        ...stop,
        customerName: resolvedName,
        serviceType,
        tanks,
        firstAppointment,
        eventTypeSlug: slug || null,
        prefill,
        billingContactName,
        clientNotes,
        rescheduleUrl: stop.rescheduleUrl || null,
        ...(match ? { calBookingId: match.id, calBookingUid: match.uid } : {}),
      }
    })

    // Invoice enrichment — batch fetch instead of N individual Stripe calls.
    // Only in `open` mode (needs to filter by invoice existence before building list).
    if (mode === 'open') {
      // Per-visit invoice match (by cal_booking_uid / service_date), keyed by
      // bookingStopKey. Email-only matching used to hide a customer's unbilled
      // stops whenever any recent invoice for them existed.
      const invoiceMap = await findInvoicesForBookings(stops).catch(() => ({}))
      stops = stops.map(s => ({
        ...s,
        existingInvoice: invoiceMap[bookingStopKey(s)] || null,
      }))
    }
  }

  if (mode === 'open') {
    // "Open" = no Stripe invoice yet attached to this booking. Sort oldest
    // first by default; client can re-sort.
    stops = stops
      .filter((s) => !s.existingInvoice)
      .sort((a, b) => new Date(a.startTime || 0) - new Date(b.startTime || 0))
  }

  // Build last-30-days + 3 days ahead date options
  const availableDates = []
  for (let i = -30; i <= 3; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    availableDates.push(d.toLocaleDateString('en-CA', { timeZone: tz }))
  }

  return { props: { stops, today, selectedDate, availableDates, mode, gcalError: null } }
}

// ── Service Catalog ────────────────────────────────────────────────────────────
// Every item has: label, sku, price (null = hardware/no charge), section

const SERVICES = [
  { label: 'Biogents CO₂ Rental — 1 Trap',   sku: 'BG1',      price: 159.99 },
  { label: 'Biogents CO₂ Rental — 2 Traps',  sku: 'BG2',      price: 266.99 },
  { label: 'Biogents CO₂ Rental — 3 Traps',  sku: 'BG3',      price: 399.99 },
  { label: 'Biogents CO₂ Rental — 4 Traps',  sku: 'BG4',      price: 500.00 },
  { label: 'Mosqitter Grand Rental',          sku: 'MQ-RENT',  price: 299.99, promptQty: true },
  { label: 'Mosqitter Grand Service',         sku: 'MQ-SVC',   price: 129.99, promptQty: true },
  { label: 'Mosqitter Installation',          sku: 'MQ-INST',  price: 199.99, promptQty: true },
  { label: 'Mosqitter Troubleshoot',          sku: 'MQ-TSHOOT',price:  79.99 },
  // CO2 tank refill: $49.99/tank. The $39.99 delivery fee is auto-bundled
  // once per appointment when refill qty > 0 (see the post-processor in
  // allLineItems below) and shows as a sub-row in the catalog UI. Hookup
  // & maintenance ($10/tank) is opt-in via a checkbox under the refill row.
  { label: 'CO₂ Tank Refill (per tank)',      sku: 'TANK-REFILL',       price: 50.00, promptQty: true },
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

// Addons + products-sold pulled from the shared catalog so /admin/quote and
// /admin/inventory stay in sync. Add new items in lib/catalog.js only.
const { addonsForRounds, productsForRounds } = require('../../lib/catalog')
const ADDONS = addonsForRounds()
const PRODUCTS_SOLD = productsForRounds()

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt$(n) { return n == null ? '—' : `$${n.toFixed(2)}` }
const TZ = 'America/Chicago'
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
        <div style={{ fontSize: '1.02rem', fontWeight: active ? 800 : 600, color: active ? '#d4e6ca' : 'rgba(212,230,202,0.7)' }}>{item.label}</div>
        <div style={{ fontSize: '0.84rem', color: 'rgba(212,230,202,0.45)', marginTop: 2 }}>
          {item.sku && <span style={{ marginRight: 8, color: 'rgba(201,168,76,0.7)' }}>{item.sku}</span>}
          <span style={{ color: item.price ? '#7dffaa' : 'rgba(212,230,202,0.4)' }}>{item.price ? fmt$(item.price) + '/unit' : 'no charge'}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {active && !disabled && (
          <button onClick={() => onChange(Math.max(0, qty - 1))}
            style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(122,171,130,0.3)', background: 'transparent', color: '#d4e6ca', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, fontFamily: 'Inter, sans-serif' }}>−</button>
        )}
        {active && (
          <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 900, fontSize: '1.1rem', color: '#7dffaa' }}>{qty}</span>
        )}
        {!disabled && (
          <button onClick={() => onChange(qty + 1)}
            style={{ width: 30, height: 30, borderRadius: '50%', border: `1px solid ${active ? 'rgba(125,255,170,0.4)' : 'rgba(122,171,130,0.2)'}`, background: active ? 'rgba(125,255,170,0.08)' : 'transparent', color: active ? '#7dffaa' : 'rgba(212,230,202,0.4)', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, fontFamily: 'Inter, sans-serif' }}>+</button>
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
        <span style={{ fontSize: '0.84rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c9a84c' }}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {total > 0 && <span style={{ fontSize: '1rem', fontWeight: 800, color: '#7dffaa' }}>{fmt$(total)}</span>}
          <span style={{ fontSize: '0.88rem', color: 'rgba(212,230,202,0.35)' }}>{open ? '▲' : '▼'}</span>
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

function MultiSelectSection({ title, catalog, qtys, onChange, disabled, total, onOptionalToggle }) {
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
        <span style={{ fontSize: '0.84rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c9a84c' }}>{title}</span>
        {total > 0 && <span style={{ fontSize: '1rem', fontWeight: 800, color: '#7dffaa' }}>{fmt$(total)}</span>}
      </div>

      {/* Selected items summary with qty controls */}
      {selectedItems.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {selectedItems.map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', marginBottom: 4, borderRadius: 8, background: 'rgba(125,255,170,0.06)', border: '1px solid rgba(125,255,170,0.15)' }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '1.02rem', fontWeight: 800, color: '#d4e6ca' }}>{item.label}</span>
                {item.sku && <span style={{ marginLeft: 8, fontSize: '0.8rem', color: 'rgba(201,168,76,0.7)' }}>{item.sku}</span>}
                {item.price && <span style={{ marginLeft: 6, fontSize: '0.9rem', color: '#7dffaa' }}>{fmt$(item.price * (qtys[item.label] || 1))}</span>}
              </div>
              {!disabled && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => onChange(item.label, Math.max(0, (qtys[item.label] || 0) - 1))}
                    style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(122,171,130,0.3)', background: 'transparent', color: '#d4e6ca', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, fontFamily: 'Inter, sans-serif' }}>−</button>
                  <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 900, color: '#7dffaa' }}>{qtys[item.label] || 0}</span>
                  <button onClick={() => onChange(item.label, (qtys[item.label] || 0) + 1)}
                    style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(125,255,170,0.3)', background: 'rgba(125,255,170,0.08)', color: '#7dffaa', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, fontFamily: 'Inter, sans-serif' }}>+</button>
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
          style={{ width: '100%', minHeight: 50, padding: '13px 16px', borderRadius: 12, border: '1.5px dashed rgba(122,171,130,0.4)', background: 'rgba(122,171,130,0.04)', color: 'rgba(212,230,202,0.75)', cursor: 'pointer', fontWeight: 700, fontSize: '1rem', fontFamily: 'Inter, sans-serif', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{selectedItems.length > 0 ? `+ Add more ${title.toLowerCase()}` : `Select ${title.toLowerCase()}…`}</span>
          <span style={{ fontSize: '0.85rem' }}>{open ? '▲' : '▼'}</span>
        </button>
      )}

      {/* Dropdown panel */}
      {open && (
        <div style={{ position: 'absolute', left: 0, right: 0, zIndex: 50, background: '#0d1a10', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 10, marginTop: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', maxHeight: 360, overflowY: 'auto' }}>
          <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid rgba(122,171,130,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'rgba(212,230,202,0.65)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{title}</span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(212,230,202,0.45)', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, fontFamily: 'Inter, sans-serif' }}>×</button>
          </div>
          {catalog.flatMap((item) => {
            const qty = qtys[item.label] || 0
            const selected = qty > 0
            const rows = []
            rows.push(
              <div key={item.label}
                onClick={() => !selected && !item.promptQty && onChange(item.label, 1)}
                style={{ display: 'flex', alignItems: 'center', padding: '11px 14px', borderBottom: '1px solid rgba(122,171,130,0.06)', cursor: selected || item.promptQty ? 'default' : 'pointer', background: selected ? 'rgba(125,255,170,0.05)' : 'transparent' }}>
                {!item.promptQty && (
                  <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${selected ? '#7dffaa' : 'rgba(122,171,130,0.3)'}`, background: selected ? '#7dffaa' : 'transparent', marginRight: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.88rem', color: '#0d1a10', fontWeight: 900 }}>
                    {selected ? '✓' : ''}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1.02rem', fontWeight: selected ? 800 : 600, color: selected ? '#d4e6ca' : 'rgba(212,230,202,0.75)' }}>{item.label}</div>
                  <div style={{ fontSize: '0.84rem', color: 'rgba(212,230,202,0.45)', marginTop: 2 }}>
                    {item.sku && <span style={{ marginRight: 8, color: 'rgba(201,168,76,0.7)' }}>{item.sku}</span>}
                    <span style={{ color: item.price ? '#7dffaa' : 'rgba(212,230,202,0.35)' }}>{item.price ? fmt$(item.price) : 'no charge'}</span>
                    {item.promptQty && qty > 0 && <span style={{ marginLeft: 8, color: '#7dffaa', fontWeight: 700 }}>= {fmt$(item.price * qty)}</span>}
                  </div>
                </div>
                {/* Inline qty input for promptQty items */}
                {item.promptQty ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    <span style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.6)', fontWeight: 700 }}>Qty:</span>
                    <button onClick={() => onChange(item.label, Math.max(0, qty - 1))}
                      style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(122,171,130,0.3)', background: 'transparent', color: '#d4e6ca', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, fontFamily: 'Inter, sans-serif' }}>−</button>
                    <input
                      type="number" min="0" value={qty || ''}
                      placeholder="0"
                      onChange={(e) => onChange(item.label, Math.max(0, parseInt(e.target.value) || 0))}
                      style={{ width: 44, textAlign: 'center', padding: '4px 6px', borderRadius: 6, border: '1px solid rgba(125,255,170,0.35)', background: qty > 0 ? 'rgba(125,255,170,0.08)' : 'rgba(255,255,255,0.04)', color: qty > 0 ? '#7dffaa' : '#d4e6ca', fontWeight: 900, fontSize: '0.95rem', fontFamily: 'Inter, sans-serif', outline: 'none' }}
                    />
                    <button onClick={() => onChange(item.label, qty + 1)}
                      style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(125,255,170,0.3)', background: 'rgba(125,255,170,0.08)', color: '#7dffaa', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, fontFamily: 'Inter, sans-serif' }}>+</button>
                  </div>
                ) : selected && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => onChange(item.label, Math.max(0, qty - 1))}
                      style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(122,171,130,0.3)', background: 'transparent', color: '#d4e6ca', cursor: 'pointer', fontSize: '0.95rem', lineHeight: 1, fontFamily: 'Inter, sans-serif' }}>−</button>
                    <span style={{ minWidth: 16, textAlign: 'center', fontWeight: 900, color: '#7dffaa', fontSize: '0.9rem' }}>{qty}</span>
                    <button onClick={() => onChange(item.label, qty + 1)}
                      style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(125,255,170,0.3)', background: 'rgba(125,255,170,0.08)', color: '#7dffaa', cursor: 'pointer', fontSize: '0.95rem', lineHeight: 1, fontFamily: 'Inter, sans-serif' }}>+</button>
                  </div>
                )}
              </div>
            )
            // Auto-bundled sub-cost: tank delivery fee shows under refill once per appointment.
            if (item.sku === 'TANK-REFILL' && qty > 0) {
              rows.push(
                <div key={item.label + '__delivery'}
                  style={{ display: 'flex', alignItems: 'center', padding: '6px 14px 8px 48px', borderBottom: '1px solid rgba(122,171,130,0.06)', background: 'rgba(125,255,170,0.03)', fontSize: '0.9rem', color: 'rgba(212,230,202,0.6)' }}>
                  <span style={{ flex: 1 }}>+ CO₂ Tank Delivery Fee <span style={{ color: 'rgba(212,230,202,0.35)', fontSize: '0.7rem', marginLeft: 6 }}>(once per visit)</span></span>
                  <span style={{ color: '#7dffaa', fontWeight: 700 }}>{fmt$(39.99)}</span>
                </div>
              )
              // Opt-in hookup & maintenance — $10 per tank. Toggled via the
              // showOptionalRow callback so this catalog widget can write
              // tankHookupOptIn back to the parent state.
              const optedIn = onOptionalToggle?.value === true
              rows.push(
                <div key={item.label + '__hookup'}
                  onClick={() => onOptionalToggle && onOptionalToggle.set(!optedIn)}
                  style={{ display: 'flex', alignItems: 'center', padding: '8px 14px 8px 48px', borderBottom: '1px solid rgba(122,171,130,0.06)', background: optedIn ? 'rgba(201,168,76,0.07)' : 'rgba(255,255,255,0.02)', fontSize: '0.9rem', color: 'rgba(212,230,202,0.75)', cursor: 'pointer' }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${optedIn ? '#c9a84c' : 'rgba(201,168,76,0.4)'}`, background: optedIn ? '#c9a84c' : 'transparent', marginRight: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#0d1a10', fontWeight: 900 }}>
                    {optedIn ? '✓' : ''}
                  </div>
                  <span style={{ flex: 1 }}>+ Tank Hookup &amp; Maintenance <span style={{ color: 'rgba(212,230,202,0.35)', fontSize: '0.7rem', marginLeft: 6 }}>($10/tank · optional)</span></span>
                  <span style={{ color: optedIn ? '#c9a84c' : 'rgba(212,230,202,0.35)', fontWeight: 700 }}>{fmt$(10.00 * qty)}</span>
                </div>
              )
            }
            return rows
          })}
          <div style={{ padding: '10px 14px', textAlign: 'center' }}>
            <button onClick={() => setOpen(false)}
              style={{ padding: '8px 24px', borderRadius: 6, border: 'none', background: '#7dffaa', color: '#0d1a10', fontWeight: 900, fontSize: '0.85rem', fontFamily: 'Inter, sans-serif', cursor: 'pointer' }}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Email modal ────────────────────────────────────────────────────────────────

// Roll up tank refill + delivery fee + hookup into one "CO₂ Tank Service" line.
function rollUpLineItems(lineItems) {
  const TANK_SKUS = new Set(['TANK-REFILL', 'TANK-DELIVERY-FEE', 'TANK-HOOKUP-MAINT'])
  const tankItems = lineItems.filter((l) => TANK_SKUS.has(l.sku) && l.qty > 0)
  const other = lineItems.filter((l) => !TANK_SKUS.has(l.sku) && l.qty > 0)
  if (tankItems.length === 0) return other
  const tankTotal = tankItems.reduce((sum, l) => sum + (l.price || 0) * (l.qty || 1), 0)
  const refillItem = tankItems.find((l) => l.sku === 'TANK-REFILL')
  const tankQty = refillItem?.qty || 1
  return [
    { label: `CO₂ Tank Service${tankQty > 1 ? ` ×${tankQty}` : ''}`, sku: 'TANK-SERVICE', price: tankTotal, qty: 1 },
    ...other,
  ]
}

function EmailModal({ stop, lineItems, grandTotal, onSend, onSkip }) {
  const displayItems = rollUpLineItems(lineItems)
  const defaultMsg = [
    `Hi ${stop.customerName ? stop.customerName.split(' ')[0] : 'there'},`,
    '',
    `Your GreenGuard USA service visit is complete. Here's a summary:`,
    '',
    ...displayItems.map((l) => `• ${l.label}${l.price ? ` — ${fmt$(l.price)}` : ''}`),
    '',
    `Total: ${fmt$(grandTotal)}`,
    '',
    'An invoice will be sent separately. Thank you for being a GreenGuard USA customer!',
    '',
    '— The GreenGuard USA Team',
  ].join('\n')

  const [msg, setMsg] = useState(defaultMsg)
  const [drafting, setDrafting] = useState(false)
  const inp = { width: '100%', padding: '10px 12px', boxSizing: 'border-box', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 8, background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.88rem', fontFamily: 'Inter, sans-serif', outline: 'none', resize: 'vertical' }

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
            style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(91,196,255,0.3)', background: drafting ? 'rgba(91,196,255,0.08)' : 'transparent', color: '#5bc4ff', cursor: drafting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.88rem', fontFamily: 'Inter, sans-serif' }}>
            {drafting ? 'Writing…' : '✨ Draft with AI'}
          </button>
        </div>
        <p style={{ fontSize: '0.9rem', color: 'rgba(212,230,202,0.45)', margin: '0 0 14px' }}>To: <strong>{stop.email || '(no email)'}</strong></p>
        <textarea rows={14} style={inp} value={msg} onChange={(e) => setMsg(e.target.value)} />
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button onClick={() => onSend(msg)} style={{ flex: 1, padding: 11, borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 900, fontSize: '0.9rem', fontFamily: 'Inter, sans-serif', background: '#7dffaa', color: '#0d1a10' }}>
            Send Email
          </button>
          <button onClick={onSkip} style={{ padding: '11px 18px', borderRadius: 8, border: '1px solid rgba(122,171,130,0.25)', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'Inter, sans-serif', background: 'transparent', color: 'rgba(212,230,202,0.55)' }}>
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Stop card ──────────────────────────────────────────────────────────────────

function ApptDetailModal({ stop, onClose, onOpenProfile }) {
  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
  const box = { background: '#0d1a10', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 14, padding: 24, maxWidth: 440, width: '100%', fontFamily: 'Inter, sans-serif', color: '#d4e6ca', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }
  const row = (label, value) => value ? (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(212,230,202,0.4)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '0.9rem', color: '#d4e6ca' }}>{value}</div>
    </div>
  ) : null
  const fmtTime = (iso) => { try { return new Date(iso).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }) } catch { return iso } }
  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', color: 'rgba(212,230,202,0.4)', fontSize: '1.3rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
        <div style={{ fontWeight: 900, fontSize: '1.1rem', marginBottom: 18, paddingRight: 24 }}>{stop.customerName}</div>
        {row('Appointment time', stop.startTime ? fmtTime(stop.startTime) : null)}
        {row('Service', stop.serviceType)}
        {row('Address', stop.address)}
        {row('Email', stop.email)}
        {row('Phone', stop.phone)}
        {(stop.clientNotes || []).map((n, i) => row(i === 0 ? 'Notes' : '', n))}
        {row('Tanks', stop.tanks > 0 ? `${stop.tanks} tank${stop.tanks > 1 ? 's' : ''}` : null)}
        {stop.email && onOpenProfile && (
          <button
            style={{ display: 'inline-block', marginTop: 14, padding: '8px 18px', borderRadius: 8, background: 'rgba(125,255,170,0.08)', border: '1px solid rgba(125,255,170,0.25)', color: '#7dffaa', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}
            onClick={() => { onClose?.(); onOpenProfile({ email: stop.email, name: stop.customerName, phone: stop.phone }) }}>
            Open Profile →
          </button>
        )}
      </div>
    </div>
  )
}

function RoundsStopCard({ stop, idx, state, onUpdate, fileInputRef, videoInputRef, onOpenProfile, distance }) {
  const isDone = state.status === 'done'
  const isActive = state.status === 'active'
  // SSR detected an existing Stripe invoice for this booking. Suppress
  // action buttons unless the admin has already acted in-session (state.invoiceId).
  const alreadyInvoiced = !!stop.existingInvoice && !state.invoiceId
  const [allowOverride, setAllowOverride] = useState(false)
  const showInvoicedPanel = alreadyInvoiced && !allowOverride
  const [uploading, setUploading] = useState(false)

  // Once an invoice exists for this stop, pull the saved visit log so the
  // owner can review the tech's notes without bouncing to HubSpot.
  const [visitLog, setVisitLog] = useState(null)
  const [visitLogLoaded, setVisitLogLoaded] = useState(false)
  const serviceDate = stop.bookingDate || (stop.startTime ? stop.startTime.slice(0, 10) : null) || state.date
  useEffect(() => {
    if (!showInvoicedPanel || !stop.email || visitLogLoaded) return
    setVisitLogLoaded(true)
    const qs = new URLSearchParams({ email: stop.email })
    if (serviceDate) qs.set('date', serviceDate)
    fetch(`/api/admin/visit-log?${qs}`)
      .then((r) => r.json())
      .then((d) => setVisitLog(d.log || null))
      .catch(() => {})
  }, [showInvoicedPanel, stop.email, visitLogLoaded, serviceDate])


  const svcTotal  = sectionTotal(SERVICES,      state.serviceQtys)
  const eqTotal   = sectionTotal(EQUIPMENT,     state.equipQtys)
  const addTotal  = sectionTotal(ADDONS,        state.addonQtys)
  const prodTotal = sectionTotal(PRODUCTS_SOLD, state.productQtys)

  // CO2 tank refill auto-bundles a single $39.00 delivery fee per appointment
  // (must match the billed TANK-DELIVERY-FEE line item below and sku-engine).
  // Hookup & maintenance ($10/tank) is opt-in via state.tankHookupOptIn.
  const tankRefillQty = state.serviceQtys['CO₂ Tank Refill (per tank)'] || 0
  const deliveryFee = tankRefillQty > 0 ? 39.00 : 0
  const hookupTotal = (tankRefillQty > 0 && state.tankHookupOptIn) ? 10.00 * tankRefillQty : 0

  // Delivery fee + hookup are conceptually service charges — include in
  // svcTotal so the Services KPI on the rounds card reflects the actual
  // amount, not just the line items the admin clicked.
  const svcTotalWithBundle = svcTotal + deliveryFee + hookupTotal
  const grand     = svcTotalWithBundle + eqTotal + addTotal + prodTotal

  const allLineItems = [
    ...buildLineItems(SERVICES,      state.serviceQtys),
    ...buildLineItems(EQUIPMENT,     state.equipQtys),
    ...buildLineItems(ADDONS,        state.addonQtys),
    ...buildLineItems(PRODUCTS_SOLD, state.productQtys),
    ...(tankRefillQty > 0 ? [{ label: 'CO₂ Tank Delivery Fee', sku: 'TANK-DELIVERY-FEE', price: 39.00, qty: 1 }] : []),
    ...(tankRefillQty > 0 && state.tankHookupOptIn ? [{ label: 'Tank Hookup & Maintenance (per tank)', sku: 'TANK-HOOKUP-MAINT', price: 10.00, qty: tankRefillQty }] : []),
  ]

  async function handlePhoto(e) {
    const file = e.target.files?.[0]; if (!file) return
    // Upload immediately so we keep only the URL in state — base64 data URLs
    // hold the entire image (often 3-8MB) in React state, ballooning re-renders
    // and SSR/JSON payloads. Same pattern as handleVideo.
    setUploading(true)
    try {
      const headers = { 'Content-Type': file.type }
      // Pass customer email so the photo-QA agent attaches its assessment
      // note to the right HubSpot contact.
      if (stop.email) headers['x-customer-email'] = stop.email
      const res = await fetch('/api/admin/upload-media', {
        method: 'POST',
        headers,
        body: file,
      })
      if (res.ok) {
        const { url } = await res.json()
        onUpdate({ photoUrl: url })
      } else {
        const { error } = await res.json().catch(() => ({}))
        onUpdate({ error: error || 'Photo upload failed' })
      }
    } catch (err) {
      onUpdate({ error: err.message })
    }
    setUploading(false)
  }

  async function handleVideo(e) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    try {
      const headers = { 'Content-Type': file.type }
      if (stop.email) headers['x-customer-email'] = stop.email
      // Video can't be vision-QA'd cheaply; skip the AI call
      headers['x-skip-qa'] = '1'
      const res = await fetch('/api/admin/upload-media', {
        method: 'POST',
        headers,
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
      // 1. Generate Stripe draft invoice. Create one whenever the customer
      // has an email and at least one line item is selected, even if every
      // item happens to be $0 — gives admin a paper trail to finalize/edit.
      let invoiceId = null, invoiceUrl = null
      let invoiceSkipped = null
      if (!stop.email) {
        invoiceSkipped = 'No email on file for this customer — invoice was not created.'
      } else if (allLineItems.length === 0) {
        invoiceSkipped = 'No services selected — invoice was not created.'
      } else {
        const invRes = await fetch('/api/admin/generate-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerEmail: stop.email, customerName: stop.customerName, lineItems: allLineItems, serviceDate: state.date, calBookingUid: stop.calBookingUid, signatureUrl: state.signatureUrl || null }),
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
        } else {
          const errData = await invRes.json().catch(() => ({}))
          invoiceSkipped = `Invoice failed: ${errData.error || invRes.status}`
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

      onUpdate({ status: 'done', checkOut: visitData.checkOut, invoiceId, invoiceUrl, grandTotal: grand, invoiceSkipped, submitting: false })
    } catch (err) {
      onUpdate({ submitting: false, error: err.message, showEmailModal: false })
    }
  }

  const inp = { width: '100%', padding: '9px 12px', boxSizing: 'border-box', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 8, background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.88rem', fontFamily: 'Inter, sans-serif', outline: 'none' }

  return (
    <>
      {state.showEmailModal && (
        <EmailModal stop={stop} lineItems={allLineItems} grandTotal={grand}
          onSend={finishStop} onSkip={() => finishStop(null)} />
      )}
      <StopCard
        stop={stop}
        number={idx + 1}
        done={isDone}
        active={isActive}
        cancelled={state.status === 'cancelled'}
        distance={distance}
        onOpenProfile={onOpenProfile}
        checkIn={state.checkIn}
        checkOut={state.checkOut}
        headerExtras={<>
          {/* Invoice badge — only when panel is NOT already showing below */}
          {stop.existingInvoice && !showInvoicedPanel && (() => {
            const inv = stop.existingInvoice
            const colors = {
              paid:  { fg: '#7dffaa', bg: 'rgba(125,255,170,0.12)', bd: 'rgba(125,255,170,0.3)' },
              open:  { fg: '#c9a84c', bg: 'rgba(201,168,76,0.12)',  bd: 'rgba(201,168,76,0.3)'  },
              draft: { fg: 'rgba(212,230,202,0.7)', bg: 'rgba(212,230,202,0.06)', bd: 'rgba(212,230,202,0.2)' },
            }
            const c = colors[inv.status] || colors.draft
            const labelText = inv.status === 'paid' ? `Paid · ${fmt$(inv.amountPaid || inv.amountDue)}`
              : inv.status === 'open' ? `Invoice sent · ${fmt$(inv.amountDue)}`
              : `Draft · ${fmt$(inv.amountDue || 0)}`
            return (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: c.fg, background: c.bg, border: `1px solid ${c.bd}`, padding: '2px 7px', borderRadius: 4 }}>
                🧾 {labelText}
              </span>
            )
          })()}
          {isDone && state.grandTotal > 0 && (
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#7dffaa' }}>{fmt$(state.grandTotal)}</span>
          )}
        </>}
      >
        <div>
          {/* Already-invoiced banner — replaces the action buttons when SSR
              detected an existing invoice on this booking. */}
          {showInvoicedPanel && (() => {
            const inv = stop.existingInvoice
            const colorByStatus = {
              paid:  { fg: '#7dffaa', bg: 'rgba(125,255,170,0.08)', bd: 'rgba(125,255,170,0.3)', label: 'Invoice paid' },
              open:  { fg: '#c9a84c', bg: 'rgba(201,168,76,0.08)',  bd: 'rgba(201,168,76,0.3)',  label: 'Invoice sent — awaiting payment' },
              draft: { fg: 'rgba(212,230,202,0.7)', bg: 'rgba(212,230,202,0.05)', bd: 'rgba(212,230,202,0.2)', label: 'Invoice draft — finalize when ready' },
            }
            const c = colorByStatus[inv.status] || colorByStatus.draft
            const amount = inv.status === 'paid' ? inv.amountPaid || inv.amountDue : inv.amountDue
            const fallbackUrl = `/admin/invoice?email=${encodeURIComponent(stop.email || '')}`
            return (
              <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, border: `1px solid ${c.bd}`, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: c.fg }}>✓ {c.label}</div>
                  <div style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.6)', marginTop: 2 }}>
                    {fmt$(amount)} · {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <a href={inv.hostedUrl || fallbackUrl} target="_blank" rel="noopener noreferrer"
                    style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${c.bd}`, fontSize: '0.9rem', fontWeight: 700, color: c.fg, textDecoration: 'none', minHeight: 34, display: 'inline-flex', alignItems: 'center' }}>
                    View invoice
                  </a>
                  <button onClick={() => setAllowOverride(true)}
                    style={{ padding: '4px 8px', border: 'none', background: 'transparent', fontSize: '0.7rem', color: 'rgba(212,230,202,0.5)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', textDecoration: 'underline' }}>
                    Re-complete
                  </button>
                </div>
              </div>
            )
          })()}

          {/* Visit notes — the tech's logged notes + service summary for the
              completed visit, shown alongside the existing invoice. */}
          {showInvoicedPanel && visitLog?.notes && (
            <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(122,171,130,0.2)', background: 'rgba(255,255,255,0.02)', fontSize: '0.85rem', color: '#d4e6ca', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {visitLog.notes}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {stop.address && (
              <a href={`https://maps.apple.com/?daddr=${encodeURIComponent(stop.address)}`} target="_blank" rel="noopener noreferrer"
                style={{ flex: '1 1 70px', padding: '7px 6px', borderRadius: 6, justifyContent: 'center', border: '1px solid rgba(122,171,130,0.25)', fontSize: '0.9rem', fontWeight: 700, color: '#7aab82', textDecoration: 'none', minHeight: 34, display: 'inline-flex', alignItems: 'center' }}>
                Navigate
              </a>
            )}
            {!showInvoicedPanel && state.status === 'pending' && (() => {
              const canNotify = !!(stop.email || stop.phone)
              return (
                <button
                  disabled={!canNotify}
                  title={canNotify ? 'Send arrival SMS' : 'No phone or email on file'}
                  onClick={async () => {
                    const eta = window.prompt('ETA in minutes (leave blank for "shortly"):', '15')
                    if (eta === null) return
                    const send = async (force) => fetch('/api/admin/notify-eta', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ customerEmail: stop.email, customerPhone: stop.phone, customerName: stop.customerName, etaMinutes: eta ? parseInt(eta, 10) : null, force }),
                    })
                    let r = await send(false)
                    let d = await r.json().catch(() => ({}))
                    if (r.status === 409 && d.duplicate) {
                      if (!window.confirm(d.error + '\n\nSend again anyway?')) return
                      r = await send(true)
                      d = await r.json().catch(() => ({}))
                    }
                    if (r.ok) alert('✓ SMS sent')
                    else alert('Failed: ' + (d.error || r.status))
                  }}
                  style={{
                    flex: '1 1 70px', padding: '7px 6px', borderRadius: 6, justifyContent: 'center',
                    border: canNotify ? '1px solid rgba(125,255,170,0.35)' : '1px solid rgba(125,255,170,0.15)',
                    cursor: canNotify ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: '0.9rem',
                    fontFamily: 'Inter, sans-serif',
                    background: canNotify ? 'rgba(125,255,170,0.08)' : 'transparent',
                    color: canNotify ? '#7dffaa' : 'rgba(125,255,170,0.4)',
                    minHeight: 34, display: 'inline-flex', alignItems: 'center',
                  }}>
                  📲 On My Way
                </button>
              )
            })()}
            {!showInvoicedPanel && state.status === 'pending' && (
              <button onClick={() => onUpdate({ status: 'active', checkIn: nowStr() })}
                title="Mark visit started and open service entry"
                style={{ flex: '1 1 70px', padding: '7px 6px', borderRadius: 6, justifyContent: 'center', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.82rem', fontFamily: 'Inter, sans-serif', background: '#c9a84c', color: '#0d1a10', minHeight: 34, display: 'inline-flex', alignItems: 'center' }}>
                Finalize Visit
              </button>
            )}
            {isDone && state.invoiceUrl && (
              <a href={state.invoiceUrl} target="_blank" rel="noopener noreferrer"
                style={{ flex: '1 1 70px', padding: '7px 6px', borderRadius: 6, justifyContent: 'center', border: '1px solid rgba(201,168,76,0.3)', fontSize: '0.9rem', fontWeight: 700, color: '#c9a84c', textDecoration: 'none', minHeight: 34, display: 'inline-flex', alignItems: 'center' }}>
                Invoice
              </a>
            )}
            {isDone && !state.invoiceUrl && stop.email && (
              <Link href={`/admin/invoice?email=${encodeURIComponent(stop.email)}`}
                style={{ flex: '1 1 70px', padding: '7px 6px', borderRadius: 6, justifyContent: 'center', border: '1px solid rgba(201,168,76,0.3)', fontSize: '0.9rem', fontWeight: 700, color: '#c9a84c', textDecoration: 'none', minHeight: 34, display: 'inline-flex', alignItems: 'center' }}>
                Invoice
              </Link>
            )}
            {isDone && state.invoiceSkipped && (
              <div style={{ flex: '1 1 100%', marginTop: 6, padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,160,80,0.3)', background: 'rgba(255,160,80,0.07)', color: '#ffb060', fontSize: '0.9rem' }}>
                ⚠️ {state.invoiceSkipped}
              </div>
            )}
            {state.status === 'cancelled' && (
              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#ff8080', textTransform: 'uppercase', letterSpacing: '0.08em', alignSelf: 'center' }}>Cancelled</span>
            )}
          </div>
        </div>

        {/* Active form — catalog sections */}
        {(isActive || isDone) && (
          <div style={{ borderTop: '1px solid rgba(122,171,130,0.1)', paddingTop: 14 }}>
            <MultiSelectSection title="Services Performed" catalog={SERVICES}
              qtys={state.serviceQtys} total={svcTotalWithBundle} disabled={isDone}
              onChange={(label, n) => onUpdate((s) => ({ serviceQtys: { ...s.serviceQtys, [label]: n } }))}
              onOptionalToggle={{ value: !!state.tankHookupOptIn, set: (v) => onUpdate({ tankHookupOptIn: v }) }} />

            <MultiSelectSection title="Products Sold" catalog={PRODUCTS_SOLD}
              qtys={state.productQtys} total={prodTotal} disabled={isDone}
              onChange={(label, n) => onUpdate((s) => ({ productQtys: { ...s.productQtys, [label]: n } }))} />

            <MultiSelectSection title="Equipment Installed" catalog={EQUIPMENT}
              qtys={state.equipQtys} total={eqTotal} disabled={isDone}
              onChange={(label, n) => onUpdate((s) => ({ equipQtys: { ...s.equipQtys, [label]: n } }))} />

            <MultiSelectSection title="Add-Ons Applied" catalog={ADDONS}
              qtys={state.addonQtys} total={addTotal} disabled={isDone}
              onChange={(label, n) => onUpdate((s) => ({ addonQtys: { ...s.addonQtys, [label]: n } }))} />

            {/* Grand total */}
            <div style={{ background: 'rgba(125,255,170,0.04)', border: '1px solid rgba(125,255,170,0.15)', borderRadius: 8, padding: '12px 16px', marginTop: 4, marginBottom: isActive ? 16 : 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                {[['Services', svcTotalWithBundle], ['Products', prodTotal], ['Installs', eqTotal], ['Add-Ons', addTotal]].map(([lbl, val]) => (
                  <div key={lbl} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{lbl}</div>
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
                          style={{ padding: '10px 16px', borderRadius: 8, border: '1px dashed rgba(122,171,130,0.3)', background: 'transparent', color: 'rgba(212,230,202,0.55)', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'Inter, sans-serif', fontWeight: 700 }}>
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
                          style={{ padding: '10px 16px', borderRadius: 8, border: '1px dashed rgba(91,196,255,0.3)', background: 'transparent', color: uploading ? 'rgba(91,196,255,0.3)' : 'rgba(91,196,255,0.7)', cursor: uploading ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontFamily: 'Inter, sans-serif', fontWeight: 700 }}>
                          {uploading ? 'Uploading…' : '🎥 Video'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Customer signature — optional, captured before completion */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 8 }}>
                    Customer signature {state.signatureUrl ? '✓' : '(optional)'}
                  </label>
                  {state.signatureUrl ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={state.signatureUrl} alt="signature" style={{ height: 80, borderRadius: 6, background: '#fff', display: 'block', border: '1px solid rgba(125,255,170,0.3)' }} />
                      <button onClick={() => onUpdate({ signatureUrl: null })}
                        style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: 4, color: '#fff', padding: '2px 6px', cursor: 'pointer', fontSize: '0.7rem' }}>✕</button>
                    </div>
                  ) : state.showSignaturePad ? (
                    <SignaturePad
                      onSave={async (dataUrl) => {
                        // Upload to Vercel Blob, store URL only in state.
                        const blob = await fetch(dataUrl).then((r) => r.blob())
                        const res = await fetch('/api/admin/upload-media', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob })
                        if (res.ok) {
                          const { url } = await res.json()
                          onUpdate({ signatureUrl: url, showSignaturePad: false })
                        } else {
                          onUpdate({ error: 'Signature upload failed' })
                        }
                      }}
                      onCancel={() => onUpdate({ showSignaturePad: false })}
                    />
                  ) : (
                    <button onClick={() => onUpdate({ showSignaturePad: true })}
                      style={{ padding: '10px 16px', borderRadius: 8, border: '1px dashed rgba(125,255,170,0.3)', background: 'transparent', color: 'rgba(125,255,170,0.7)', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'Inter, sans-serif', fontWeight: 700 }}>
                      ✍ Capture signature
                    </button>
                  )}
                </div>

                {state.error && <p style={{ color: '#ff8080', fontSize: '0.82rem', margin: '0 0 10px' }}>{state.error}</p>}

                <button onClick={handleComplete} disabled={state.submitting}
                  style={{ width: '100%', padding: 13, borderRadius: 8, border: 'none', cursor: state.submitting ? 'not-allowed' : 'pointer', fontWeight: 900, fontSize: '1rem', fontFamily: 'Inter, sans-serif', background: state.submitting ? 'rgba(125,255,170,0.2)' : '#7dffaa', color: '#0d1a10', opacity: state.submitting ? 0.7 : 1 }}>
                  {state.submitting ? 'Saving…' : grand > 0 ? `Complete & Generate Invoice — ${fmt$(grand)}` : 'Complete Stop'}
                </button>
              </>
            )}
          </div>
        )}
      </StopCard>
    </>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

// Map a SKU to (sectionField, catalogLabel) so prefill can write into the
// right qty map. Built once from the four catalogs.
const SKU_TO_SECTION = (() => {
  const m = {}
  const add = (catalog, field) => catalog.forEach((item) => {
    if (item.sku) m[item.sku] = { field, label: item.label }
  })
  add(SERVICES, 'serviceQtys')
  add(EQUIPMENT, 'equipQtys')
  add(ADDONS, 'addonQtys')
  add(PRODUCTS_SOLD, 'productQtys')
  return m
})()

function applyPrefill(prefill) {
  const next = { serviceQtys: {}, equipQtys: {}, addonQtys: {}, productQtys: {}, tankHookupOptIn: false }
  for (const { sku, qty } of (prefill || [])) {
    // TANK-HOOKUP-MAINT has no catalog row — it's a checkbox under the tank
    // refill line. Treat its presence as the opt-in signal.
    if (sku === 'TANK-HOOKUP-MAINT') { next.tankHookupOptIn = true; continue }
    const target = SKU_TO_SECTION[sku]
    if (!target || !qty) continue
    next[target.field][target.label] = (next[target.field][target.label] || 0) + qty
  }
  return next
}

export default function Rounds({ stops, today, selectedDate, availableDates, mode = 'date', gcalError = null }) {
  const [date, setDate] = useState(selectedDate || today)
  const [sortKey, setSortKey] = useState('date-asc')
  const [states, setStates] = useState(() =>
    stops.map((stop) => ({
      status: 'pending', checkIn: null, checkOut: null,
      // Per-stop date so 'All Open' mode (multi-day) invoices the right service_date.
      date: stop.bookingDate || (stop.startTime ? new Date(stop.startTime).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) : selectedDate) || today,
      arrivalTime: '', departureTime: '',
      ...applyPrefill(stop.prefill),
      notes: '', photoUrl: null, videoUrl: null, submitting: false, error: null,
      showEmailModal: false, invoiceId: null, invoiceUrl: null, grandTotal: 0,
    }))
  )
  const [profileCustomer, setProfileCustomer] = useState(null)
  const [distances, setDistances] = useState({})

  const [distLoading, setDistLoading] = useState(false)
  function refreshDistances() {
    const addressable = stops.filter((s) => s.address)
    if (!addressable.length || !navigator.geolocation) return
    setDistLoading(true)
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const origin = `${pos.coords.latitude},${pos.coords.longitude}`
      try {
        const res = await fetch('/api/admin/distances', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin, addresses: addressable.map((s) => ({ id: s.email || s.customerName, address: s.address })) }),
        })
        setDistances(await res.json())
      } catch {}
      setDistLoading(false)
    }, () => setDistLoading(false), { enableHighAccuracy: true, timeout: 10000 })
  }
  useEffect(() => { refreshDistances() }, [stops]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Client-side invoice enrichment. In `date` mode the SSR skips the slow
  // per-stop Stripe lookups; we fetch them here after first paint so the
  // 🧾 invoice badges + "already invoiced" panel populate a beat later
  // without blocking the page. `open` mode already has existingInvoice from
  // SSR (it needs it to filter), so we skip the fetch there.
  const [invoiceByIdx, setInvoiceByIdx] = useState({})
  useEffect(() => {
    if (mode === 'open') return
    const payload = stops
      .map((s, i) => ({ key: String(i), email: s.email, calBookingUid: s.calBookingUid, serviceDate: s.bookingDate || selectedDate }))
      .filter((s) => s.email)
    if (payload.length === 0) return
    let cancelled = false
    fetch('/api/admin/stop-invoices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stops: payload }),
    })
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d?.invoices) setInvoiceByIdx(d.invoices) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [stops, mode, selectedDate])

  function update(idx, patch) {
    // patch can be a partial object or a functional updater (prev) => partial.
    // Functional form lets callers compute the patch from the freshest state
    // and avoids the stale-closure trap that otherwise loses sibling fields
    // (e.g. selecting Barrier dropping tankHookupOptIn=true on the floor).
    setStates((prev) => prev.map((s, i) => {
      if (i !== idx) return s
      const p = typeof patch === 'function' ? patch(s) : patch
      return { ...s, ...p }
    }))
  }

  function handleDateChange(e) {
    setDate(e.target.value)
    window.location.href = `/admin/rounds?date=${e.target.value}`
  }

  const doneCount = states.filter((s) => s.status === 'done').length
  const dateFmt = selectedDate ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''

  // Client-side sort indices for open mode. We keep `states` aligned by
  // original index so sort only reorders presentation.
  const displayOrder = (() => {
    if (mode !== 'open') return stops.map((_, i) => i)
    const idxs = stops.map((_, i) => i)
    idxs.sort((a, b) => {
      const sa = stops[a], sb = stops[b]
      switch (sortKey) {
        case 'date-desc': return new Date(sb.startTime || 0) - new Date(sa.startTime || 0)
        case 'name-asc':  return (sa.customerName || '').localeCompare(sb.customerName || '')
        case 'name-desc': return (sb.customerName || '').localeCompare(sa.customerName || '')
        case 'date-asc':
        default:          return new Date(sa.startTime || 0) - new Date(sb.startTime || 0)
      }
    })
    return idxs
  })()

  return (
    <>
      <Head><title>Rounds · GreenGuard USA</title></Head>
      <PortalLayout isAdmin>
        <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="tag">Admin</span>
            <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Rounds</h1>
            <p style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.45)', margin: 0 }}>
              {mode === 'open'
                ? `${stops.length} open round${stops.length === 1 ? '' : 's'} from the last 30 days`
                : `${dateFmt} · ${doneCount}/${stops.length} complete`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Mode tabs */}
            <div style={{ display: 'flex', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 8, overflow: 'hidden' }}>
              <a href={`/admin/rounds?date=${today}`}
                style={{ padding: '8px 14px', fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none',
                  background: mode === 'date' ? '#7dffaa' : 'transparent',
                  color: mode === 'date' ? '#0d1a10' : 'rgba(212,230,202,0.7)' }}>
                Today
              </a>
              <a href={`/admin/rounds?mode=open`}
                style={{ padding: '8px 14px', fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none',
                  background: mode === 'open' ? '#7dffaa' : 'transparent',
                  color: mode === 'open' ? '#0d1a10' : 'rgba(212,230,202,0.7)',
                  borderLeft: '1px solid rgba(122,171,130,0.25)' }}>
                All Open
              </a>
            </div>
            {mode === 'date' && (
              <>
                <select value={availableDates.includes(date) ? date : ''} onChange={handleDateChange}
                  style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(122,171,130,0.25)', background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '1.1rem', fontFamily: 'Inter, sans-serif', cursor: 'pointer', fontWeight: 700 }}>
                  <option value="" disabled>Quick pick…</option>
                  {availableDates.map((d) => {
                    const isToday = d === today
                    const isPast = d < today
                    const label = isToday ? `Today (${d})` : new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + (isPast ? ' — history' : '')
                    return <option key={d} value={d}>{label}</option>
                  })}
                </select>
                <input type="date" value={date} onChange={handleDateChange}
                  style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(122,171,130,0.25)', background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '1.1rem', fontFamily: 'Inter, sans-serif', cursor: 'pointer', colorScheme: 'dark', fontWeight: 700 }}
                />
              </>
            )}
            {mode === 'open' && (
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}
                style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(122,171,130,0.25)', background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '1.1rem', fontFamily: 'Inter, sans-serif', cursor: 'pointer', fontWeight: 700 }}>
                <option value="date-asc">Oldest first</option>
                <option value="date-desc">Newest first</option>
                <option value="name-asc">Name A→Z</option>
                <option value="name-desc">Name Z→A</option>
              </select>
            )}
            <button onClick={refreshDistances} disabled={distLoading}
              title="Recalculate driving distance from your current location to each stop"
              style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(91,196,255,0.35)', background: 'rgba(91,196,255,0.08)', color: '#5bc4ff', fontSize: '0.9rem', fontWeight: 800, fontFamily: 'Inter, sans-serif', cursor: distLoading ? 'wait' : 'pointer', opacity: distLoading ? 0.6 : 1 }}>
              {distLoading ? 'Locating…' : 'My Distance'}
            </button>
          </div>
        </div>

        {gcalError ? (
          <div style={{ background: 'rgba(255,80,80,0.06)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 12, padding: 24, textAlign: 'center' }}>
            <p style={{ color: '#ff8080', margin: '0 0 8px', fontSize: '1rem', fontWeight: 900 }}>⚠️ Google Calendar connection failed</p>
            <p style={{ color: 'rgba(212,230,202,0.55)', margin: '0 0 14px', fontSize: '0.82rem' }}>
              The Google OAuth token may have expired. Check Vercel env vars or re-run the token script.
            </p>
            <code style={{ display: 'block', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: 6, fontSize: '0.88rem', color: 'rgba(212,230,202,0.6)', marginBottom: 14 }}>{gcalError}</code>
            <a href="/api/admin/debug-rounds" target="_blank" style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid rgba(255,80,80,0.4)', color: '#ff8080', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700 }}>
              Run Diagnostics →
            </a>
          </div>
        ) : stops.length === 0 ? (
          <div style={{ background: 'linear-gradient(165deg, rgba(125,255,170,0.05), rgba(201,168,76,0.022))', border: '1px solid rgba(122,171,130,0.15)', borderRadius: 12, padding: 24, textAlign: 'center' }}>
            <p style={{ color: 'rgba(212,230,202,0.55)', margin: '0 0 14px', fontSize: '0.95rem', fontWeight: 700 }}>
              {mode === 'open'
                ? '✓ No open rounds in the last 30 days — everything is invoiced.'
                : `No appointments scheduled for ${dateFmt}.`}
            </p>
            {mode !== 'open' && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link href="/admin/calendar" style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid rgba(125,255,170,0.3)', color: '#7dffaa', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700 }}>
                  Open Calendar →
                </Link>
                <Link href="/admin/quote" style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700 }}>
                  Build a Quote →
                </Link>
              </div>
            )}
          </div>
        ) : (
          displayOrder.map((idx) => {
            // Merge client-fetched invoice (date mode) onto the stop. SSR
            // already set existingInvoice in open mode; prefer whichever exists.
            const baseStop = stops[idx]
            const stop = baseStop.existingInvoice !== undefined
              ? baseStop
              : { ...baseStop, existingInvoice: invoiceByIdx[String(idx)] ?? null }
            return (
              <div key={`${selectedDate || 'open'}-${idx}`} ref={(el) => { stopRefs.current[idx] = el }}>
                <RoundsStopCard stop={stop} idx={idx} state={states[idx]}
                  onUpdate={(patch) => update(idx, patch)} fileInputRef={fileRefs.current[idx]} videoInputRef={videoRefs.current[idx]}
                  onOpenProfile={setProfileCustomer}
                  distance={distances[stop.email || stop.customerName]} />
              </div>
            )
          })
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

      {/* Customer profile panel — slides in from right when a name is clicked */}
      {profileCustomer && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 199 }}
            onClick={() => setProfileCustomer(null)}
          />
          <CustomerPanel
            customer={profileCustomer}
            onClose={() => setProfileCustomer(null)}
          />
        </>
      )}
    </>
  )
}
