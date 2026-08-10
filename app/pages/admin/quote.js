import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { useToast, useConfirm } from '../../components/ui'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }

  return { props: { mapsKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '' } }
}

// ── Multi-select section (matches rounds page style) ──────────────────────────

function MultiSelect({ title, catalog, qtys, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const selectedItems = catalog.filter((item) => (qtys[item.label] || 0) > 0)
  const categories = [...new Set(catalog.map((i) => i.category).filter(Boolean))]
  const total = selectedItems.reduce((s, i) => s + ((qtys[i.label] || 0) * (i.price || 0)), 0)

  useEffect(() => {
    if (!open) return
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler) }
  }, [open])

  return (
    <div ref={ref} style={{ marginBottom: 16, position: 'relative' }}>
      {/* Section header — same style as rounds CatalogSection */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(var(--border-rgb),0.12)', marginBottom: 8 }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)' }}>{title}</span>
        {total > 0 && <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--green)' }}>${total.toFixed(2)}</span>}
      </div>

      {/* Selected items — inline rows matching rounds */}
      {selectedItems.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {selectedItems.map((item) => {
            const qty = qtys[item.label] || 0
            return (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', marginBottom: 4, borderRadius: 8, background: 'rgba(var(--green-rgb),0.06)', border: '1px solid rgba(var(--green-rgb),0.15)' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>{item.label}</span>
                  {item.price != null && (
                    <span style={{ marginLeft: 6, fontSize: '0.75rem', color: 'var(--green)' }}>
                      ${(item.price * qty).toFixed(2)}{!item.oneTime ? '/mo' : ''}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => onChange(item.label, Math.max(0, qty - 1))}
                    style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(var(--border-rgb),0.3)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, fontFamily: 'inherit' }}>−</button>
                  <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 900, color: 'var(--green)' }}>{qty}</span>
                  <button onClick={() => onChange(item.label, qty + 1)}
                    style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(var(--green-rgb),0.3)', background: 'rgba(var(--green-rgb),0.08)', color: 'var(--green)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, fontFamily: 'inherit' }}>+</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Dropdown trigger */}
      <button onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px dashed rgba(var(--border-rgb),0.3)', background: 'transparent', color: 'rgba(var(--text-rgb),0.85)', cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem', fontFamily: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{selectedItems.length > 0 ? `+ Add more ${title.toLowerCase()}` : `Select ${title.toLowerCase()}…`}</span>
        <span style={{ fontSize: '0.7rem' }}>{open ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{ position: 'absolute', left: 0, right: 0, zIndex: 60, background: 'var(--bg-card)', border: '1px solid rgba(var(--border-rgb),0.25)', borderRadius: 10, marginTop: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', maxHeight: 360, overflowY: 'auto' }}>
          <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid rgba(var(--border-rgb),0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'rgba(var(--text-rgb),0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{title}</span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(var(--text-rgb),0.45)', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, fontFamily: 'inherit' }}>×</button>
          </div>
          {categories.map((cat) => (
            <div key={cat}>
              <div style={{ padding: '8px 14px 4px', fontSize: '0.65rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(var(--text-rgb),0.55)', position: 'sticky', top: 0, background: 'var(--bg-card)' }}>{cat}</div>
              {catalog.filter((i) => i.category === cat).map((item) => {
                const qty = qtys[item.label] || 0
                const selected = qty > 0
                return (
                  <div key={item.label} onClick={() => !selected && onChange(item.label, 1)}
                    style={{ display: 'flex', alignItems: 'center', padding: '11px 14px', borderBottom: '1px solid rgba(var(--border-rgb),0.06)', cursor: selected ? 'default' : 'pointer', background: selected ? 'rgba(var(--green-rgb),0.05)' : 'transparent' }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${selected ? 'var(--green)' : 'rgba(var(--border-rgb),0.3)'}`, background: selected ? 'var(--green)' : 'transparent', marginRight: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: 'var(--text-on-accent)', fontWeight: 900 }}>
                      {selected ? '✓' : ''}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: selected ? 700 : 600, color: selected ? 'var(--text-muted)' : 'rgba(var(--text-rgb),0.9)' }}>{item.label}</div>
                      <div style={{ fontSize: '0.7rem', color: 'rgba(var(--text-rgb),0.3)', marginTop: 1 }}>
                        {item.price != null
                          ? <span style={{ color: 'var(--green)' }}>${item.price.toFixed(2)}{!item.oneTime ? '/mo' : ''}</span>
                          : <span style={{ color: 'rgba(var(--gold-rgb),0.5)' }}>price TBD</span>}
                      </div>
                    </div>
                    {selected && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => onChange(item.label, Math.max(0, qty - 1))}
                          style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(var(--border-rgb),0.3)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.95rem', lineHeight: 1, fontFamily: 'inherit' }}>−</button>
                        <span style={{ minWidth: 16, textAlign: 'center', fontWeight: 900, color: 'var(--green)', fontSize: '0.9rem' }}>{qty}</span>
                        <button onClick={() => onChange(item.label, qty + 1)}
                          style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(var(--green-rgb),0.3)', background: 'rgba(var(--green-rgb),0.08)', color: 'var(--green)', cursor: 'pointer', fontSize: '0.95rem', lineHeight: 1, fontFamily: 'inherit' }}>+</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
          <div style={{ padding: '10px 14px', textAlign: 'center' }}>
            <button onClick={() => setOpen(false)} style={{ padding: '8px 24px', borderRadius: 6, border: 'none', background: 'var(--green)', color: 'var(--text-on-accent)', fontWeight: 900, fontSize: '0.85rem', fontFamily: 'inherit', cursor: 'pointer' }}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Customer autocomplete ──────────────────────────────────────────────────────

function CustomerSearch({ onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) { setResults([]); setLoading(false); return undefined }
    let alive = true
    setLoading(true)
    const timer = setTimeout(() => {
      fetch(`/api/admin/customer-search?q=${encodeURIComponent(trimmed)}`)
        .then((r) => r.ok ? r.json() : Promise.reject(new Error('Search failed')))
        .then((d) => { if (alive) setResults(d.customers || []) })
        .catch(() => { if (alive) setResults([]) })
        .finally(() => { if (alive) setLoading(false) })
    }, 300)
    return () => { alive = false; clearTimeout(timer) }
  }, [query])

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(var(--text-rgb),0.45)', marginBottom: 4 }}>
        Find Customer or Prospect
      </label>
      <input
        type="text"
        placeholder="Type name or email to search…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        style={{ width: '100%', padding: '9px 12px', boxSizing: 'border-box', border: '1px solid rgba(var(--border-rgb),0.25)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.88rem', fontFamily: 'inherit' }}
      />
      {open && loading && <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid rgba(var(--border-rgb),0.25)', borderRadius: 8, zIndex: 50, marginTop: 4, fontSize: '0.78rem', color: 'var(--text-muted)' }}>Searching…</div>}
      {open && !loading && results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid rgba(var(--border-rgb),0.25)', borderRadius: 8, zIndex: 50, maxHeight: 240, overflowY: 'auto', marginTop: 4 }}>
          {results.map((c) => (
            <div key={c.id} onClick={() => { onSelect(c); setQuery(''); setOpen(false) }}
              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(var(--border-rgb),0.08)' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(var(--border-rgb),0.08)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.88rem' }}>
                {c.name || c.email}
                {c.source === 'prospect' && (
                  <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.08em', background: 'rgba(var(--info-rgb),0.15)', color: 'var(--info)', borderRadius: 4, padding: '1px 5px' }}>PROSPECT</span>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'rgba(var(--text-rgb),0.45)' }}>{c.email}{c.address ? ` · ${c.address}` : ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Per-trap pricing for Biogents CO₂ rental
// Biogents CO₂ rental packages — 1–6 traps. Volume discount kicks in at 4.
const BG_RENTAL_PRICE = { 1: 159.99, 2: 266.99, 3: 399.99, 4: 500, 5: 625, 6: 750, 7: 875, 8: 1000, 9: 1125, 10: 1250 }
// Hookup fee per trap for Biogents owned on tank service, or tank-only customers
const BG_HOOKUP_PER_TRAP = 10.00
// Biogents Non-CO₂ (customer owns trap)
const BG_NONCO2_PER_TRAP = 10.00
// Starter package — we rent the non-CO₂ trap (no tanks), per trap
const STARTER_NONCO2_PER_TRAP = 49.99
// Mosqitter — $129.99 all-in (tank hookup, bait, maintenance included)
const MQ_PRICE = { rental: 299.99, service: 129.99, install: 199.99 }
// CO₂ tank exchange — 20lb tanks only ($39 delivery + $49.99/tank)
const TANK_PRICE = { 1: 89.99, 2: 139.99, 3: 189.99 }

// Products catalog (one-time purchases only)
// Products + service-addon catalog pulled from the shared lib/catalog so
// rounds + inventory stay aligned. Service-specific one-time entries
// (installs, maintenance, troubleshoot) stay local to quote since they
// aren't surfaced elsewhere.
const { productsForQuote, addonsForQuote } = require('../../lib/catalog')
const PRODUCTS = productsForQuote()
const QUOTE_LOCAL_SERVICES = [
  { label: 'Trap Installation',           price:  80.00, category: 'One-Time Services' },
  { label: 'Timer Installation',          price:  29.99, category: 'One-Time Services' },
  { label: 'Trap Maintenance (1 trap)',   price:  10.00, category: 'One-Time Services' },
  { label: 'Trap Maintenance (2 traps)', price:  20.00, category: 'One-Time Services' },
  { label: 'Trap Maintenance (3 traps)', price:  30.00, category: 'One-Time Services' },
  { label: 'Assessment',                  price:   0.00, category: 'One-Time Services' },
  { label: 'Troubleshoot',               price:  79.99, category: 'One-Time Services' },
]
const SERVICE_ADDONS = [...addonsForQuote(), ...QUOTE_LOCAL_SERVICES]

// ── Guided service configurator ────────────────────────────────────────────────

// Earliest service date allowed = today + 5 days (ISO YYYY-MM-DD in local TZ)
function minServiceDate() {
  const d = new Date()
  d.setDate(d.getDate() + 5)
  return d.toLocaleDateString('en-CA')
}

function SystemIcon({ iconPath, emoji }) {
  const [failed, setFailed] = useState(false)
  const showEmoji = !iconPath || failed
  return (
    <div style={{ width: 48, height: 48, borderRadius: 8, background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
      {showEmoji ? (
        <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{emoji}</span>
      ) : (
        <img
          src={iconPath}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}

function ServiceConfigurator({ onChange, onConfigChange }) {
  const [system, setSystem] = useState(null)        // 'biogents-co2' | 'biogents-nonco2' | 'mosqitter' | 'tank' | 'none'
  const [plan, setPlan] = useState(null)            // 'rental' | 'purchase'
  const [trapCount, setTrapCount] = useState(1)
  const [onTankService, setOnTankService] = useState(null)
  const [mqPlan, setMqPlan] = useState(null)        // 'rental' | 'purchase'
  const [mqCount, setMqCount] = useState(1)
  const [mqInstall, setMqInstall] = useState(false)
  const [tankCount, setTankCount] = useState(2)
  const [tankHookup, setTankHookup] = useState(false)
  const [serviceDate, setServiceDate] = useState('')
  const minDate = minServiceDate()

  useEffect(() => {
    const lines = []

    // Biogents CO₂ customer rental
    if (system === 'biogents-co2' && plan === 'rental' && trapCount) {
      const price = BG_RENTAL_PRICE[trapCount]
      lines.push({ label: `Biogents CO₂ Customer Rental — ${trapCount} Trap${trapCount > 1 ? 's' : ''} ($${(price / trapCount).toFixed(2)}/trap)`, amount: price, recurring: true })
    }
    // Biogents CO₂ purchase — combine tank delivery + hookup into one line
    if (system === 'biogents-co2' && plan === 'purchase' && onTankService === true) {
      const tankPrice = TANK_PRICE[trapCount] || (TANK_PRICE[3] + (trapCount - 3) * 49.99)
      const hookupPrice = BG_HOOKUP_PER_TRAP * trapCount
      const combinedPrice = tankPrice + hookupPrice
      lines.push({
        label: `CO₂ Tank Exchange — ${trapCount}× 20lb Tank${trapCount > 1 ? 's' : ''} (includes hookup & maintenance)`,
        amount: combinedPrice,
        recurring: true,
      })
    }
    // Biogents Non-CO₂ — starter rental (we own the trap) or customer-owned maintenance
    if (system === 'biogents-nonco2' && trapCount) {
      if (plan === 'rental') {
        lines.push({ label: `Starter Non-CO₂ Trap Rental — ${trapCount} Trap${trapCount > 1 ? 's' : ''} ($${STARTER_NONCO2_PER_TRAP}/trap)`, amount: STARTER_NONCO2_PER_TRAP * trapCount, recurring: true })
      } else {
        lines.push({ label: `Biogents Non-CO₂ Maintenance — ${trapCount} Trap${trapCount > 1 ? 's' : ''} ($${BG_NONCO2_PER_TRAP}/trap)`, amount: BG_NONCO2_PER_TRAP * trapCount, recurring: true })
      }
    }
    // Mosqitter
    if (system === 'mosqitter' && mqPlan) {
      const unitPrice = mqPlan === 'rental' ? MQ_PRICE.rental : MQ_PRICE.service
      const label = mqPlan === 'rental'
        ? `Mosqitter Grand Customer Rental ×${mqCount} — trap, hookup, bait & maintenance`
        : `Mosqitter Service ×${mqCount} — hookup, bait & maintenance included`
      lines.push({ label, amount: unitPrice * mqCount, recurring: true })
      if (mqInstall) lines.push({ label: `Mosqitter Installation ×${mqCount}`, amount: MQ_PRICE.install * mqCount, recurring: false })
    }
    // Tank delivery — combine tank exchange + hookup into one line
    if (system === 'tank' && TANK_PRICE[tankCount]) {
      const tankPrice = TANK_PRICE[tankCount]
      const hookupPrice = tankHookup ? (BG_HOOKUP_PER_TRAP * tankCount) : 0
      lines.push({
        label: tankHookup
          ? `CO₂ Tank Exchange — ${tankCount}× 20lb Tank${tankCount > 1 ? 's' : ''} (includes hookup & maintenance)`
          : `CO₂ Tank Exchange — ${tankCount}× 20lb Tank${tankCount > 1 ? 's' : ''} ($39 delivery + $49.99/tank)`,
        amount: tankPrice + hookupPrice,
        recurring: true,
      })
    }
    onChange(lines)
    if (onConfigChange) onConfigChange({ system, plan, trapCount, mqPlan, mqCount, serviceDate })
  }, [system, plan, trapCount, onTankService, mqPlan, mqCount, mqInstall, tankCount, tankHookup, serviceDate])

  // Reset date and clamp if user picks earlier than min
  useEffect(() => {
    if (serviceDate && serviceDate < minDate) setServiceDate('')
  }, [serviceDate, minDate])

  const Q = { fontSize: '0.82rem', fontWeight: 800, color: 'rgba(var(--text-rgb),0.7)', marginBottom: 8, marginTop: 16 }
  const chip = (active) => ({ display: 'inline-block', padding: '7px 16px', borderRadius: 20, border: `1px solid ${active ? 'rgba(var(--green-rgb),0.5)' : 'rgba(var(--border-rgb),0.2)'}`, background: active ? 'rgba(var(--green-rgb),0.1)' : 'transparent', color: active ? 'var(--green)' : 'rgba(var(--text-rgb),0.5)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', marginRight: 8, marginBottom: 8, userSelect: 'none', transition: 'all 0.12s' })
  const trapSelect = { padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(var(--border-rgb),0.3)', background: 'var(--bg-card)', color: 'var(--green)', fontWeight: 900, fontSize: '1rem', cursor: 'pointer', fontFamily: 'inherit', appearance: 'auto' }

  return (
    <div>
      {/* Q1: System */}
      <div style={Q}>What system for service?</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { val: 'biogents-co2',    label: 'Biogents CO₂',                              icon: '/system-icons/biogents-co2.jpg',    emoji: '🦟' },
          { val: 'biogents-nonco2', label: 'Biogents Non-CO₂',                          icon: '/system-icons/biogents-nonco2.webp', emoji: '🪤' },
          { val: 'mosqitter',       label: 'Mosqitter Grand',                           icon: '/system-icons/mosqitter.jpg',       emoji: '⚙️' },
          { val: 'tank',            label: 'CO₂ Tank Delivery Only',                    icon: '/system-icons/tank.jpeg',            emoji: '🛢️' },
          { val: 'none',            label: 'No Service — Equipment & Add-Ons Only',     icon: null,                                emoji: '🛒' },
        ].map(({ val, label, icon, emoji }) => {
          const active = system === val
          return (
            <div
              key={val}
              onClick={() => { setSystem(val); setPlan(null); setOnTankService(null); setMqPlan(null); setMqInstall(false); setTankHookup(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px', borderRadius: 10,
                border: `1px solid ${active ? 'rgba(var(--green-rgb),0.5)' : 'rgba(var(--border-rgb),0.2)'}`,
                background: active ? 'rgba(var(--green-rgb),0.08)' : 'rgba(0,0,0,0.02)',
                color: active ? 'var(--green)' : 'rgba(var(--text-rgb),0.75)',
                fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                userSelect: 'none', transition: 'all 0.12s', width: '100%', boxSizing: 'border-box',
              }}
            >
              <SystemIcon iconPath={icon} emoji={emoji} />
              <span style={{ flex: 1 }}>{label}</span>
              {active && <span style={{ fontSize: '1.2rem' }}>✓</span>}
            </div>
          )
        })}
      </div>

      {system === 'none' && (
        <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 8, background: 'rgba(var(--info-rgb),0.06)', border: '1px solid rgba(var(--info-rgb),0.2)', fontSize: '0.82rem', color: 'rgba(var(--text-rgb),0.7)', lineHeight: 1.5 }}>
          No recurring service selected. Use the <strong>Add-Ons</strong> and <strong>Products</strong> sections below to build a one-time equipment-only quote.
        </div>
      )}

      {/* Q2: Biogents CO₂ — rental or purchase */}
      {system === 'biogents-co2' && (
        <>
          <div style={Q}>Customer Rental or Purchase?</div>
          <div>
            <span onClick={() => { setPlan('rental'); setOnTankService(null) }} style={chip(plan === 'rental')}>📅 Customer Rental — we provide the trap, tank, timer, bait pack, and CO₂ refill</span>
            <span onClick={() => setPlan('purchase')} style={chip(plan === 'purchase')}>🛒 Purchase — customer buys the trap</span>
          </div>
        </>
      )}

      {/* Q3: Biogents CO₂ — trap count */}
      {system === 'biogents-co2' && plan && (
        <>
          <div style={Q}>How many traps?</div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <select value={trapCount} onChange={(e) => setTrapCount(parseInt(e.target.value, 10))} style={trapSelect}>
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            {plan === 'rental' && BG_RENTAL_PRICE[trapCount] && (
              <span style={{ fontSize: '0.85rem', color: 'var(--green)', fontWeight: 900, marginLeft: 14 }}>
                ${BG_RENTAL_PRICE[trapCount].toFixed(2)}/mo
                <span style={{ fontSize: '0.72rem', color: 'rgba(var(--text-rgb),0.4)', marginLeft: 6 }}>(${(BG_RENTAL_PRICE[trapCount] / trapCount).toFixed(2)}/trap)</span>
              </span>
            )}
            {plan === 'owned' && (
              <span style={{ fontSize: '0.78rem', color: 'rgba(var(--text-rgb),0.45)', marginLeft: 14 }}>Hookup fee applies if on tank service</span>
            )}
          </div>
        </>
      )}

      {/* Q4: Biogents CO₂ purchase — on tank service? */}
      {system === 'biogents-co2' && plan === 'purchase' && trapCount && (
        <>
          <div style={Q}>Are they on CO₂ tank service with us?</div>
          <div>
            <span onClick={() => setOnTankService(true)} style={chip(onTankService === true)}>Yes — add hookup &amp; maintenance fee</span>
            <span onClick={() => setOnTankService(false)} style={chip(onTankService === false)}>No — customer self-manages</span>
          </div>
          {onTankService === true && (
            <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'rgba(var(--gold-rgb),0.7)', padding: '8px 12px', borderRadius: 6, background: 'rgba(var(--gold-rgb),0.06)', border: '1px solid rgba(var(--gold-rgb),0.15)' }}>
              $10/trap/mo × {trapCount} trap{trapCount > 1 ? 's' : ''} = ${(BG_HOOKUP_PER_TRAP * trapCount).toFixed(2)}/mo
            </div>
          )}
        </>
      )}

      {/* Biogents Non-CO₂ — starter rental or customer-owned */}
      {system === 'biogents-nonco2' && (
        <>
          <div style={Q}>Starter Rental or Customer-Owned?</div>
          <div>
            <span onClick={() => setPlan('rental')} style={chip(plan === 'rental')}>🌱 Starter Rental — we provide the trap, attractant &amp; maintenance ($49.99/trap/mo)</span>
            <span onClick={() => setPlan('purchase')} style={chip(plan === 'purchase')}>🛒 Customer-Owned — maintenance only ($10/trap/mo)</span>
          </div>
        </>
      )}
      {system === 'biogents-nonco2' && plan && (
        <>
          <div style={Q}>How many traps?</div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <select value={trapCount} onChange={(e) => setTrapCount(parseInt(e.target.value, 10))} style={trapSelect}>
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span style={{ fontSize: '0.85rem', color: 'var(--green)', fontWeight: 900, marginLeft: 14 }}>
              ${((plan === 'rental' ? STARTER_NONCO2_PER_TRAP : BG_NONCO2_PER_TRAP) * trapCount).toFixed(2)}/mo
              <span style={{ fontSize: '0.72rem', color: 'rgba(var(--text-rgb),0.4)', marginLeft: 6 }}>(${plan === 'rental' ? STARTER_NONCO2_PER_TRAP : BG_NONCO2_PER_TRAP}/trap — no CO₂ tanks)</span>
            </span>
          </div>
        </>
      )}

      {/* Mosqitter plan */}
      {system === 'mosqitter' && (
        <>
          <div style={Q}>Customer Rental or Purchase?</div>
          <div>
            <span onClick={() => setMqPlan('rental')} style={chip(mqPlan === 'rental')}>📅 Customer Rental — ${MQ_PRICE.rental}/mo · all-in</span>
            <span onClick={() => setMqPlan('purchase')} style={chip(mqPlan === 'purchase')}>🛒 Purchase — ${MQ_PRICE.service}/mo · service only</span>
          </div>
          {mqPlan && (
            <>
              <div style={Q}>How many units?</div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <select value={mqCount} onChange={(e) => setMqCount(parseInt(e.target.value, 10))} style={trapSelect}>
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span style={{ fontSize: '0.82rem', color: 'var(--green)', fontWeight: 900, marginLeft: 14 }}>
                  ${((mqPlan === 'rental' ? MQ_PRICE.rental : MQ_PRICE.service) * mqCount).toFixed(2)}/mo
                </span>
              </div>
              <div style={Q}>Installation needed?</div>
              <div>
                <span onClick={() => setMqInstall(true)} style={chip(mqInstall)}>Yes — +${(MQ_PRICE.install * mqCount).toFixed(2)} one-time</span>
                <span onClick={() => setMqInstall(false)} style={chip(!mqInstall)}>No</span>
              </div>
            </>
          )}
        </>
      )}

      {/* Tank delivery — count + hookup */}
      {system === 'tank' && (
        <>
          <div style={Q}>How many tanks per delivery?</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(TANK_PRICE).map(([n, price]) => (
              <span key={n} onClick={() => setTankCount(Number(n))} style={{ ...chip(tankCount === Number(n)), padding: '7px 14px', textAlign: 'center' }}>
                {n} tank{Number(n) > 1 ? 's' : ''}<br/>
                <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>${price.toFixed(2)}/mo</span>
              </span>
            ))}
          </div>
          <div style={Q}>Add tank hookup &amp; maintenance?</div>
          <div>
            <span onClick={() => setTankHookup(true)} style={chip(tankHookup)}>Yes — +$10/tank/mo</span>
            <span onClick={() => setTankHookup(false)} style={chip(!tankHookup)}>No</span>
          </div>
          {tankHookup && (
            <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'rgba(var(--gold-rgb),0.7)', padding: '8px 12px', borderRadius: 6, background: 'rgba(var(--gold-rgb),0.06)', border: '1px solid rgba(var(--gold-rgb),0.15)' }}>
              $10/tank/mo × {tankCount} tank{tankCount > 1 ? 's' : ''} = ${(BG_HOOKUP_PER_TRAP * tankCount).toFixed(2)}/mo added
            </div>
          )}
        </>
      )}

      {/* Service date — required for any real service (not for equipment-only) */}
      {system && system !== 'none' && (
        <>
          <div style={{ ...Q, marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(var(--border-rgb),0.12)' }}>Preferred service date</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            <input
              type="date"
              value={serviceDate}
              min={minDate}
              onChange={(e) => setServiceDate(e.target.value)}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: `1px solid ${serviceDate ? 'rgba(var(--green-rgb),0.4)' : 'rgba(var(--gold-rgb),0.4)'}`, background: 'var(--bg-card)', color: 'var(--text)', fontSize: '1rem', fontFamily: 'inherit', minHeight: 48, WebkitAppearance: 'none', appearance: 'none', boxSizing: 'border-box' }}
            />
            <span style={{ fontSize: '0.78rem', color: 'rgba(var(--text-rgb),0.5)' }}>
              Earliest available: {new Date(minDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} (5-day lead time)
            </span>
          </div>
          {!serviceDate && (
            <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--gold)', fontWeight: 700 }}>
              ⚠ Pick a service date before sending the quote.
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function QuoteBuilder({ mapsKey }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [serviceLines, setServiceLines] = useState([])
  const [productQtys, setProductQtys] = useState({})
  const [addonQtys, setAddonQtys] = useState({})
  const [serviceConfig, setServiceConfig] = useState(null)
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)
  const [checkoutError, setCheckoutError] = useState(null)
  const taxRate = 8.25
  // 'auto' = auto-calculate per-item rates, 'free' = local delivery (waive shipping), 'none' = no shippable items
  const [shippingMode, setShippingMode] = useState('auto')
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapPin, setMapPin] = useState(null)
  const [machPins, setMachPins] = useState([])
  const [placingPin, setPlacingPin] = useState(false)
  const [mapView, setMapView] = useState('satellite') // 'satellite' | 'street'
  const streetRef = useRef(null)
  const streetObj = useRef(null)
  const mapRef = useRef(null)
  const mapObj = useRef(null)
  const pinRef = useRef(null)
  const geocodeTimer = useRef(null)
  const machPinMarkersRef = useRef(new Map())
  const placingPinRef = useRef(false)

  // Load Maps API script once
  useEffect(() => {
    if (!mapsKey) return
    if (window.google?.maps) { setMapLoaded(true); return }
    if (document.querySelector('script[data-gg-maps]')) {
      const poll = setInterval(() => { if (window.google?.maps) { setMapLoaded(true); clearInterval(poll) } }, 100)
      return () => clearInterval(poll)
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=marker`
    script.setAttribute('data-gg-maps', '1')
    script.async = true
    script.onload = () => setMapLoaded(true)
    document.head.appendChild(script)
  }, [mapsKey])

  // Initialize satellite map once script is ready
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || mapObj.current) return
    mapObj.current = new window.google.maps.Map(mapRef.current, {
      center: { lat: 30.2672, lng: -97.7431 },
      zoom: 15,
      mapTypeId: 'satellite',
      mapId: 'DEMO_MAP_ID',
      tilt: 0,
      disableDefaultUI: true,
      zoomControl: true,
      scaleControl: true,
    })
    pinRef.current = new window.google.maps.marker.AdvancedMarkerElement({
      position: { lat: 30.2672, lng: -97.7431 },
      gmpDraggable: true,
    })
    mapObj.current.addListener('click', (e) => {
      if (!placingPinRef.current) return
      const lat = e.latLng.lat()
      const lng = e.latLng.lng()
      setMachPins((prev) => [...prev, { id: Date.now(), lat, lng }])
      setPlacingPin(false)
    })
  }, [mapLoaded])

  // Keep placingPinRef in sync so the map click listener reads current state
  useEffect(() => { placingPinRef.current = placingPin }, [placingPin])

  // Initialize Street View panorama lazily when user switches to it
  useEffect(() => {
    if (!mapLoaded || mapView !== 'street' || !streetRef.current || streetObj.current) return
    const pos = mapPin || { lat: 30.2672, lng: -97.7431 }
    streetObj.current = new window.google.maps.StreetViewPanorama(streetRef.current, {
      position: pos,
      pov: { heading: 0, pitch: 0 },
      zoom: 1,
      addressControl: false,
      fullscreenControl: false,
      enableCloseButton: false,
    })
  }, [mapLoaded, mapView, mapPin])

  // When the pin moves, sync Street View position too
  useEffect(() => {
    if (!mapPin || !streetObj.current) return
    streetObj.current.setPosition(mapPin)
  }, [mapPin])

  // Update map cursor during placement mode
  useEffect(() => {
    if (!mapObj.current) return
    mapObj.current.setOptions({ draggableCursor: placingPin ? 'crosshair' : null })
  }, [placingPin])

  // Sync machine pin markers to Google Maps
  useEffect(() => {
    if (!mapObj.current) return
    machPinMarkersRef.current.forEach((marker) => { marker.map = null })
    machPinMarkersRef.current.clear()
    machPins.forEach((pin, idx) => {
      const pinEl = new window.google.maps.marker.PinElement({
        // Google Maps marker styling requires resolved literals, not CSS variables.
        background: '#176f2b',
        borderColor: '#444746',
        glyphColor: '#ffffff',
        glyph: String(idx + 1),
        scale: 1.1,
      })
      const marker = new window.google.maps.marker.AdvancedMarkerElement({
        position: { lat: pin.lat, lng: pin.lng },
        map: mapObj.current,
        title: `Trap ${idx + 1}`,
        gmpDraggable: true,
        content: pinEl.element,
      })
      marker.addListener('gmpDragend', () => {
        const pos = marker.position
        setMachPins((prev) => prev.map((p) => p.id === pin.id ? { ...p, lat: pos.lat, lng: pos.lng } : p))
      })
      machPinMarkersRef.current.set(pin.id, marker)
    })
  }, [machPins])

  // Debounce geocode when address changes
  useEffect(() => {
    clearTimeout(geocodeTimer.current)
    if (!mapLoaded || !customerAddress || customerAddress.length < 6) return
    geocodeTimer.current = setTimeout(() => {
      new window.google.maps.Geocoder().geocode({ address: customerAddress }, (results, status) => {
        if (status === 'OK' && results[0]) {
          const loc = results[0].geometry.location
          setMapPin({ lat: loc.lat(), lng: loc.lng() })
        }
      })
    }, 700)
    return () => clearTimeout(geocodeTimer.current)
  }, [customerAddress, mapLoaded])

  // Pan to pin when geocode resolves + auto-select shipping mode by distance
  useEffect(() => {
    if (!mapPin || !mapObj.current || !pinRef.current) return
    pinRef.current.position = mapPin
    pinRef.current.map = mapObj.current
    mapObj.current.panTo(mapPin)
    mapObj.current.setZoom(19)

    // Haversine distance from depot (1519 Parkway, Austin TX 78703)
    const DEPOT = { lat: 30.2872, lng: -97.7557 }
    const R = 3958.8
    const dLat = (mapPin.lat - DEPOT.lat) * Math.PI / 180
    const dLng = (mapPin.lng - DEPOT.lng) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(DEPOT.lat * Math.PI / 180) * Math.cos(mapPin.lat * Math.PI / 180)
      * Math.sin(dLng / 2) ** 2
    const miles = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    setShippingMode(miles <= 50 ? 'free' : 'auto')
  }, [mapPin])

  async function copyQuoteLink() {
    const res = await fetch('/api/admin/quote-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerName, customerEmail, customerAddress, serviceLines, addonLines, productLines, total: subtotal, recurringTotal, oneTimeTotal, taxRate: taxRate, taxAmount, shippingTotal, machPins: machPins.map(({ lat, lng }) => ({ lat, lng })), serviceDate: serviceConfig?.serviceDate || null, notes }),
    })
    const { url } = await res.json()
    await navigator.clipboard.writeText(url).catch(() => confirm({ title: 'Copy this link', input: { defaultValue: url }, confirmLabel: 'Done', alert: true }))
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 4000)
  }

  async function payNow() {
    setCheckingOut(true)
    setCheckoutError(null)
    try {
      // Generate the quote token first
      const linkRes = await fetch('/api/admin/quote-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerName, customerEmail, customerAddress, serviceLines, addonLines, productLines, total: subtotal, recurringTotal, oneTimeTotal, taxRate, taxAmount, shippingTotal, notes }),
      })
      const { token } = await linkRes.json()
      if (!token) throw new Error('Could not generate quote token')
      // Send token to checkout
      const checkRes = await fetch('/api/quote/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await checkRes.json()
      if (data.url) {
        window.open(data.url, '_blank')
      } else {
        throw new Error(data.error || 'Checkout failed')
      }
    } catch (e) {
      setCheckoutError(e.message)
    } finally {
      setCheckingOut(false)
    }
  }

  function handleSelectCustomer(c) {
    setCustomerName(c.name); setCustomerEmail(c.email)
    setCustomerPhone(c.phone); setCustomerAddress(c.address)
  }

  function setQty(setter, label, n) {
    setter((prev) => {
      const result = { ...prev }
      if (n <= 0) delete result[label]; else result[label] = n
      return result
    })
  }

  // Auto-populate products when service config changes (quote page only)
  // Rentals include everything in the monthly fee — never auto-add equipment or addons for them
  useEffect(() => {
    if (!serviceConfig) return
    const { system, plan, trapCount, mqPlan, mqCount } = serviceConfig
    const isBiogentsPurchase = (system === 'biogents-co2' && plan === 'purchase') || (system === 'biogents-nonco2' && plan !== 'rental')
    const isMosqitterPurchase = system === 'mosqitter' && mqPlan === 'purchase'

    setProductQtys((prev) => {
      const next = { ...prev }
      // Clear previous auto-adds
      delete next['Biogents BG-Mosquitaire']
      delete next['Biogents Timer']
      delete next['Mosqitter Grand']
      delete next['CO₂ Tank — 20lb (empty)']
      // Only auto-add purchased equipment — rentals include hardware in monthly fee
      if (isBiogentsPurchase && trapCount > 0) {
        next['Biogents BG-Mosquitaire'] = trapCount
        if (system === 'biogents-co2') {
          // Timer + tank only apply to CO₂ systems; Non-CO₂ traps never use a timer
          next['Biogents Timer'] = trapCount
          next['CO₂ Tank — 20lb (empty)'] = trapCount
        }
      } else if (isMosqitterPurchase) {
        next['Mosqitter Grand'] = mqCount || 1
      }
      return next
    })
    // Auto-populate add-ons (bait packs per trap) — only for purchased Biogents systems
    setAddonQtys((prev) => {
      const next = { ...prev }
      delete next['Generic Bait Pack']
      if (isBiogentsPurchase && trapCount > 0) {
        next['Generic Bait Pack'] = trapCount
      }
      return next
    })
  }, [serviceConfig])

  const productLines = PRODUCTS.filter((p) => productQtys[p.label] > 0).map((p) => ({
    label: productQtys[p.label] > 1 ? `${p.label} ×${productQtys[p.label]}` : p.label,
    amount: p.price != null ? p.price * productQtys[p.label] : null,
    recurring: false,
  }))
  const addonLines = SERVICE_ADDONS.filter((a) => addonQtys[a.label] > 0).map((a) => ({
    label: addonQtys[a.label] > 1 ? `${a.label} ×${addonQtys[a.label]}` : a.label,
    amount: a.price != null ? a.price * addonQtys[a.label] : null,
    recurring: a.category === 'Recurring Add-Ons',
  }))

  // Shipping — per-unit cost on shippable products only (Biogents traps, Mosqitter, CO₂ tank)
  const rawShipping = PRODUCTS
    .filter((p) => p.shipping > 0 && productQtys[p.label] > 0)
    .reduce((sum, p) => sum + p.shipping * productQtys[p.label], 0)
  // 'auto' uses per-item rates; 'free' waives shipping (local delivery); 'none' or no items = 0
  const shippingTotal = shippingMode === 'auto' ? rawShipping : 0

  const allLines = [...serviceLines, ...productLines, ...addonLines]
  const recurringTotal = allLines.filter((l) => l.recurring).reduce((s, l) => s + (l.amount || 0), 0)
  const oneTimeTotal = allLines.filter((l) => !l.recurring).reduce((s, l) => s + (l.amount || 0), 0)
  const subtotal = recurringTotal + oneTimeTotal
  const taxAmount = taxRate > 0 ? Math.round(subtotal * taxRate) / 100 : 0
  const grandTotal = subtotal + taxAmount + shippingTotal
  const hasRecurring = serviceLines.some((l) => l.recurring)
  const hasOneTime = allLines.some((l) => !l.recurring)

  async function sendQuote() {
    if (!customerEmail) return
    // Service date is required when this quote includes any real service (not equipment-only)
    if (serviceConfig?.system && serviceConfig.system !== 'none' && !serviceConfig.serviceDate) {
      toast.error('Pick a preferred service date (at least 5 days out) before sending the quote.')
      return
    }
    setSending(true)
    await fetch('/api/admin/send-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: customerEmail, name: customerName, customerAddress, lineItems: allLines, serviceLines, addonLines, productLines, total: subtotal, recurringTotal, oneTimeTotal, taxRate: taxRate, taxAmount, serviceDate: serviceConfig?.serviceDate || null, notes, machPins: machPins.map(({ lat, lng }) => ({ lat, lng })) }),
    })
    setSending(false); setSent(true)
    setTimeout(() => setSent(false), 5000)
  }

  const input = { width: '100%', padding: '9px 12px', boxSizing: 'border-box', border: '1px solid rgba(var(--border-rgb),0.25)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.88rem', fontFamily: 'inherit' }
  const lbl = { display: 'block', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(var(--text-rgb),0.45)', marginBottom: 4 }

  return (
    <>
      <Head><title>Quote Builder · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin>
        <div style={{ marginBottom: 24 }}>
          <span className="tag">Admin</span>
          <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Quote Builder</h1>
          <p style={{ fontSize: '0.85rem', color: 'rgba(var(--text-rgb),0.45)', margin: 0 }}>Build and email a service quote to a customer</p>
        </div>

        <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 28, alignItems: 'start' }}>
          <div>
            {/* Customer */}
            <CustomerSearch onSelect={handleSelectCustomer} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 4 }}>
              <div><label style={lbl}>Name</label><input style={input} placeholder="Full name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></div>
              <div><label style={lbl}>Email</label><input style={input} type="email" placeholder="customer@email.com" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} /></div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={lbl}>Property Address</label>
              <input style={input} placeholder="123 Oak St, Austin TX 78701" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
              {mapsKey && (
                <>
                  <div style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden', border: `1px solid ${placingPin ? 'rgba(var(--gold-rgb),0.5)' : 'rgba(var(--border-rgb),0.2)'}`, height: 360, position: 'relative', transition: 'border-color 0.15s' }}>
                    {/* Satellite map — always mounted so it keeps its state */}
                    <div ref={mapRef} style={{ height: '100%', width: '100%', display: mapView === 'satellite' ? 'block' : 'none' }} />
                    {/* Street view — mounted on first switch */}
                    {mapView === 'street' && (
                      <div ref={streetRef} style={{ height: '100%', width: '100%' }} />
                    )}
                    {!mapPin && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)', color: 'var(--text-dim)', fontSize: '0.8rem', fontWeight: 600, pointerEvents: 'none' }}>
                        Type an address to see {mapView === 'satellite' ? 'satellite' : 'street'} view
                      </div>
                    )}
                    {placingPin && mapView === 'satellite' && (
                      <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', background: 'rgba(var(--gold-rgb),0.9)', color: 'var(--text-on-accent)', padding: '5px 14px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 800, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                        Click map to place trap
                      </div>
                    )}
                    {/* Satellite / Street toggle */}
                    {mapPin && (
                      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.3)', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
                        <button onClick={() => setMapView('satellite')}
                          style={{ padding: '5px 12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.72rem', background: mapView === 'satellite' ? 'var(--gold)' : 'var(--bg-card)', color: mapView === 'satellite' ? 'var(--text-on-accent)' : 'var(--text)' }}>
                          Satellite
                        </button>
                        <button onClick={() => setMapView('street')}
                          style={{ padding: '5px 12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.72rem', background: mapView === 'street' ? 'var(--gold)' : 'var(--bg-card)', color: mapView === 'street' ? 'var(--text-on-accent)' : 'var(--text)' }}>
                          Street
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Trap placement controls */}
                  {mapPin && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {!placingPin ? (
                          <button onClick={() => setPlacingPin(true)}
                            style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(var(--green-rgb),0.3)', background: 'transparent', color: 'var(--green)', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'inherit' }}>
                            + Place Trap Location
                          </button>
                        ) : (
                          <button onClick={() => setPlacingPin(false)}
                            style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(var(--border-rgb),0.25)', background: 'transparent', color: 'rgba(var(--text-rgb),0.5)', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'inherit' }}>
                            Cancel
                          </button>
                        )}
                        {machPins.map((pin, idx) => (
                          <div key={pin.id} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(var(--green-rgb),0.06)', border: '1px solid rgba(var(--green-rgb),0.2)', borderRadius: 20, padding: '4px 10px 4px 6px', fontSize: '0.78rem' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: 'var(--green)', color: 'var(--text-on-accent)', fontWeight: 900, fontSize: '0.68rem', flexShrink: 0 }}>{idx + 1}</span>
                            <span style={{ color: 'rgba(var(--text-rgb),0.7)', fontWeight: 600 }}>Trap {idx + 1}</span>
                            <button onClick={() => setMachPins((prev) => prev.filter((p) => p.id !== pin.id))}
                              style={{ background: 'none', border: 'none', color: 'rgba(var(--text-rgb),0.35)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: 0, fontFamily: 'inherit', marginLeft: 2 }}>×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Services — guided configurator */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(var(--border-rgb),0.12)', marginBottom: 8, marginTop: 20 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)' }}>Services</span>
            </div>
            <div className="card" style={{ marginBottom: 8 }}>
              <ServiceConfigurator onChange={setServiceLines} onConfigChange={setServiceConfig} />
            </div>

            {/* Products (auto-populated from service config) */}
            <MultiSelect
              title="Products to Purchase"
              catalog={PRODUCTS}
              qtys={productQtys}
              onChange={(label, n) => setQty(setProductQtys, label, n)}
            />

            {/* Service add-ons */}
            <MultiSelect
              title="Add-Ons"
              catalog={SERVICE_ADDONS}
              qtys={addonQtys}
              onChange={(label, n) => setQty(setAddonQtys, label, n)}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(var(--border-rgb),0.12)', marginBottom: 8, marginTop: 20 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)' }}>Notes</span>
            </div>
            <textarea rows={3} style={{ ...input, resize: 'vertical' }} placeholder="Expiry, discounts, special terms…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {/* Quote preview */}
          <div style={{ position: 'sticky', top: 72 }}>
            <div className="card">
              <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 16 }}>Quote Preview</div>

              {customerName && <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: 2 }}>{customerName}</div>}
              {customerEmail && <div style={{ fontSize: '0.8rem', color: 'rgba(var(--text-rgb),0.45)', marginBottom: 2 }}>{customerEmail}</div>}
              {customerAddress && <div style={{ fontSize: '0.78rem', color: 'rgba(var(--text-rgb),0.35)', marginBottom: 12 }}>{customerAddress}</div>}

              <div style={{ borderTop: '1px solid rgba(var(--border-rgb),0.12)', paddingTop: 12 }}>
                {allLines.length === 0 && <p style={{ color: 'rgba(var(--text-rgb),0.25)', fontSize: '0.82rem', fontStyle: 'italic' }}>Select a service to begin</p>}

                {/* Recurring lines */}
                {allLines.filter((l) => l.recurring).length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(var(--text-rgb),0.3)', marginBottom: 6 }}>Monthly recurring</div>
                    {allLines.filter((l) => l.recurring).map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '0.82rem', borderBottom: '1px solid rgba(var(--border-rgb),0.06)' }}>
                        <span style={{ color: 'rgba(var(--text-rgb),0.65)', flex: 1, paddingRight: 8 }}>{item.label}</span>
                        <span style={{ fontWeight: 700, color: 'var(--green)', whiteSpace: 'nowrap' }}>{item.amount != null ? `$${item.amount.toFixed(2)}/mo` : 'TBD'}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* One-time lines */}
                {allLines.filter((l) => !l.recurring).length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(var(--text-rgb),0.3)', marginBottom: 6 }}>One-time</div>
                    {allLines.filter((l) => !l.recurring).map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '0.82rem', borderBottom: '1px solid rgba(var(--border-rgb),0.06)' }}>
                        <span style={{ color: 'rgba(var(--text-rgb),0.65)', flex: 1, paddingRight: 8 }}>{item.label}</span>
                        <span style={{ fontWeight: 700, color: 'var(--info)', whiteSpace: 'nowrap' }}>{item.amount != null ? `$${item.amount.toFixed(2)}` : 'TBD'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Shipping toggle — shown when quote has shippable products */}
              {rawShipping > 0 && (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', color: shippingMode === 'free' ? 'var(--green)' : 'var(--info)', fontWeight: 700 }}>
                    <input
                      type="checkbox"
                      checked={shippingMode === 'free'}
                      onChange={(e) => setShippingMode(e.target.checked ? 'free' : 'auto')}
                      style={{ accentColor: 'var(--green)', cursor: 'pointer', width: 15, height: 15 }}
                    />
                    {shippingMode === 'free'
                      ? '🏠 Local delivery (free)'
                      : `🚚 Shipping — $${rawShipping.toFixed(2)}`}
                  </label>
                </div>
              )}

              {/* Tax — fixed 8.25% Austin rate */}
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'rgba(var(--text-rgb),0.4)', fontWeight: 600 }}>
                Tax: {taxRate}% (Austin, TX)
              </div>

              {allLines.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '2px solid rgba(var(--border-rgb),0.2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {hasRecurring && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.85rem', color: 'rgba(var(--text-rgb),0.6)', fontWeight: 700 }}>Monthly subtotal</span>
                      <span style={{ fontWeight: 900, color: 'var(--green)' }}>${recurringTotal.toFixed(2)}/mo</span>
                    </div>
                  )}
                  {hasOneTime && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.85rem', color: 'rgba(var(--text-rgb),0.6)', fontWeight: 700 }}>One-time subtotal</span>
                      <span style={{ fontWeight: 900, color: 'var(--info)' }}>${oneTimeTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {shippingTotal > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.85rem', color: 'rgba(var(--text-rgb),0.45)', fontWeight: 600 }}>🚚 Shipping</span>
                      <span style={{ fontWeight: 700, color: 'rgba(var(--text-rgb),0.7)' }}>${shippingTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {taxAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.85rem', color: 'rgba(var(--text-rgb),0.45)', fontWeight: 600 }}>Tax ({taxRate}%)</span>
                      <span style={{ fontWeight: 700, color: 'rgba(var(--text-rgb),0.7)' }}>${taxAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {(shippingTotal > 0 || taxAmount > 0) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid rgba(var(--border-rgb),0.15)' }}>
                      <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 800 }}>Total due</span>
                      <span style={{ fontWeight: 900, fontSize: '1rem', color: 'var(--gold)' }}>${grandTotal.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              {notes && <p style={{ fontSize: '0.78rem', color: 'rgba(var(--text-rgb),0.4)', marginTop: 12, borderTop: '1px solid rgba(var(--border-rgb),0.1)', paddingTop: 10 }}>{notes}</p>}

              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Pay Now — opens Stripe checkout directly */}
                <button
                  onClick={payNow}
                  disabled={checkingOut || allLines.filter(l => l.amount > 0).length === 0}
                  style={{ padding: '13px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 900, fontSize: '0.95rem', fontFamily: 'inherit', background: checkingOut || allLines.filter(l => l.amount > 0).length === 0 ? 'rgba(var(--green-rgb),0.15)' : 'var(--green)', color: checkingOut || allLines.filter(l => l.amount > 0).length === 0 ? 'rgba(var(--text-rgb),0.4)' : 'var(--text-on-accent)', opacity: checkingOut ? 0.7 : 1 }}>
                  {checkingOut ? 'Opening checkout…' : '✓ Approve & Pay Now'}
                </button>
                {checkoutError && <div style={{ fontSize: '0.78rem', color: 'var(--danger)', textAlign: 'center' }}>{checkoutError}</div>}

                <div style={{ display: 'flex', gap: 6 }}>
                  {sent ? (
                    <div style={{ flex: 1, padding: '9px', borderRadius: 6, background: 'rgba(var(--green-rgb),0.08)', border: '1px solid rgba(var(--green-rgb),0.2)', color: 'var(--green)', fontSize: '0.82rem', fontWeight: 700, textAlign: 'center' }}>Sent ✓</div>
                  ) : (
                    <button onClick={sendQuote} disabled={sending || !customerEmail}
                      style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', cursor: customerEmail ? 'pointer' : 'not-allowed', fontWeight: 800, fontSize: '0.82rem', fontFamily: 'inherit', background: customerEmail ? 'var(--gold)' : 'rgba(var(--gold-rgb),0.2)', color: customerEmail ? 'var(--text-on-accent)' : 'rgba(var(--text-rgb),0.3)', opacity: sending ? 0.7 : 1 }}>
                      {sending ? 'Sending…' : 'Email Quote'}
                    </button>
                  )}
                  <button onClick={copyQuoteLink} style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid rgba(var(--info-rgb),0.3)', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', fontFamily: 'inherit', background: linkCopied ? 'rgba(var(--info-rgb),0.1)' : 'transparent', color: linkCopied ? 'var(--info)' : 'rgba(var(--info-rgb),0.7)' }}>
                    {linkCopied ? '✓ Copied!' : '🔗 Share Link'}
                  </button>
                </div>
                <button onClick={() => window.print()} style={{ padding: '9px', borderRadius: 8, border: '1px solid rgba(var(--border-rgb),0.25)', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', fontFamily: 'inherit', background: 'transparent', color: 'rgba(var(--text-rgb),0.6)' }}>
                  Print / PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      </PortalLayout>
    </>
  )
}
