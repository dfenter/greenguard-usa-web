import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { listAllCustomers } from '../../lib/stripe'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }

  const raw = await listAllCustomers()
  const customers = raw.map((c) => ({
    id: c.id,
    name: c.name || '',
    email: c.email || '',
    phone: c.phone || '',
    address: c.address?.line1 || '',
  })).filter((c) => c.email || c.name)

  return { props: { customers } }
}

// ── Pricing catalog ────────────────────────────────────────────────────────────

const SYSTEMS = [
  // Biogents Rental — trap + service included in monthly price
  { label: 'Biogents CO₂ Rental — 1 Trap',  price: 159.99, category: 'Biogents CO₂ — Rental', rental: true },
  { label: 'Biogents CO₂ Rental — 2 Traps', price: 266.99, category: 'Biogents CO₂ — Rental', rental: true },
  { label: 'Biogents CO₂ Rental — 3 Traps', price: 399.99, category: 'Biogents CO₂ — Rental', rental: true },
  // Biogents Owned — customer owns trap, hookup + maintenance only
  { label: 'Biogents Owned — Hookup & Maintenance (1 Trap)',  price: 10.00, category: 'Biogents CO₂ — Owned', rental: false },
  { label: 'Biogents Owned — Hookup & Maintenance (2 Traps)', price: 20.00, category: 'Biogents CO₂ — Owned', rental: false },
  { label: 'Biogents Owned — Hookup & Maintenance (3 Traps)', price: 30.00, category: 'Biogents CO₂ — Owned', rental: false },
  // Mosqitter — hookup included in pricing
  { label: 'Mosqitter Grand Rental',   price: 299.99, category: 'Mosqitter Grand', rental: true },
  { label: 'Mosqitter Service (Owned)', price: 199.99, category: 'Mosqitter Grand', rental: false },
  { label: 'Mosqitter Installation',   price: 199.99, category: 'Mosqitter Grand', rental: false },
  // CO₂ Tanks
  { label: 'CO₂ Tank Delivery — 1 Tank',  price:  89.99, category: 'CO₂ Tank Delivery' },
  { label: 'CO₂ Tank Delivery — 2 Tanks', price: 159.99, category: 'CO₂ Tank Delivery' },
  { label: 'CO₂ Tank Delivery — 3 Tanks', price: 249.99, category: 'CO₂ Tank Delivery' },
  { label: 'CO₂ Tank Delivery — 4 Tanks', price: 279.99, category: 'CO₂ Tank Delivery' },
  { label: 'CO₂ Tank Delivery — 6 Tanks', price: 399.99, category: 'CO₂ Tank Delivery' },
  { label: 'CO₂ Tank Delivery — 10 Tanks',price: 889.98, category: 'CO₂ Tank Delivery' },
  // Trap purchases (one-time) — confirm prices before quoting
  { label: 'Biogents BG-Mosquitaire — Purchase',    price: null,   category: 'Trap Purchase', oneTime: true },
  { label: 'Mosqitter Grand — Purchase',            price: null,   category: 'Trap Purchase', oneTime: true },
  // Tank purchases (one-time)
  { label: 'CO₂ Tank — Purchase',  price: 179.99, category: 'Tank Purchase', oneTime: true },
  { label: 'CO₂ Tank Purchase — 10lb',  price: 139.99, category: 'Tank Purchase', oneTime: true },
  { label: 'CO₂ Tank Purchase — 20lb',  price: 189.99, category: 'Tank Purchase', oneTime: true },
  { label: 'CO₂ Tank Purchase — 50lb',  price: 299.99, category: 'Tank Purchase', oneTime: true },
  // Accessories (one-time)
  { label: 'CO₂ Regulator',                        price: null,   category: 'Accessories', oneTime: true },
  { label: 'CO₂ Tank Washer',                      price: null,   category: 'Accessories', oneTime: true },
  { label: 'Biogents Power Supply',                price: null,   category: 'Accessories', oneTime: true },
  { label: 'Biogents Power Supply 30ft Extension', price: null,   category: 'Accessories', oneTime: true },
  { label: 'Biogents Trap Net',                    price: null,   category: 'Accessories', oneTime: true },
  { label: 'Biogents Funnel',                      price: null,   category: 'Accessories', oneTime: true },
  { label: 'BG Sweetscent Bait Pack',              price:  18.99, category: 'Accessories', oneTime: true },
  { label: '50ft Extension Cord',                  price: null,   category: 'Accessories', oneTime: true },
  { label: '100ft Extension Cord',                 price: null,   category: 'Accessories', oneTime: true },
  { label: 'Splitter',                             price: null,   category: 'Accessories', oneTime: true },
  { label: '9V Batteries (4-pack)',                price: null,   category: 'Accessories', oneTime: true },
  // Other
  { label: 'Assessment (Free)', price: 0.00, category: 'Other' },
  { label: 'Troubleshoot',      price: 79.99, category: 'Other' },
]

// Mosqitter tank hookup removed — already included in Mosqitter pricing
const ADDONS = [
  { label: 'CO₂ Tank & Timer Rental',      price: 124.99 },
  { label: 'BG Sweetscent',                price:  18.99 },
  { label: 'GreenGuard Barrier Treatment', price:  49.99 },
  { label: 'Trap Installation',            price:  80.00 },
  { label: 'Timer Installation',           price:  29.99 },
  { label: 'Trap Maintenance (1 trap)',    price:  29.99 },
  { label: 'Trap Maintenance (2 traps)',   price:  49.99 },
  { label: 'Weekend Surcharge',            price:  25.00 },
  { label: 'CO₂ Regulator',               price: null },
  { label: 'CO₂ Tank Washer',             price: null },
  { label: '50ft Extension Cord',         price: null },
  { label: '100ft Extension Cord',        price: null },
  { label: 'Biogents Power Supply',       price: null },
  { label: 'Biogents Trap Net',           price: null },
  { label: 'Biogents Funnel',             price: null },
  { label: '9V Batteries',               price: null },
]

// ── Multi-select dropdown ──────────────────────────────────────────────────────

function MultiSelect({ title, catalog, qtys, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = catalog.filter((item) => qtys[item.label] > 0)
  const categories = [...new Set(catalog.map((i) => i.category))]
  const total = catalog.reduce((s, i) => s + ((qtys[i.label] || 0) * (i.price || 0)), 0)

  return (
    <div ref={ref} style={{ marginBottom: 20 }}>
      {/* Selected items */}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {selected.map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(125,255,170,0.08)', border: '1px solid rgba(125,255,170,0.25)', borderRadius: 20, padding: '3px 4px 3px 12px', fontSize: '0.78rem', fontWeight: 700, color: '#7dffaa' }}>
              <span>{item.label}{item.price ? ` · $${item.price.toFixed(2)}` : ''}</span>
              <button onClick={() => onChange(item.label, -1)} style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(125,255,170,0.15)', color: '#7dffaa', cursor: 'pointer', fontFamily: 'Nunito Sans, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
              <span style={{ color: 'rgba(212,230,202,0.5)', fontSize: '0.75rem', minWidth: 14, textAlign: 'center' }}>{qtys[item.label]}</span>
              <button onClick={() => onChange(item.label, 1)} style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(125,255,170,0.15)', color: '#7dffaa', cursor: 'pointer', fontFamily: 'Nunito Sans, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
            </div>
          ))}
        </div>
      )}

      {/* Dropdown trigger */}
      <div style={{ position: 'relative' }}>
        <button onClick={() => setOpen((o) => !o)} style={{ width: '100%', padding: '9px 14px', borderRadius: 8, border: '1px dashed rgba(122,171,130,0.3)', background: 'transparent', color: 'rgba(212,230,202,0.5)', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', fontFamily: 'Nunito Sans, sans-serif', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>+ Add {title}</span>
          {total > 0 && <span style={{ color: '#7dffaa', fontWeight: 900 }}>${total.toFixed(2)}</span>}
        </button>

        {open && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#0d1a10', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 8, zIndex: 60, maxHeight: 340, overflowY: 'auto', marginTop: 4 }}>
            {categories.map((cat) => (
              <div key={cat}>
                <div style={{ padding: '8px 14px 4px', fontSize: '0.65rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.3)', position: 'sticky', top: 0, background: '#0d1a10' }}>{cat}</div>
                {catalog.filter((i) => i.category === cat).map((item) => {
                  const qty = qtys[item.label] || 0
                  const tag = item.oneTime ? '🛒' : item.rental ? '📅' : item.rental === false ? '🔧' : ''
                  return (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid rgba(122,171,130,0.06)', background: qty > 0 ? 'rgba(125,255,170,0.04)' : 'transparent' }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '0.83rem', color: qty > 0 ? '#7dffaa' : 'rgba(212,230,202,0.75)', fontWeight: qty > 0 ? 700 : 500 }}>{tag} {item.label}</span>
                        {item.price != null
                          ? <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'rgba(212,230,202,0.4)' }}>${item.price.toFixed(2)}{!item.oneTime ? '/mo' : ''}</span>
                          : <span style={{ marginLeft: 8, fontSize: '0.72rem', color: 'rgba(201,168,76,0.5)' }}>price TBD</span>
                        }
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {qty > 0 && <button onClick={() => onChange(item.label, -1)} style={{ width: 24, height: 24, borderRadius: '50%', border: '1px solid rgba(125,255,170,0.3)', background: 'transparent', color: '#7dffaa', cursor: 'pointer', fontFamily: 'Nunito Sans, sans-serif' }}>−</button>}
                        {qty > 0 && <span style={{ fontSize: '0.82rem', fontWeight: 700, minWidth: 16, textAlign: 'center', color: '#7dffaa' }}>{qty}</span>}
                        <button onClick={() => onChange(item.label, 1)} style={{ width: 24, height: 24, borderRadius: '50%', border: '1px solid rgba(122,171,130,0.25)', background: qty > 0 ? 'rgba(125,255,170,0.1)' : 'transparent', color: qty > 0 ? '#7dffaa' : 'rgba(212,230,202,0.4)', cursor: 'pointer', fontFamily: 'Nunito Sans, sans-serif' }}>+</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Customer autocomplete ──────────────────────────────────────────────────────

function CustomerSearch({ customers, onSelect }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const filtered = query.length < 2 ? [] : customers.filter((c) => {
    const q = query.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
  }).slice(0, 8)

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.45)', marginBottom: 4 }}>
        Find Existing Customer
      </label>
      <input
        type="text"
        placeholder="Type name or email to search…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        style={{ width: '100%', padding: '9px 12px', boxSizing: 'border-box', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 8, background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.88rem', fontFamily: 'Nunito Sans, sans-serif', outline: 'none' }}
      />
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#0d1a10', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 8, zIndex: 50, maxHeight: 240, overflowY: 'auto', marginTop: 4 }}>
          {filtered.map((c) => (
            <div key={c.id} onClick={() => { onSelect(c); setQuery(''); setOpen(false) }}
              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(122,171,130,0.08)' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(122,171,130,0.08)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{c.name || c.email}</div>
              <div style={{ fontSize: '0.75rem', color: 'rgba(212,230,202,0.45)' }}>{c.email}{c.address ? ` · ${c.address}` : ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Per-trap pricing for Biogents CO₂ rental
const BG_RENTAL_PRICE = { 1: 159.99, 2: 266.99, 3: 399.99 }
// Hookup fee per trap for Biogents owned on tank service, or tank-only customers
const BG_HOOKUP_PER_TRAP = 10.00
// Biogents Non-CO₂ (customer owns trap)
const BG_NONCO2_PER_TRAP = 10.00
// Mosqitter — $129.99 all-in (tank hookup, bait, maintenance included)
const MQ_PRICE = { rental: 299.99, service: 129.99, install: 199.99 }
// CO₂ tank exchange — 20lb tanks only ($39 delivery + $49.99/tank)
const TANK_PRICE = { 1: 89.99, 2: 139.99, 3: 189.99 }

// Products catalog (one-time purchases only)
const PRODUCTS = [
  // Traps
  { label: 'Biogents BG-Mosquitaire',              price:  279.99, category: 'Trap Purchase', oneTime: true },
  { label: 'Mosqitter Grand',                      price: 1849.99, category: 'Trap Purchase', oneTime: true },
  { label: 'Biogents Timer',                       price:  179.99, category: 'Trap Purchase', oneTime: true },
  // Tanks
  { label: 'CO₂ Tank — 20lb (empty)',             price:  199.99, category: 'Tank Purchase', oneTime: true },
  // Accessories — prices match rounds catalog exactly
  { label: 'CO₂ Regulator',                       price:  119.99, category: 'Accessories',   oneTime: true },
  { label: 'CO₂ Tank Washer',                     price:    5.00, category: 'Accessories',   oneTime: true },
  { label: 'Biogents Power Supply',               price:   36.99, category: 'Accessories',   oneTime: true },
  { label: 'Biogents Power Supply 30ft Extension',price:   16.99, category: 'Accessories',   oneTime: true },
  { label: 'Biogents Trap Net',                   price:    6.99, category: 'Accessories',   oneTime: true },
  { label: 'Biogents Funnel',                     price:   10.50, category: 'Accessories',   oneTime: true },
  { label: '9V Batteries',                        price:    6.00, category: 'Accessories',   oneTime: true },
  { label: 'Splitter',                            price:    8.99, category: 'Accessories',   oneTime: true },
  { label: '50ft Extension Cord',                 price:   20.00, category: 'Accessories',   oneTime: true },
  { label: '100ft Extension Cord',               price:   40.00, category: 'Accessories',   oneTime: true },
  // Consumables
  { label: 'BG Sweetscent Bait Pack',             price:   18.99, category: 'Consumables',   oneTime: true },
  { label: 'Generic Bait Pack',                   price:   10.00, category: 'Consumables',   oneTime: true },
  { label: 'Larvicide Tablet',                    price:    4.00, category: 'Consumables',   oneTime: true },
]

// Service add-ons — now as multi-select dropdown
const SERVICE_ADDONS = [
  { label: 'CO₂ Tank & Timer Rental',      price: 124.99, category: 'Recurring Add-Ons' },
  { label: 'Tank Hookup & Maintenance',   price:  10.00, category: 'Recurring Add-Ons' },
  { label: 'GreenGuard Barrier Treatment', price:  49.99, category: 'Recurring Add-Ons' },
  { label: 'BG Sweetscent',               price:  18.99, category: 'Recurring Add-Ons' },
  { label: 'Generic Bait Pack',           price:  10.00, category: 'Recurring Add-Ons' },
  { label: 'Larvicide Tablet',            price:   4.00, category: 'Recurring Add-Ons' },
  { label: 'Trap Installation',           price:  80.00, category: 'One-Time Services' },
  { label: 'Timer Installation',          price:  29.99, category: 'One-Time Services' },
  { label: 'Trap Maintenance (1 trap)',   price:  10.00, category: 'One-Time Services' },
  { label: 'Trap Maintenance (2 traps)', price:  20.00, category: 'One-Time Services' },
  { label: 'Trap Maintenance (3 traps)', price:  30.00, category: 'One-Time Services' },
  { label: 'Weekend Surcharge',           price:  25.00, category: 'One-Time Services' },
  { label: 'Assessment',                  price:   0.00, category: 'One-Time Services' },
  { label: 'Troubleshoot',               price:  79.99, category: 'One-Time Services' },
]

// ── Guided service configurator ────────────────────────────────────────────────

function ServiceConfigurator({ onChange }) {
  const [system, setSystem] = useState(null)        // 'biogents-co2' | 'biogents-nonco2' | 'mosqitter' | 'tank'
  const [plan, setPlan] = useState(null)            // 'rental' | 'owned'
  const [trapCount, setTrapCount] = useState(1)
  const [onTankService, setOnTankService] = useState(null) // true | false (Biogents owned)
  const [mqPlan, setMqPlan] = useState(null)        // 'rental' | 'service'
  const [mqInstall, setMqInstall] = useState(false)
  const [tankCount, setTankCount] = useState(2)
  const [tankHookup, setTankHookup] = useState(false) // tank-only hookup add-on

  useEffect(() => {
    const lines = []

    // Biogents CO₂ rental
    if (system === 'biogents-co2' && plan === 'rental' && trapCount) {
      const price = BG_RENTAL_PRICE[trapCount]
      lines.push({ label: `Biogents CO₂ Rental — ${trapCount} Trap${trapCount > 1 ? 's' : ''} ($${(price / trapCount).toFixed(2)}/trap)`, amount: price, recurring: true })
    }
    // Biogents CO₂ owned — hookup only if on tank service
    if (system === 'biogents-co2' && plan === 'owned' && onTankService === true) {
      const price = BG_HOOKUP_PER_TRAP * trapCount
      lines.push({ label: `Biogents Hookup & Maintenance — ${trapCount} Trap${trapCount > 1 ? 's' : ''} ($${BG_HOOKUP_PER_TRAP}/trap)`, amount: price, recurring: true })
    }
    // Biogents Non-CO₂ (always owned, per trap)
    if (system === 'biogents-nonco2' && trapCount) {
      const price = BG_NONCO2_PER_TRAP * trapCount
      lines.push({ label: `Biogents Non-CO₂ Maintenance — ${trapCount} Trap${trapCount > 1 ? 's' : ''} ($${BG_NONCO2_PER_TRAP}/trap)`, amount: price, recurring: true })
    }
    // Mosqitter — $129.99 all-in (hookup, bait, maintenance included)
    if (system === 'mosqitter' && mqPlan) {
      const price = mqPlan === 'rental' ? MQ_PRICE.rental : MQ_PRICE.service
      const label = mqPlan === 'rental'
        ? 'Mosqitter Grand Rental — trap, hookup, bait & maintenance included'
        : 'Mosqitter Service — hookup, bait & maintenance included'
      lines.push({ label, amount: price, recurring: true })
      if (mqInstall) lines.push({ label: 'Mosqitter Installation', amount: MQ_PRICE.install, recurring: false })
    }
    // Tank delivery
    if (system === 'tank' && TANK_PRICE[tankCount]) {
      lines.push({ label: `CO₂ Tank Exchange — ${tankCount}× 20lb Tank${tankCount > 1 ? 's' : ''} ($39 delivery + $49.99/tank)`, amount: TANK_PRICE[tankCount], recurring: true })
      if (tankHookup) {
        lines.push({ label: `Tank Hookup & Maintenance — ${tankCount} Tank${tankCount > 1 ? 's' : ''} ($${BG_HOOKUP_PER_TRAP}/trap)`, amount: BG_HOOKUP_PER_TRAP * tankCount, recurring: true })
      }
    }
    onChange(lines)
  }, [system, plan, trapCount, onTankService, mqPlan, mqInstall, tankCount, tankHookup])

  const Q = { fontSize: '0.82rem', fontWeight: 800, color: 'rgba(212,230,202,0.7)', marginBottom: 8, marginTop: 16 }
  const chip = (active) => ({ display: 'inline-block', padding: '7px 16px', borderRadius: 20, border: `1px solid ${active ? 'rgba(125,255,170,0.5)' : 'rgba(122,171,130,0.2)'}`, background: active ? 'rgba(125,255,170,0.1)' : 'transparent', color: active ? '#7dffaa' : 'rgba(212,230,202,0.5)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', marginRight: 8, marginBottom: 8, userSelect: 'none', transition: 'all 0.12s' })
  const trapBtn = (n) => ({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 8, border: `1px solid ${trapCount === n ? 'rgba(125,255,170,0.5)' : 'rgba(122,171,130,0.2)'}`, background: trapCount === n ? 'rgba(125,255,170,0.12)' : 'transparent', color: trapCount === n ? '#7dffaa' : 'rgba(212,230,202,0.5)', fontWeight: 900, fontSize: '1rem', cursor: 'pointer', marginRight: 8, fontFamily: 'Nunito Sans, sans-serif' })

  return (
    <div>
      {/* Q1: System */}
      <div style={Q}>What system?</div>
      <div>
        {[
          ['biogents-co2',    'Biogents CO₂'],
          ['biogents-nonco2', 'Biogents Non-CO₂'],
          ['mosqitter',       'Mosqitter Grand'],
          ['tank',            'CO₂ Tank Delivery Only'],
        ].map(([val, label]) => (
          <span key={val} onClick={() => { setSystem(val); setPlan(null); setOnTankService(null); setMqPlan(null); setMqInstall(false); setTankHookup(false) }} style={chip(system === val)}>{label}</span>
        ))}
      </div>

      {/* Q2: Biogents CO₂ — rental or owned */}
      {system === 'biogents-co2' && (
        <>
          <div style={Q}>Rental or customer-owned trap?</div>
          <div>
            <span onClick={() => { setPlan('rental'); setOnTankService(null) }} style={chip(plan === 'rental')}>📅 Rental — we provide the trap</span>
            <span onClick={() => setPlan('owned')} style={chip(plan === 'owned')}>🔧 Owned — customer has trap</span>
          </div>
        </>
      )}

      {/* Q3: Biogents CO₂ — trap count */}
      {system === 'biogents-co2' && plan && (
        <>
          <div style={Q}>How many traps?</div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {[1, 2, 3].map((n) => (
              <button key={n} onClick={() => setTrapCount(n)} style={trapBtn(n)}>{n}</button>
            ))}
            {plan === 'rental' && BG_RENTAL_PRICE[trapCount] && (
              <span style={{ fontSize: '0.85rem', color: '#7dffaa', fontWeight: 900, marginLeft: 14 }}>
                ${BG_RENTAL_PRICE[trapCount].toFixed(2)}/mo
                <span style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.4)', marginLeft: 6 }}>(${(BG_RENTAL_PRICE[trapCount] / trapCount).toFixed(2)}/trap)</span>
              </span>
            )}
            {plan === 'owned' && (
              <span style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.45)', marginLeft: 14 }}>Hookup fee applies if on tank service</span>
            )}
          </div>
        </>
      )}

      {/* Q4: Biogents CO₂ owned — on tank service? */}
      {system === 'biogents-co2' && plan === 'owned' && trapCount && (
        <>
          <div style={Q}>Are they on CO₂ tank service with us?</div>
          <div>
            <span onClick={() => setOnTankService(true)} style={chip(onTankService === true)}>Yes — add hookup &amp; maintenance fee</span>
            <span onClick={() => setOnTankService(false)} style={chip(onTankService === false)}>No — customer self-manages</span>
          </div>
          {onTankService === true && (
            <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'rgba(201,168,76,0.7)', padding: '8px 12px', borderRadius: 6, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)' }}>
              $10/trap/mo × {trapCount} trap{trapCount > 1 ? 's' : ''} = ${(BG_HOOKUP_PER_TRAP * trapCount).toFixed(2)}/mo
            </div>
          )}
        </>
      )}

      {/* Biogents Non-CO₂ — trap count (always owned) */}
      {system === 'biogents-nonco2' && (
        <>
          <div style={Q}>How many traps?</div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {[1, 2, 3].map((n) => (
              <button key={n} onClick={() => setTrapCount(n)} style={trapBtn(n)}>{n}</button>
            ))}
            <span style={{ fontSize: '0.85rem', color: '#7dffaa', fontWeight: 900, marginLeft: 14 }}>
              ${(BG_NONCO2_PER_TRAP * trapCount).toFixed(2)}/mo
              <span style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.4)', marginLeft: 6 }}>(${BG_NONCO2_PER_TRAP}/trap — no CO₂ tanks)</span>
            </span>
          </div>
        </>
      )}

      {/* Mosqitter plan */}
      {system === 'mosqitter' && (
        <>
          <div style={Q}>Rental or customer-owned?</div>
          <div>
            <span onClick={() => setMqPlan('rental')} style={chip(mqPlan === 'rental')}>📅 Rental — ${MQ_PRICE.rental}/mo · all-in</span>
            <span onClick={() => setMqPlan('service')} style={chip(mqPlan === 'service')}>🔧 Owned — ${MQ_PRICE.service}/mo · hookup, bait &amp; maintenance included</span>
          </div>
          {mqPlan && (
            <>
              <div style={Q}>Installation needed?</div>
              <div>
                <span onClick={() => setMqInstall(true)} style={chip(mqInstall)}>Yes — +${MQ_PRICE.install.toFixed(2)} one-time</span>
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
            <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'rgba(201,168,76,0.7)', padding: '8px 12px', borderRadius: 6, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)' }}>
              $10/tank/mo × {tankCount} tank{tankCount > 1 ? 's' : ''} = ${(BG_HOOKUP_PER_TRAP * tankCount).toFixed(2)}/mo added
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function QuoteBuilder({ customers }) {
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [serviceLines, setServiceLines] = useState([])
  const [productQtys, setProductQtys] = useState({})
  const [addonQtys, setAddonQtys] = useState({})
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  async function copyQuoteLink() {
    const res = await fetch('/api/admin/quote-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerName, customerEmail, customerAddress, serviceLines, addonLines, productLines, total: recurringTotal + oneTimeTotal, recurringTotal, oneTimeTotal, notes }),
    })
    const { url } = await res.json()
    await navigator.clipboard.writeText(url).catch(() => window.prompt('Copy this link:', url))
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 4000)
  }

  function handleSelectCustomer(c) {
    setCustomerName(c.name); setCustomerEmail(c.email)
    setCustomerPhone(c.phone); setCustomerAddress(c.address)
  }

  function changeQty(setter, label, delta) {
    setter((prev) => {
      const next = Math.max(0, (prev[label] || 0) + delta)
      const result = { ...prev }
      if (next === 0) delete result[label]; else result[label] = next
      return result
    })
  }

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

  const allLines = [...serviceLines, ...productLines, ...addonLines]
  const recurringTotal = allLines.filter((l) => l.recurring).reduce((s, l) => s + (l.amount || 0), 0)
  const oneTimeTotal = allLines.filter((l) => !l.recurring).reduce((s, l) => s + (l.amount || 0), 0)
  const hasRecurring = serviceLines.some((l) => l.recurring)
  const hasOneTime = allLines.some((l) => !l.recurring)

  async function sendQuote() {
    if (!customerEmail) return
    setSending(true)
    await fetch('/api/admin/send-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: customerEmail, name: customerName, lineItems: allLines, total: recurringTotal + oneTimeTotal, notes }),
    })
    setSending(false); setSent(true)
    setTimeout(() => setSent(false), 5000)
  }

  const input = { width: '100%', padding: '9px 12px', boxSizing: 'border-box', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 8, background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.88rem', fontFamily: 'Nunito Sans, sans-serif', outline: 'none' }
  const lbl = { display: 'block', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.45)', marginBottom: 4 }
  const SECTION = { fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c9a84c', marginBottom: 12, marginTop: 28, paddingTop: 20, borderTop: '1px solid rgba(122,171,130,0.1)' }

  return (
    <>
      <Head><title>Quote Builder · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin>
        <div style={{ marginBottom: 24 }}>
          <span className="tag">Admin</span>
          <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Quote Builder</h1>
          <p style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.45)', margin: 0 }}>Build and email a service quote to a customer</p>
        </div>

        <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 28, alignItems: 'start' }}>
          <div>
            {/* Customer */}
            <CustomerSearch customers={customers} onSelect={handleSelectCustomer} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 4 }}>
              <div><label style={lbl}>Name</label><input style={input} placeholder="Full name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></div>
              <div><label style={lbl}>Email</label><input style={input} type="email" placeholder="customer@email.com" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} /></div>
            </div>
            <div style={{ marginBottom: 8 }}><label style={lbl}>Property Address</label><input style={input} placeholder="123 Oak St, Austin TX 78701" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} /></div>

            {/* Services — guided configurator */}
            <div style={SECTION}>Services</div>
            <div className="card" style={{ marginBottom: 8 }}>
              <ServiceConfigurator onChange={setServiceLines} />
            </div>

            {/* Service add-ons — grouped chips */}
            <div style={{ ...SECTION, marginTop: 20 }}>Add-Ons</div>
            <MultiSelect
              title="add-ons"
              catalog={SERVICE_ADDONS}
              qtys={addonQtys}
              onChange={(label, delta) => changeQty(setAddonQtys, label, delta)}
            />

            {/* Products — multi-select dropdown */}
            <div style={SECTION}>Products</div>
            <MultiSelect
              title="products to purchase"
              catalog={PRODUCTS}
              qtys={productQtys}
              onChange={(label, delta) => changeQty(setProductQtys, label, delta)}
            />

            <div style={{ ...SECTION, marginTop: 16 }}>Notes</div>
            <textarea rows={3} style={{ ...input, resize: 'vertical' }} placeholder="Expiry, discounts, special terms…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {/* Quote preview */}
          <div style={{ position: 'sticky', top: 72 }}>
            <div className="card">
              <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c9a84c', marginBottom: 16 }}>Quote Preview</div>

              {customerName && <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: 2 }}>{customerName}</div>}
              {customerEmail && <div style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.45)', marginBottom: 2 }}>{customerEmail}</div>}
              {customerAddress && <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.35)', marginBottom: 12 }}>{customerAddress}</div>}

              <div style={{ borderTop: '1px solid rgba(122,171,130,0.12)', paddingTop: 12 }}>
                {allLines.length === 0 && <p style={{ color: 'rgba(212,230,202,0.25)', fontSize: '0.82rem', fontStyle: 'italic' }}>Select a service to begin</p>}

                {/* Recurring lines */}
                {allLines.filter((l) => l.recurring).length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.3)', marginBottom: 6 }}>Monthly recurring</div>
                    {allLines.filter((l) => l.recurring).map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '0.82rem', borderBottom: '1px solid rgba(122,171,130,0.06)' }}>
                        <span style={{ color: 'rgba(212,230,202,0.65)', flex: 1, paddingRight: 8 }}>{item.label}</span>
                        <span style={{ fontWeight: 700, color: '#7dffaa', whiteSpace: 'nowrap' }}>{item.amount != null ? `$${item.amount.toFixed(2)}/mo` : 'TBD'}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* One-time lines */}
                {allLines.filter((l) => !l.recurring).length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.3)', marginBottom: 6 }}>One-time</div>
                    {allLines.filter((l) => !l.recurring).map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '0.82rem', borderBottom: '1px solid rgba(122,171,130,0.06)' }}>
                        <span style={{ color: 'rgba(212,230,202,0.65)', flex: 1, paddingRight: 8 }}>{item.label}</span>
                        <span style={{ fontWeight: 700, color: '#5bc4ff', whiteSpace: 'nowrap' }}>{item.amount != null ? `$${item.amount.toFixed(2)}` : 'TBD'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {allLines.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '2px solid rgba(122,171,130,0.2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {hasRecurring && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.6)', fontWeight: 700 }}>Monthly</span>
                      <span style={{ fontWeight: 900, color: '#7dffaa' }}>${recurringTotal.toFixed(2)}/mo</span>
                    </div>
                  )}
                  {hasOneTime && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.6)', fontWeight: 700 }}>One-time</span>
                      <span style={{ fontWeight: 900, color: '#5bc4ff' }}>${oneTimeTotal.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              {notes && <p style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.4)', marginTop: 12, borderTop: '1px solid rgba(122,171,130,0.1)', paddingTop: 10 }}>{notes}</p>}

              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sent ? (
                  <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(125,255,170,0.08)', border: '1px solid rgba(125,255,170,0.2)', color: '#7dffaa', fontSize: '0.85rem', fontWeight: 700, textAlign: 'center' }}>Quote sent ✓</div>
                ) : (
                  <button onClick={sendQuote} disabled={sending || !customerEmail}
                    style={{ padding: '11px', borderRadius: 8, border: 'none', cursor: customerEmail ? 'pointer' : 'not-allowed', fontWeight: 900, fontSize: '0.9rem', fontFamily: 'Nunito Sans, sans-serif', background: customerEmail ? '#c9a84c' : 'rgba(201,168,76,0.2)', color: customerEmail ? '#0d1a10' : 'rgba(212,230,202,0.3)', opacity: sending ? 0.7 : 1 }}>
                    {sending ? 'Sending…' : 'Email Quote'}
                  </button>
                )}
                <button onClick={copyQuoteLink} style={{ padding: '9px', borderRadius: 8, border: '1px solid rgba(91,196,255,0.3)', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', fontFamily: 'Nunito Sans, sans-serif', background: linkCopied ? 'rgba(91,196,255,0.1)' : 'transparent', color: linkCopied ? '#5bc4ff' : 'rgba(91,196,255,0.7)' }}>
                  {linkCopied ? '✓ Link Copied!' : '🔗 Copy Shareable Link'}
                </button>
                <button onClick={() => window.print()} style={{ padding: '9px', borderRadius: 8, border: '1px solid rgba(122,171,130,0.25)', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', fontFamily: 'Nunito Sans, sans-serif', background: 'transparent', color: 'rgba(212,230,202,0.6)' }}>
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
