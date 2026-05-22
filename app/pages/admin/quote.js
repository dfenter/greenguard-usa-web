import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { listAllCustomers } from '../../lib/stripe'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (session.email !== ADMIN_EMAIL) return { redirect: { destination: '/dashboard', permanent: false } }

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
  { label: 'Biogents CO₂ — 1 Trap',        price: 159.99, category: 'Biogents CO₂' },
  { label: 'Biogents CO₂ — 2 Traps',       price: 266.99, category: 'Biogents CO₂' },
  { label: 'Biogents CO₂ — 3 Traps',       price: 399.99, category: 'Biogents CO₂' },
  { label: 'Mosqitter Grand Rental',        price: 299.99, category: 'Mosqitter' },
  { label: 'Mosqitter Service',             price: 199.99, category: 'Mosqitter' },
  { label: 'Mosqitter Installation',        price: 199.99, category: 'Mosqitter' },
  { label: 'Tank-Only — 1 Tank',           price:  89.99, category: 'CO₂ Tanks' },
  { label: 'Tank-Only — 2 Tanks',          price: 159.99, category: 'CO₂ Tanks' },
  { label: 'Tank-Only — 3 Tanks',          price: 249.99, category: 'CO₂ Tanks' },
  { label: 'Tank-Only — 4 Tanks',          price: 279.99, category: 'CO₂ Tanks' },
  { label: 'Tank-Only — 6 Tanks',          price: 399.99, category: 'CO₂ Tanks' },
  { label: 'Tank-Only — 10 Tanks',         price: 889.98, category: 'CO₂ Tanks' },
  { label: 'Owned Biogents Maintenance',   price:  10.00, category: 'Maintenance' },
  { label: 'Owned Mosqitter Maintenance',  price:  30.00, category: 'Maintenance' },
  { label: 'Assessment (Free)',            price:   0.00, category: 'Other' },
  { label: 'Troubleshoot',                price:  79.99, category: 'Other' },
]

const ADDONS = [
  { label: 'CO₂ Tank Rental',              price: 124.99 },
  { label: 'BG Sweetscent',                price:  18.99 },
  { label: 'GreenGuard Barrier Treatment', price:  49.99 },
  { label: 'Trap Installation',            price:  80.00 },
  { label: 'Biogents Tank Hookup & Trap Maintenance', price: 10.00 },
  { label: 'Mosqitter Tank Hookup & Trap Maintenance', price: 30.00 },
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

// ── Main page ──────────────────────────────────────────────────────────────────

export default function QuoteBuilder({ customers }) {
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [systemIdx, setSystemIdx] = useState(0)
  const [addonQtys, setAddonQtys] = useState({}) // label → qty
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  function handleSelectCustomer(c) {
    setCustomerName(c.name)
    setCustomerEmail(c.email)
    setCustomerPhone(c.phone)
    setCustomerAddress(c.address)
  }

  function changeAddonQty(label, delta) {
    setAddonQtys((prev) => {
      const next = Math.max(0, (prev[label] || 0) + delta)
      const result = { ...prev }
      if (next === 0) delete result[label]; else result[label] = next
      return result
    })
  }

  const system = SYSTEMS[systemIdx]
  const addonLines = ADDONS.filter((a) => addonQtys[a.label] > 0).map((a) => ({
    label: addonQtys[a.label] > 1 ? `${a.label} ×${addonQtys[a.label]}` : a.label,
    amount: a.price ? a.price * addonQtys[a.label] : 0,
  }))
  const lineItems = [
    { label: system.label, amount: system.price },
    ...addonLines,
  ]
  const total = lineItems.reduce((s, l) => s + (l.amount || 0), 0)

  async function sendQuote() {
    if (!customerEmail) return
    setSending(true)
    await fetch('/api/admin/send-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: customerEmail, name: customerName, lineItems, total, notes }),
    })
    setSending(false)
    setSent(true)
    setTimeout(() => setSent(false), 5000)
  }

  const input = { width: '100%', padding: '9px 12px', boxSizing: 'border-box', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 8, background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.88rem', fontFamily: 'Nunito Sans, sans-serif', outline: 'none' }
  const lbl = { display: 'block', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.45)', marginBottom: 4 }
  const field = { marginBottom: 14 }
  const SECTION = { fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c9a84c', marginBottom: 12, marginTop: 24 }

  // Group systems by category for optgroup dropdown
  const categories = [...new Set(SYSTEMS.map((s) => s.category))]

  return (
    <>
      <Head><title>Quote Builder · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin>
        <div style={{ marginBottom: 24 }}>
          <span className="tag">Admin</span>
          <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Quote Builder</h1>
          <p style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.45)', margin: 0 }}>Build and email a service quote to a customer</p>
        </div>

        <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
          {/* Builder */}
          <div>
            {/* Customer lookup */}
            <CustomerSearch customers={customers} onSelect={handleSelectCustomer} />

            <div style={SECTION}>Customer Details</div>
            <div style={{ display: 'grid', gap: 10, marginBottom: 8 }}>
              <div style={field}>
                <label style={lbl}>Name</label>
                <input style={input} placeholder="Full name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div style={field}>
                <label style={lbl}>Email</label>
                <input style={input} type="email" placeholder="customer@email.com" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
              </div>
              <div style={field}>
                <label style={lbl}>Property Address</label>
                <input style={input} placeholder="123 Oak St, Austin TX 78701" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
              </div>
            </div>

            <div style={SECTION}>Service / System</div>
            <div style={field}>
              <select value={systemIdx} onChange={(e) => setSystemIdx(Number(e.target.value))} style={{ ...input, width: '100%' }}>
                {categories.map((cat) => (
                  <optgroup key={cat} label={cat}>
                    {SYSTEMS.map((s, i) => s.category === cat && (
                      <option key={i} value={i}>{s.label}{s.price ? ` — $${s.price.toFixed(2)}` : ' — Free'}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div style={SECTION}>Add-Ons</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
              {ADDONS.map((a) => {
                const qty = addonQtys[a.label] || 0
                const active = qty > 0
                return (
                  <span key={a.label} style={{ display: 'inline-flex', alignItems: 'center', margin: '0 6px 8px 0', borderRadius: 20, border: `1px solid ${active ? 'rgba(125,255,170,0.5)' : 'rgba(122,171,130,0.2)'}`, background: active ? 'rgba(125,255,170,0.1)' : 'transparent', overflow: 'hidden' }}>
                    {active && <button onClick={() => changeAddonQty(a.label, -1)} style={{ width: 24, height: 28, border: 'none', background: 'transparent', color: '#7dffaa', cursor: 'pointer', fontSize: '1rem', fontFamily: 'Nunito Sans, sans-serif' }}>−</button>}
                    <span onClick={() => !active && changeAddonQty(a.label, 1)} style={{ padding: active ? '0 4px' : '5px 12px', fontSize: '0.78rem', fontWeight: 700, color: active ? '#7dffaa' : 'rgba(212,230,202,0.5)', cursor: active ? 'default' : 'pointer', userSelect: 'none' }}>
                      {a.label}{a.price ? ` $${a.price.toFixed(2)}` : ''}{active ? ` ×${qty}` : ''}
                    </span>
                    {active && <button onClick={() => changeAddonQty(a.label, 1)} style={{ width: 24, height: 28, border: 'none', background: 'transparent', color: '#7dffaa', cursor: 'pointer', fontSize: '1rem', fontFamily: 'Nunito Sans, sans-serif' }}>+</button>}
                  </span>
                )
              })}
            </div>

            <div style={{ ...SECTION, marginTop: 20 }}>Notes (optional)</div>
            <textarea rows={3} style={{ ...input, resize: 'vertical' }} placeholder="Expiry, discounts, special terms…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {/* Quote preview */}
          <div style={{ position: 'sticky', top: 72 }}>
            <div className="card">
              <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c9a84c', marginBottom: 16 }}>Quote Preview</div>

              {customerName && <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: 2 }}>{customerName}</div>}
              {customerEmail && <div style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.45)', marginBottom: 2 }}>{customerEmail}</div>}
              {customerAddress && <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.35)', marginBottom: 14 }}>{customerAddress}</div>}

              <div style={{ borderTop: '1px solid rgba(122,171,130,0.12)', paddingTop: 14 }}>
                {lineItems.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '0.85rem', borderBottom: '1px solid rgba(122,171,130,0.06)' }}>
                    <span style={{ color: 'rgba(212,230,202,0.7)' }}>{item.label}</span>
                    <span style={{ fontWeight: 700 }}>{item.amount ? `$${item.amount.toFixed(2)}` : 'TBD'}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: '2px solid rgba(122,171,130,0.2)' }}>
                <span style={{ fontWeight: 900, fontSize: '1rem' }}>Total</span>
                <span style={{ fontWeight: 900, fontSize: '1.2rem', color: '#7dffaa' }}>${total.toFixed(2)}</span>
              </div>

              {notes && <p style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.4)', marginTop: 12, borderTop: '1px solid rgba(122,171,130,0.1)', paddingTop: 10 }}>{notes}</p>}

              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sent ? (
                  <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(125,255,170,0.08)', border: '1px solid rgba(125,255,170,0.2)', color: '#7dffaa', fontSize: '0.85rem', fontWeight: 700, textAlign: 'center' }}>
                    Quote sent ✓
                  </div>
                ) : (
                  <button onClick={sendQuote} disabled={sending || !customerEmail}
                    style={{ padding: '11px', borderRadius: 8, border: 'none', cursor: customerEmail ? 'pointer' : 'not-allowed', fontWeight: 900, fontSize: '0.9rem', fontFamily: 'Nunito Sans, sans-serif', background: customerEmail ? '#c9a84c' : 'rgba(201,168,76,0.2)', color: customerEmail ? '#0d1a10' : 'rgba(212,230,202,0.3)', opacity: sending ? 0.7 : 1 }}>
                    {sending ? 'Sending…' : 'Email Quote to Customer'}
                  </button>
                )}
                <button onClick={() => window.print()}
                  style={{ padding: '9px', borderRadius: 8, border: '1px solid rgba(122,171,130,0.25)', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', fontFamily: 'Nunito Sans, sans-serif', background: 'transparent', color: 'rgba(212,230,202,0.6)' }}>
                  Print / Save PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      </PortalLayout>
    </>
  )
}
